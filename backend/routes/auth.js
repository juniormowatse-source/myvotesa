import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Citizen from '../models/Citizen.js';
import VerificationAttempt from '../models/VerificationAttempt.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { encryptData, hashData } from '../utils/encryption.js';

const router = express.Router();

// ============ VALIDATION MIDDLEWARE ============

const validateVerification = [
  body('id_number')
    .trim()
    .matches(/^\d{13}$/)
    .withMessage('SA ID must be exactly 13 digits'),
  body('first_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name contains invalid characters'),
  body('surname')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Surname must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Surname contains invalid characters'),
  body('phone_number')
    .trim()
    .customSanitizer(value => {
      if (!value) return value;
      let cleaned = value.replace(/\s+/g, '');
      if (cleaned.startsWith('0')) {
        return '+27' + cleaned.substring(1);
      }
      if (cleaned.startsWith('27')) {
        return '+' + cleaned;
      }
      if (!cleaned.startsWith('+')) {
        return '+' + cleaned;
      }
      return cleaned;
    })
    .matches(/^\+27\d{9}$/)
    .withMessage('Invalid South African phone number (International +27 format required)'),
  body('ward_id')
    .isInt({ min: 1, max: 999 })
    .withMessage('Invalid ward number')
];

// ============ STEP 1: REQUEST OTP ============
/**
 * POST /api/auth/request-otp
 * User submits ID + phone, system sends OTP via SMS
 */
router.post('/request-otp', validateVerification, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed: ' + errors.array()[0].msg, 400);
    }

    const { id_number, first_name, surname, phone_number, ward_id } = req.body;

    // Check rate limiting - max 3 OTP requests per phone per 24 hours
    const attemptCount = await VerificationAttempt.countDocuments({
      phone_number_hash: hashData(phone_number),
      created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      attempt_type: 'otp_request'
    });

    if (attemptCount >= 3) {
      logger.warn('Rate limit exceeded for OTP requests', { phone_hash: hashData(phone_number) });
      throw new AppError('Too many OTP requests. Try again tomorrow.', 429);
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashData(otp);

    // Store verification attempt
    const attempt = new VerificationAttempt({
      id_number_hash: hashData(id_number),
      phone_number_hash: hashData(phone_number),
      otp_hash: otpHash,
      first_name_encrypted: await encryptForStorage(first_name),
      surname_encrypted: await encryptForStorage(surname),
      ward_id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      attempt_type: 'otp_request',
      otp_expiry: new Date(Date.now() + 15 * 60 * 1000), // 15 min validity
      status: 'pending'
    });

    await attempt.save();

    // Send OTP via SMS (using Twilio or local SMS gateway)
    await sendOTP(phone_number, otp, id_number);

    logger.info('OTP sent', {
      phone_hash: hashData(phone_number),
      attempt_id: attempt._id
    });

    res.status(202).json({
      success: true,
      message: 'OTP sent to your RICA-registered phone number',
      attempt_id: attempt._id,
      otp_validity: '15 minutes'
    });

  } catch (error) {
    logger.error(`OTP request failed: ${error.message}`);
    next(error);
  }
});

// ============ STEP 2: VERIFY OTP & CREATE SESSION ============

