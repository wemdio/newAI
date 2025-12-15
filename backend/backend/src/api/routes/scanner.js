import express from 'express';
import {
  startRealtimeScanner,
  stopRealtimeScanner,
  getScannerStatus
} from '../../services/realtimeScanner.js';
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

  res.json({
    success: true,
    mode: 'realtime', // Always realtime now
    status,
    doubleCheckEnabled: process.env.DOUBLECHECK_MODE !== 'off'
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
 * @deprecated Manual scan is deprecated - realtimeScanner runs continuously with Gemini double-check
 */
router.post('/manual-scan', authenticateUser, asyncHandler(async (req, res) => {
  logger.warn('Manual scan endpoint is DEPRECATED', { userId: req.userId });

  res.json({
    success: false,
    message: 'Manual scan is deprecated. RealtimeScanner runs continuously and processes messages automatically with Gemini double-check.'
  });
}));

export default router;



