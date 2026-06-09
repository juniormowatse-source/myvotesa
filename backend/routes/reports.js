// backend/routes/reports.js
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Report from '../models/Report.js';

const router = express.Router();

// Priority 2: In-memory map tracking submissions securely
const citizenSubmissionMap = new Map();

// Multer parsing configuration for handling multipart/form-data images
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

/* ==========================================================================
   POST /api/reports (Write Layer)
   ========================================================================== */
router.post('/', upload.single('evidence'), async (req, res, next) => {
    try {
        const { citizen_id, ward_id, sector, rating, description, lat, lng } = req.body;

        // 1. Enforce strict field verification matching your schema requirements
        if (!citizen_id || !ward_id || !sector || !rating || !description) {
            return res.status(400).json({ success: false, error: "Missing required database schema attributes." });
        }

        /* ==========================================================================
           PRIORITY 2: ANTI-SPAM RATE LIMITER (PER DAY / SECTOR / WARD)
           ========================================================================== */
        const today = new Date().toISOString().slice(0, 10);
        const throttlingKey = `${citizen_id}-${sector}-${ward_id}-${today}`;

        if (citizenSubmissionMap.has(throttlingKey)) {
            return res.status(429).json({ 
                success: false, 
                error: "Integrity Guard: You have already submitted a ledger record for this specific sector in this ward today." 
            });
        }

        // 2. Map standard HTTP network identifiers to your audit fields
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.get('User-Agent');

        // 3. Assemble data payloads matching your exact schema layout
        const newReport = new Report({
            citizen_id, 
            ward_id: parseInt(ward_id, 10),
            sector,
            rating: parseInt(rating, 10),
            description: description.trim(),
            ip_address: ipAddress,
            user_agent: userAgent,
            // Maps cleanly if coordinates are collected client-side
            gps_coordinates: (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined
        });

        // Phase 1 media management hook:
        if (req.file) {
            newReport.photo_filename = `upload_${Date.now()}_${req.file.originalname}`;
            // Phase 2 will exchange this temporary line with your actual cloud bucket CDN URL string
            newReport.photo_url = `/assets/uploads/${newReport.photo_filename}`; 
        }

        // Save entry block directly to MongoDB
        await newReport.save();

        // Commit fingerprint verification token to free memory maps
        citizenSubmissionMap.set(throttlingKey, Date.now());

        // Housekeeping sweep routine
        for (const [storedKey, timestamp] of citizenSubmissionMap.entries()) {
            if (Date.now() - timestamp > 2 * 24 * 60 * 60 * 1000) {
                citizenSubmissionMap.delete(storedKey);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Report published automatically to public record.",
            reportId: newReport._id
        });

    } catch (error) {
        next(error); // Passes execution safely off to your default errorHandler.js middleware
    }
});

/* ==========================================================================
   GET /api/reports (Priority 3 Read Layer & Dashboard Aggregator)
   ========================================================================== */
router.get('/', async (req, res, next) => {
    try {
        const { ward_id, sector, status } = req.query;
        let queryFilter = { is_public: true }; // Only reveal public-facing ledger records

        if (ward_id) queryFilter.ward_id = parseInt(ward_id, 10);
        if (sector) queryFilter.sector = String(sector);
        if (status) queryFilter.status = String(status);

        const dataRecords = await Report.find(queryFilter)
            .populate('citizen_id', 'firstName surname') // Rehydrates standard public metadata safely
            .sort({ created_at: -1 })
            .limit(100);

        return res.status(200).json({
            success: true,
            count: dataRecords.length,
            reports: dataRecords
        });
    } catch (error) {
        next(error);
    }
});

export default router;