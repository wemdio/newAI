import express from 'express';
import {
  startRealtimeScanner,
  stopRealtimeScanner,
  getScannerStatus
} from '../../services/realtimeScanner.js';
import { runHourlyScan } from '../../jobs/hourlyScanner.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/scanner/status
 * Get scanner status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = getScannerStatus();
  const mode = process.env.SCAN_MODE || 'cron';

  res.json({
    success: true,
    mode,
    status
  });
}));

/**
 * POST /api/scanner/start
 * Start realtime scanner (REMOVED - scanner runs 24/7)
 * Each user controls their own analysis via is_active flag
 */
// SECURITY: Removed to prevent one company from controlling scanner for all companies
// Scanner now runs automatically 24/7, users control their own analysis via Configuration

/**
 * POST /api/scanner/stop
 * Stop realtime scanner (REMOVED - scanner runs 24/7)
 * Each user controls their own analysis via is_active flag
 */
// SECURITY: Removed to prevent one company from controlling scanner for all companies
// Scanner now runs automatically 24/7, users control their own analysis via Configuration

/**
 * POST /api/scanner/manual-scan
 * Trigger manual scan (like hourly cron)
 */
router.post('/manual-scan', authenticateUser, asyncHandler(async (req, res) => {
  logger.info('Manual scan triggered via API', {
    userId: req.userId
  });

  // Run in background
  runHourlyScan()
    .then(results => {
      logger.info('Manual scan completed', results);
    })
    .catch(error => {
      logger.error('Manual scan failed', {
        error: error.message
      });
    });

  res.json({
    success: true,
    message: 'Manual scan started in background'
  });
}));

export default router;