/**
 * POST /api/auth/verify-otp
 * User submits OTP, system verifies and issues JWT
 */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { attempt_id, otp } = req.body;

    if (!attempt_id || !otp) {
      throw new AppError('Attempt ID and OTP required', 400);
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError('OTP must be 6 digits', 400);
    }

    // Retrieve attempt
    const attempt = await VerificationAttempt.findById(attempt_id);

    if (!attempt) {
      throw new AppError('Verification session expired or invalid', 400);
    }

    // Check expiry
    if (new Date() > attempt.otp_expiry) {
      attempt.status = 'expired';
      await attempt.save();
      throw new AppError('OTP expired. Request a new one.', 400);
    }

    // Check OTP attempts (max 3 incorrect)
    if (attempt.otp_attempts >= 3) {
      attempt.status = 'blocked';
      await attempt.save();
      logger.warn('OTP verification blocked - too many attempts', { attempt_id });
      throw new AppError('Too many incorrect OTP attempts. Request new OTP.', 429);
    }

    // Verify OTP
    const otpHash = hashData(otp);
    if (otpHash !== attempt.otp_hash) {
      attempt.otp_attempts = (attempt.otp_attempts || 0) + 1;
      await attempt.save();
      throw new AppError('Invalid OTP', 400);
    }

    // OTP verified - check or create citizen
    let citizen = await Citizen.findOne({
      id_number_hash: attempt.id_number_hash
    });

    if (!citizen) {
      // First-time registration
      citizen = new Citizen({
        id_number_hash: attempt.id_number_hash,
        first_name_encrypted: attempt.first_name_encrypted,
        surname_encrypted: attempt.surname_encrypted,
        phone_number_hash: attempt.phone_number_hash,
        ward_id: attempt.ward_id,
        verification_method: 'otp_sassa',
        is_verified: true,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });
    } else {
      // Update last login
      citizen.last_login = new Date();
      citizen.last_ip = req.ip;
    }

    await citizen.save();

    // Mark attempt as verified
    attempt.status = 'verified';
    attempt.verified_at = new Date();
    attempt.citizen_id = citizen._id;
    await attempt.save();

    // Issue JWT tokens
    const accessToken = jwt.sign(
      {
        citizenId: citizen._id,
        ward_id: citizen.ward_id,
        role: 'citizen',
        verification_method: 'otp_sassa'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    const refreshToken = jwt.sign(
      { citizenId: citizen._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '30d' }
    );

    citizen.refresh_token = refreshToken;
    await citizen.save();

    logger.info('Citizen verified via OTP', {
      citizen_id: citizen._id,
      ward_id: citizen.ward_id
    });

    res.json({
      success: true,
      message: 'Identity verified successfully',
      accessToken,
      refreshToken,
      expiresIn: '7d',
      citizen: {
        id: citizen._id,
        ward_id: citizen.ward_id
      }
    });

  } catch (error) {
    logger.error(`OTP verification failed: ${error.message}`);
    next(error);
  }
});

// ============ STEP 3: REFRESH TOKEN ============

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 401);
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const citizen = await Citizen.findById(decoded.citizenId);
    if (!citizen || citizen.refresh_token !== refreshToken) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const newAccessToken = jwt.sign(
      {
        citizenId: citizen._id,
        ward_id: citizen.ward_id,
        role: 'citizen',
        verification_method: 'otp_sassa'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    res.json({
      success: true,
      accessToken: newAccessToken,
      expiresIn: '7d'
    });
  } catch (error) {
    next(error);
  }
});

// ============ LOGOUT ============

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { citizenId } = req.body;

    if (!citizenId) {
      throw new AppError('Citizen ID required', 400);
    }

    await Citizen.findByIdAndUpdate(citizenId, {
      refresh_token: null,
      last_logout: new Date()
    });

    logger.info('Citizen logged out', { citizen_id: citizenId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    next(error);
  }
});

// ============ HELPER FUNCTIONS ============

async function encryptForStorage(plaintext) {
  const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
  const encrypted = encryptData(plaintext, process.env.ENCRYPTION_KEY);
  return JSON.stringify(encrypted); // Store as JSON string
}

async function sendOTP(phoneNumber, otp, idNumber) {
  // Normalize phone number to international format
  const normalizedPhone = phoneNumber.startsWith('0')
    ? `27${phoneNumber.slice(1)}`
    : phoneNumber;

  // Use Twilio, local SMS gateway, or mock for testing
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implement Twilio or local SMS provider
    console.log(`[SMS] Sending OTP ${otp} to ${normalizedPhone}`);
  } else {
    // Development: log to console
    console.log(`[DEV-SMS] OTP: ${otp} for ID: ${idNumber}`);
  }

  // Audit logging
  logger.info('OTP SMS queued', {
    phone_hash: hashData(phoneNumber),
    timestamp: new Date().toISOString()
  });
}

export default router;
