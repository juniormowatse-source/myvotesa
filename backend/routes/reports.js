import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect as authenticateToken } from '../middleware/auth.js';
import Report from '../models/Report.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============ FILE UPLOAD CONFIGURATION ============
// PHASE 1: Store photos publicly (no E2EE) for civic leaderboard

const uploadDir = process.env.UPLOAD_DIR || './uploads/reports';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Public filename format: ward_sector_timestamp.jpg
    const uniqueName = `${req.user.ward_id}_${Date.now()}_${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png').split(',');
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPEG and PNG allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 }
});

// ============ VALIDATION MIDDLEWARE ============

const validateReport = [
  body('sector')
    .isIn(['water', 'sanitation', 'electricity', 'roads'])
    .withMessage('Invalid sector'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be 10-1000 characters')
];

// ============ ROUTES ============

/**
 * POST /api/reports
 * Create a new civic report (PUBLIC LEADERBOARD)
 */
router.post('/',
  authenticateToken,
  upload.single('evidence_photo'),
  validateReport,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed: ' + errors.array()[0].msg, 400);
      }

      const { sector, rating, description } = req.body;
      const { citizenId, ward_id } = req.user;

      // Create report - FULLY PUBLIC (no E2EE)
      const report = new Report({
        citizen_id: citizenId,
        ward_id,
        sector,
        rating: parseInt(rating),
        description,
        photo_url: req.file ? `/public/reports/${req.file.filename}` : null,
        photo_filename: req.file ? req.file.filename : null,
        status: 'published', // PHASE 1: Auto-publish all reports
        is_public: true,
        ip_address: req.ip
      });

      await report.save();

      logger.info(`Report published to public ledger`, {
        report_id: report._id,
        ward_id,
        sector,
        rating
      });

      res.status(201).json({
        success: true,
        message: 'Report committed to public civic ledger',
        reportId: report._id,
        photo_url: req.file ? `/public/reports/${req.file.filename}` : null
      });

    } catch (error) {
      // Clean up uploaded file if error occurs
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) logger.error('Failed to delete file: ' + err.message);
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/reports/ward/:wardId
 * Get all public reports for a ward (PUBLIC API - NO AUTH)
 * Used for civic leaderboard calculations
 */
router.get('/ward/:wardId', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    // PHASE 1: Return all reports (public)
    const reports = await Report.find({
      ward_id: parseInt(req.params.wardId),
      is_public: true
    })
      .select('sector rating description photo_url created_at')
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await Report.countDocuments({
      ward_id: parseInt(req.params.wardId),
      is_public: true
    });

    res.json({
      success: true,
      data: reports,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/leaderboard/:wardId
 * PUBLIC LEADERBOARD - Calculate sector performance ratings
 * Used by civic dashboard and politician accountability tracking
 */
router.get('/leaderboard/:wardId', async (req, res, next) => {
  try {
    const wardId = parseInt(req.params.wardId);

    // Aggregate ratings by sector
    const leaderboard = await Report.aggregate([
      {
        $match: {
          ward_id: wardId,
          is_public: true
        }
      },
      {
        $group: {
          _id: '$sector',
          avg_rating: { $avg: '$rating' },
          total_reports: { $sum: 1 },
          status: {
            $cond: [
              { $gte: ['$rating', 4] },
              'Performing',
              { $cond: [{ $gte: ['$rating', 3] }, 'At Risk', 'Critical'] }
            ]
          }
        }
      },
      {
        $sort: { avg_rating: 1 } // Worst first
      }
    ]);

    const sectorNames = {
      water: 'Water Supply',
      sanitation: 'Sanitation & Sewage',
      electricity: 'Electricity Grid',
      roads: 'Roads & Infrastructure'
    };

    const formatted = leaderboard.map(item => ({
      sector: sectorNames[item._id] || item._id,
      sector_code: item._id,
      avg_rating: Math.round(item.avg_rating * 100) / 100,
      total_reports: item.total_reports,
      status: item.avg_rating >= 4 ? 'Performing' : item.avg_rating >= 3 ? 'At Risk' : 'Critical',
      urgency: item.avg_rating < 2 ? 'EMERGENCY' : item.avg_rating < 3 ? 'HIGH' : 'MEDIUM'
    }));

    res.json({
      success: true,
      ward_id: wardId,
      leaderboard: formatted,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/stats/ward/:wardId
 * PUBLIC STATISTICS - Ward performance overview
 */
router.get('/stats/ward/:wardId', async (req, res, next) => {
  try {
    const wardId = parseInt(req.params.wardId);

    const stats = await Report.aggregate([
      {
        $match: {
          ward_id: wardId,
          is_public: true
        }
      },
      {
        $facet: {
          total_reports: [{ $count: 'count' }],
          avg_rating: [{ $group: { _id: null, avg: { $avg: '$rating' } } }],
          rating_distribution: [
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ],
          critical_issues: [
            { $match: { rating: { $lt: 2 } } },
            { $count: 'count' }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      ward_id: wardId,
      stats: {
        total_reports: stats[0].total_reports[0]?.count || 0,
        avg_rating: Math.round((stats[0].avg_rating[0]?.avg || 0) * 100) / 100,
        rating_distribution: stats[0].rating_distribution,
        critical_issues: stats[0].critical_issues[0]?.count || 0
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

export default router;
