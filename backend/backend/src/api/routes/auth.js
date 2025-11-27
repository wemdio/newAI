import express from 'express';
import crypto from 'crypto';
import { getSupabase } from '../../config/database.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * Verify Telegram Web App init data
 * Uses HMAC-SHA256 to verify data authenticity
 * 
 * @param {string} initData - Init data from Telegram Web App
 * @param {string} botToken - Bot token from Mini App bot (not lead posting bot)
 */
const verifyTelegramWebAppData = (initData, botToken) => {
  try {
    // Parse init data
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    // Create data check string
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');
    
    // Calculate secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Verify hash
    return calculatedHash === hash;
  } catch (error) {
    logger.error('Failed to verify Telegram data', { error: error.message });
    return false;
  }
};

/**
 * POST /api/auth/telegram
 * Authenticate user via Telegram Web App
 */
router.post('/telegram', asyncHandler(async (req, res) => {
  const { initData } = req.body;
  
  if (!initData) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'initData is required'
    });
  }
  
  // Parse user data from initData
  const urlParams = new URLSearchParams(initData);
  const userJson = urlParams.get('user');
  
  if (!userJson) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'User data not found in initData'
    });
  }
  
  let telegramUser;
  try {
    telegramUser = JSON.parse(userJson);
  } catch (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid user data format'
    });
  }
  
  logger.info('Telegram auth attempt', {
    telegramId: telegramUser.id,
    username: telegramUser.username
  });
  
  // Verify Telegram data signature (optional but recommended)
  // Use separate token for Mini App bot (not the same as lead posting bot)
  const miniAppBotToken = process.env.TELEGRAM_MINI_APP_BOT_TOKEN;
  
  if (miniAppBotToken) {
    const isValid = verifyTelegramWebAppData(initData, miniAppBotToken);
    if (!isValid) {
      logger.warn('Invalid Telegram Mini App signature', {
        telegramId: telegramUser.id
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Telegram data signature'
      });
    }
    logger.info('Telegram Mini App signature verified', {
      telegramId: telegramUser.id
    });
  } else {
    logger.warn('TELEGRAM_MINI_APP_BOT_TOKEN not set - skipping verification');
  }
  
  const supabase = getSupabase();
  
  try {
    // Check if user exists with this telegram_id in metadata
    const { data: users, error: searchError } = await supabase.auth.admin.listUsers();
    
    if (searchError) {
      throw searchError;
    }
    
    // Find user with matching telegram_id
    let existingUser = null;
    if (users && users.users) {
      existingUser = users.users.find(u => 
        u.user_metadata?.telegram_id === telegramUser.id
      );
    }
    
    if (existingUser) {
      // User exists - return user info with password for auto-login
      const storedPassword = existingUser.user_metadata?.telegram_password;
      
      logger.info('Telegram user found', {
        userId: existingUser.id,
        telegramId: telegramUser.id,
        hasStoredPassword: !!storedPassword
      });
      
      return res.json({
        success: true,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          password: storedPassword || null, // Send stored password for auto-login
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          telegram_first_name: telegramUser.first_name,
          telegram_last_name: telegramUser.last_name
        },
        message: 'User authenticated via Telegram'
      });
    }
    
    // User doesn't exist - create new user
    const email = `tg_${telegramUser.id}@telegram.user`;
    const password = crypto.randomBytes(32).toString('hex');
    
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username,
        telegram_first_name: telegramUser.first_name,
        telegram_last_name: telegramUser.last_name,
        auth_method: 'telegram',
        telegram_password: password // Store for auto-login
      }
    });
    
    if (createError) {
      throw createError;
    }
    
    logger.info('New Telegram user created', {
      userId: newUser.user.id,
      telegramId: telegramUser.id,
      email: email
    });
    
    // Create user_config entry for new user
    const { error: configError } = await supabase
      .from('user_config')
      .insert({
        user_id: newUser.user.id,
        lead_prompt: 'Identify potential customers asking for services or products. Look for people who are actively searching for solutions or expressing needs that could be met with a product or service.',
        telegram_channel_id: 'not_configured',
        is_active: false
      });
    
    if (configError) {
      logger.error('Failed to create user_config', {
        error: configError.message,
        userId: newUser.user.id
      });
      // Don't fail the registration, just log the error
    }
    
    return res.json({
      success: true,
      user: {
        id: newUser.user.id,
        email: email,
        password: password, // Send to frontend for auto-login
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username,
        telegram_first_name: telegramUser.first_name,
        telegram_last_name: telegramUser.last_name
      },
      isNewUser: true,
      message: 'New user created via Telegram'
    });
    
  } catch (error) {
    logger.error('Telegram auth failed', {
      error: error.message,
      telegramId: telegramUser.id
    });
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate via Telegram'
    });
  }
}));

/**
 * POST /api/auth/link-telegram
 * Link Telegram account to existing user
 */
router.post('/link-telegram', asyncHandler(async (req, res) => {
  const { email, password, initData } = req.body;
  
  if (!email || !password || !initData) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'email, password, and initData are required'
    });
  }
  
  // Parse Telegram user data
  const urlParams = new URLSearchParams(initData);
  const userJson = urlParams.get('user');
  
  if (!userJson) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'User data not found in initData'
    });
  }
  
  const telegramUser = JSON.parse(userJson);
  const supabase = getSupabase();
  
  try {
    // Verify email/password
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (signInError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }
    
    // Update user metadata with Telegram info
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      authData.user.id,
      {
        user_metadata: {
          ...authData.user.user_metadata,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          telegram_first_name: telegramUser.first_name,
          telegram_last_name: telegramUser.last_name
        }
      }
    );
    
    if (updateError) {
      throw updateError;
    }
    
    logger.info('Telegram account linked', {
      userId: authData.user.id,
      email: email,
      telegramId: telegramUser.id
    });
    
    return res.json({
      success: true,
      message: 'Telegram account linked successfully',
      user: {
        id: authData.user.id,
        email: email,
        telegram_id: telegramUser.id
      }
    });
    
  } catch (error) {
    logger.error('Failed to link Telegram account', {
      error: error.message,
      email: email
    });
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to link Telegram account'
    });
  }
}));

/**
 * POST /api/auth/create-user
 * Create or verify user exists in user_config
 * Simple endpoint for localStorage-based user management
 */
router.post('/create-user', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  
  if (!user_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'user_id is required'
    });
  }
  
  logger.info('Creating/verifying user', { userId: user_id });
  
  const supabase = getSupabase();
  
  try {
    // Check if user already exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('user_config')
      .select('user_id')
      .eq('user_id', user_id)
      .single();
    
    if (existingUser) {
      logger.info('User already exists', { userId: user_id });
      return res.json({
        success: true,
        message: 'User already exists',
        user_id: user_id
      });
    }
    
    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('user_config')
      .insert({
        user_id: user_id,
        lead_prompt: 'Default lead detection prompt',
        telegram_channel_id: 'not_configured',
        is_active: true
      })
      .select()
      .single();
    
    if (createError) {
      throw createError;
    }
    
    logger.info('New user created', { userId: user_id });
    
    return res.json({
      success: true,
      message: 'User created successfully',
      user_id: user_id,
      isNewUser: true
    });
    
  } catch (error) {
    logger.error('Failed to create user', {
      error: error.message,
      userId: user_id
    });
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create user'
    });
  }
}));

export default router;

