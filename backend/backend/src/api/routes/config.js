import express from 'express';
import { getUserConfig, saveUserConfig } from '../../database/queries.js';
import { validateCriteria, EXAMPLE_PROMPTS } from '../../prompts/promptBuilder.js';
import { testAnalysis } from '../../services/messageAnalyzer.js';
import { testConnection as testOpenRouterConnection } from '../../config/openrouter.js';
import { testChannelAccess } from '../../config/telegram.js';
import { authenticateUser } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/config
 * Get user configuration
 */
router.get('/', authenticateUser, asyncHandler(async (req, res) => {
  logger.info('GET /api/config request', { userId: req.userId });
  
  const config = await getUserConfig(req.userId);
  
  if (!config) {
    logger.warn('Config not found', { userId: req.userId });
    return res.status(404).json({
      error: 'Configuration not found',
      message: 'No configuration exists for this user'
    });
  }
  
  logger.info('Config found', { userId: req.userId, configId: config.id });
  
  // Don't send API key in response (security)
  const safeConfig = {
    ...config,
    openrouter_api_key: config.openrouter_api_key ? '***' + config.openrouter_api_key.slice(-4) : null
  };
  
  res.json({
    success: true,
    config: safeConfig
  });
}));

/**
 * POST /api/config
 * Create or update user configuration
 */
const parseTelegramMinConfidence = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return NaN;
  }
  return parsed;
};

router.post('/', authenticateUser, asyncHandler(async (req, res) => {
  const {
    openrouter_api_key,
    lead_prompt,
    message_prompt,
    telegram_channel_id,
    is_active,
    telegram_min_confidence
  } = req.body;
  
  // Validate required fields
  if (!lead_prompt) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'lead_prompt is required'
    });
  }
  
  if (!openrouter_api_key || openrouter_api_key.trim().length === 0) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'openrouter_api_key is required'
    });
  }
  
  // Validate prompt
  const promptValidation = validateCriteria(lead_prompt);
  if (!promptValidation.valid) {
    return res.status(400).json({
      error: 'Invalid prompt',
      message: promptValidation.error
    });
  }
  
  const parsedTelegramMinConfidence = parseTelegramMinConfidence(telegram_min_confidence);
  if (Number.isNaN(parsedTelegramMinConfidence)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'telegram_min_confidence must be a number between 0 and 100'
    });
  }
  if (parsedTelegramMinConfidence !== undefined && (parsedTelegramMinConfidence < 0 || parsedTelegramMinConfidence > 100)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'telegram_min_confidence must be between 0 and 100'
    });
  }

  // Save configuration
  const config = await saveUserConfig(req.userId, {
    openrouter_api_key,
    lead_prompt,
    message_prompt: message_prompt || null,
    telegram_channel_id,
    is_active: is_active !== undefined ? is_active : true,
    ...(parsedTelegramMinConfidence !== undefined && { telegram_min_confidence: parsedTelegramMinConfidence })
  });
  
  logger.info('User configuration saved', { userId: req.userId });
  
  // Don't send API key in response
  const safeConfig = {
    ...config,
    openrouter_api_key: config.openrouter_api_key ? '***' + config.openrouter_api_key.slice(-4) : null
  };
  
  res.json({
    success: true,
    message: 'Configuration saved successfully',
    config: safeConfig
  });
}));

/**
 * PUT /api/config
 * Update specific fields of user configuration
 */
