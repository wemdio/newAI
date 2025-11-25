import express from 'express';
import { runAudit } from '../../services/auditService.js';
import { authenticateUser } from '../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * Run retroactive lead audit
 * POST /api/audit/run
 */
router.post('/run', authenticateUser, async (req, res) => {
  try {
    const { 
      openRouterKey, 
      leadPrompt, 
      channelId, 
      daysBack 
    } = req.body;

    if (!openRouterKey || !leadPrompt || !channelId) {
      return res.status(400).json({ error: 'Missing required fields: openRouterKey, leadPrompt, channelId' });
    }

    const result = await runAudit(req.userId, {
      openRouterKey,
      leadPrompt,
      channelId,
      daysBack: daysBack || 7
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Audit endpoint error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;

