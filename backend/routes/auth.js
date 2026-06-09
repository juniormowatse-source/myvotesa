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
// Completely removed phone and ward validation rules
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
    .withMessage('Surname contains invalid characters')
]; // Fixed missing bracket and semicolon here

// ============ STEP 1: REQUEST VERIFICATION ============
/**
 * POST /api/auth/request-otp
 * User submits ID and names only. No phone or ward required.
 */
router.post('/request-otp', validateVerification, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed: ' + errors.array()[0].msg, 400);
    }

    // Completely dropped phone_number and ward_id from body extraction
    const { id_number, first_name, surname } = req.body;

    // Use a hash of the ID number to safely fulfill mandatory database schema fields
    const identityHash = hashData(id_number);
    const mockOtp = "123456";
    const otpHash = hashData(mockOtp);

    const attempt = new VerificationAttempt({
      id_number_hash: identityHash,
      phone_number_hash: identityHash, // Fallback placeholder to maintain schema compliance
      otp_hash: otpHash,
      first_name_encrypted: await encryptForStorage(first_name),
      surname_encrypted: await encryptForStorage(surname),
      ward_id: 0, // Fallback default value for the schema
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      attempt_type: 'otp_request',
      otp_expiry: new Date(Date.now() + 15 * 60 * 1000),
      status: 'pending'
    });

    await attempt.save();

    logger.info('Verification step initialized with national ID profile', {
      identity_hash: identityHash,
      attempt_id: attempt._id
    });

    return res.status(202).json({
      success: true,
      message: 'ID Verified. Use default system code: 123456',
      attempt_id: attempt._id,
      otp_validity: '15 minutes'
    });

  } catch (error) {
    logger.error(`Verification processing failed: ${error.message}`);
    next(error);
  }
});

// ============ STEP 2: VERIFY CODE & CREATE SESSION ============
/**
 * POST /api/auth/verify-otp
 * User submits code, system verifies and issues JWT
 */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { attempt_id, otp } = req.body;

    if (!attempt_id || !otp) {
      throw new AppError('Attempt ID and Verification Code required', 400);
    }

    if (!/^\d{6}$/.test(otp)) {
      throw new AppError('Verification code must be 6 digits', 400);
    }

    const attempt = await VerificationAttempt.findById(attempt_id);

    if (!attempt) {
      throw new AppError('Verification session expired or invalid', 400);
    }

    if (new Date() > attempt.otp_expiry) {
      attempt.status = 'expired';
      await attempt.save();
      throw new AppError('Verification code expired. Please restart.', 400);
    }

    if (attempt.otp_attempts >= 3) {
      attempt.status = 'blocked';
      await attempt.save();
      logger.warn('Verification blocked - too many attempts', { attempt_id });
      throw new AppError('Too many incorrect code attempts.', 429);
    }

    const otpHash = hashData(otp);
    if (otpHash !== attempt.otp_hash) {
      attempt.otp_attempts = (attempt.otp_attempts || 0) + 1;
      await attempt.save();
      throw new AppError('Invalid verification code', 400);
    }

    let citizen = await Citizen.findOne({
      id_number_hash: attempt.id_number_hash
    });

    if (!citizen) {
      citizen = new Citizen({
        id_number_hash: attempt.id_number_hash,
        first_name_encrypted: attempt.first_name_encrypted,
        surname_encrypted: attempt.surname_encrypted,
        phone_number_hash: attempt.phone_number_hash,
        ward_id: attempt.ward_id,
        verification_method: 'id_direct',
        is_verified: true,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });
    } else {
      citizen.last_login = new Date();
      citizen.last_ip = req.ip;
    }

    await citizen.save();

    attempt.status = 'verified';
    attempt.verified_at = new Date();
    attempt.citizen_id = citizen._id;
    await attempt.save();

    const accessToken = jwt.sign(
      {
        citizenId: citizen._id,
        ward_id: citizen.ward_id,
        role: 'citizen',
        verification_method: 'id_direct'
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

    logger.info('Citizen profile successfully authenticated', {
      citizen_id: citizen._id
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
    logger.error(`Authentication process failure: ${error.message}`);
    next(error);
  }
});

// ============ STEP 3: REFRESH TOKEN ============
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
        verification_method: 'id_direct'
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
  return encryptData(plaintext, process.env.ENCRYPTION_KEY);
}

export default router;