router.put('/', authenticateUser, asyncHandler(async (req, res) => {
  const existingConfig = await getUserConfig(req.userId);
  
  if (!existingConfig) {
    return res.status(404).json({
      error: 'Configuration not found',
      message: 'No configuration exists for this user. Use POST to create one.'
    });
  }
  
  const updates = {};
  
  if (req.body.openrouter_api_key !== undefined) {
    updates.openrouter_api_key = req.body.openrouter_api_key;
  }
  
  if (req.body.lead_prompt !== undefined) {
    const promptValidation = validateCriteria(req.body.lead_prompt);
    if (!promptValidation.valid) {
      return res.status(400).json({
        error: 'Invalid prompt',
        message: promptValidation.error
      });
    }
    updates.lead_prompt = req.body.lead_prompt;
  }
  
  if (req.body.message_prompt !== undefined) {
    updates.message_prompt = req.body.message_prompt || null;
  }
  
  if (req.body.telegram_channel_id !== undefined) {
    updates.telegram_channel_id = req.body.telegram_channel_id;
  }

  if (req.body.telegram_min_confidence !== undefined) {
    const parsedTelegramMinConfidence = parseTelegramMinConfidence(req.body.telegram_min_confidence);
    if (Number.isNaN(parsedTelegramMinConfidence)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'telegram_min_confidence must be a number between 0 and 100'
      });
    }
    if (parsedTelegramMinConfidence < 0 || parsedTelegramMinConfidence > 100) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'telegram_min_confidence must be between 0 and 100'
      });
    }
    updates.telegram_min_confidence = parsedTelegramMinConfidence;
  }
  
  if (req.body.is_active !== undefined) {
    updates.is_active = req.body.is_active;
  }
  
  const updatedConfig = await saveUserConfig(req.userId, {
    ...existingConfig,
    ...updates
  });
  
  logger.info('User configuration updated', { userId: req.userId, fields: Object.keys(updates) });
  
  const safeConfig = {
    ...updatedConfig,
    openrouter_api_key: updatedConfig.openrouter_api_key ? '***' + updatedConfig.openrouter_api_key.slice(-4) : null
  };
  
  res.json({
    success: true,
    message: 'Configuration updated successfully',
    config: safeConfig
  });
}));

/**
 * POST /api/config/test-prompt
 * Test user prompt with AI analysis
 */
router.post('/test-prompt', authenticateUser, strictLimiter, asyncHandler(async (req, res) => {
  const { lead_prompt, test_message, openrouter_api_key } = req.body;
  
  if (!lead_prompt) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'lead_prompt is required'
    });
  }
  
  if (!openrouter_api_key) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'openrouter_api_key is required for testing'
    });
  }
  
  // Validate prompt
  const promptValidation = validateCriteria(lead_prompt);
  if (!promptValidation.valid) {
    return res.status(400).json({
      error: 'Invalid prompt',
      message: promptValidation.error,
      extractedCriteria: promptValidation.extractedCriteria
    });
  }
  
  logger.info('Testing prompt', { userId: req.userId });
  
  // Run test analysis
  const result = await testAnalysis(lead_prompt, test_message, openrouter_api_key);
  
  res.json({
    success: result.success,
    ...result
  });
}));

/**
 * POST /api/config/test-openrouter
 * Test OpenRouter API connection
 */
router.post('/test-openrouter', authenticateUser, strictLimiter, asyncHandler(async (req, res) => {
  const { openrouter_api_key } = req.body;
  
  if (!openrouter_api_key) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'openrouter_api_key is required'
    });
  }
  
  logger.info('Testing OpenRouter connection', { userId: req.userId });
  
  const result = await testOpenRouterConnection(openrouter_api_key);
  
  res.json({
    success: result.success,
    message: result.message
  });
}));

/**
 * POST /api/config/test-telegram
 * Test Telegram channel access
 */
router.post('/test-telegram', authenticateUser, strictLimiter, asyncHandler(async (req, res) => {
  const { telegram_channel_id } = req.body;
  
  if (!telegram_channel_id) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'telegram_channel_id is required'
    });
  }
  
  logger.info('Testing Telegram channel access', { userId: req.userId, channelId: telegram_channel_id });
  
  const result = await testChannelAccess(telegram_channel_id);
  
  res.json({
    success: result.success,
    channel: result.channel
  });
}));

/**
 * GET /api/config/example-prompts
 * Get example prompts for users
 */
router.get('/example-prompts', (req, res) => {
  res.json({
    success: true,
    examples: EXAMPLE_PROMPTS
  });
});

/**
 * DELETE /api/config
 * Delete user configuration (deactivate)
 */
router.delete('/', authenticateUser, asyncHandler(async (req, res) => {
  const config = await getUserConfig(req.userId);
  
  if (!config) {
    return res.status(404).json({
      error: 'Configuration not found',
      message: 'No configuration exists for this user'
    });
  }
  
  // Instead of deleting, set to inactive
  await saveUserConfig(req.userId, {
    ...config,
    is_active: false
  });
  
  logger.info('User configuration deactivated', { userId: req.userId });
  
  res.json({
    success: true,
    message: 'Configuration deactivated successfully'
  });
}));

export default router;

