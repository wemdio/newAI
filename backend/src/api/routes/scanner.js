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
 * Start realtime scanner
 */
router.post('/start', authenticateUser, asyncHandler(async (req, res) => {
  logger.info('Starting realtime scanner via API', {
    userId: req.userId
  });

  const result = await startRealtimeScanner();

  res.json({
    success: true,
    message: 'Realtime scanner started successfully',
    ...result
  });
}));

/**
 * POST /api/scanner/stop
 * Stop realtime scanner
 */
router.post('/stop', authenticateUser, asyncHandler(async (req, res) => {
  logger.info('Stopping realtime scanner via API', {
    userId: req.userId
  });

  const result = await stopRealtimeScanner();

  res.json({
    success: true,
    message: 'Realtime scanner stopped successfully',
    ...result
  });
}));

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



