import express from 'express';
import {
  startRealtimeScanner,
  stopRealtimeScanner,
  getScannerStatus
} from '../../services/realtimeScanner.js';
import { getSupabase } from '../../config/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const ADMIN_EMAILS = ['egorkanigin@polzaagency.ru', 'admin@leadparser.app'];

const requireAdmin = (req, res, next) => {
  const email = req.headers['x-user-email'];
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/scanner/status
 * Get scanner status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = getScannerStatus();

  // Global analysis kill-switch state (system_config['analysis_enabled'], default ON)
  let analysisEnabled = true;
  try {
    const { data } = await getSupabase()
      .from('system_config')
      .select('value')
      .eq('key', 'analysis_enabled')
      .single();
    analysisEnabled = data ? data.value !== false : true;
  } catch (err) {
    logger.warn('[ScannerAPI] Failed to read analysis_enabled', { error: err.message });
  }

  res.json({
    success: true,
    mode: 'realtime', // Always realtime now
    status,
    analysisEnabled,
    doubleCheckEnabled: process.env.DOUBLECHECK_MODE !== 'off'
  });
}));

/**
 * POST /api/scanner/toggle  (admin only)
 * Global kill-switch for AI analysis. Sets system_config['analysis_enabled'].
 * When false, realtimeScanner skips all AI calls (zero API cost) but keeps
 * running — survives Timeweb pause glitches and container restarts.
 * Takes effect within ~15s (scanner flag cache TTL).
 */
router.post('/toggle', requireAdmin, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) is required' });
  }

  const email = req.headers['x-user-email'];
  const { error } = await getSupabase()
    .from('system_config')
    .upsert({
      key: 'analysis_enabled',
      value: enabled,
      updated_by: email,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  if (error) {
    logger.error('[ScannerAPI] Analysis toggle failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to update setting' });
  }

  logger.info('[ScannerAPI] Analysis toggled', { enabled, by: email });
  res.json({
    success: true,
    message: `Analysis ${enabled ? 'enabled' : 'disabled'}`,
    enabled
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



