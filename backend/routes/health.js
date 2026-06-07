import express from 'express';

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint (no auth required)
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-phase1',
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
