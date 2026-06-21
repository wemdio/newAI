import TelegramBot from 'node-telegram-bot-api';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import logger from '../utils/logger.js';
import { TelegramError } from '../utils/errorHandler.js';

/**
 * Telegram Bot configuration
 */

// ── Outbound proxy for api.telegram.org ──────────────────────────────────────
// The production API container runs in RU (Timeweb spb-3), where RKN blocks the
// Telegram Bot API directly — so lead posting silently fails without a proxy.
// Route every bot request through TELEGRAM_BOT_PROXY, falling back to the
// leadbot's already-configured LEADBOT_PROXY so no new env var is needed.
// Supports socks5:// and http(s)://. Neither set ⇒ direct connection (legacy).
const buildTelegramProxyAgent = () => {
  const url = process.env.TELEGRAM_BOT_PROXY || process.env.LEADBOT_PROXY;
  if (!url || !url.trim()) return null;
  try {
    const scheme = (url.split('://')[0] || '').toLowerCase();
    if (scheme.startsWith('socks')) {
      // Force REMOTE DNS (socks5h). On RU hosts RKN poisons DNS for
      // api.telegram.org, so the PROXY must resolve the hostname, not the
      // client. With socks5:// (local DNS) socks-proxy-agent resolves locally
      // to a dead IP and every send times out ("Proxy connection timed out");
      // socks5h:// sends the hostname to the proxy. getMe happens to work but
      // sendMessage to channels does not — this is the actual fix.
      const remoteDnsUrl = (scheme === 'socks5' || scheme === 'socks')
        ? url.replace(/^socks5?:\/\//i, 'socks5h://')
        : url;
      const agent = new SocksProxyAgent(remoteDnsUrl, { timeout: 25000 });
      logger.info('Telegram bot proxy enabled', { scheme, remoteDns: true });
      return agent;
    }
    const agent = new HttpsProxyAgent(url, { timeout: 25000 });
    logger.info('Telegram bot proxy enabled', { scheme, remoteDns: false });
    return agent;
  } catch (error) {
    logger.error('Invalid proxy URL — falling back to direct connection', {
      error: error.message
    });
    return null;
  }
};

const telegramProxyAgent = buildTelegramProxyAgent();

let botInstance = null;

/**
 * Initialize Telegram bot
 * @param {string} token - Optional bot token (can use env var)
 */
export const initializeTelegramBot = (token = null) => {
  try {
    const botToken = token || process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      throw new TelegramError('Telegram bot token is required');
    }

    // Create bot instance (polling disabled for production)
    botInstance = new TelegramBot(botToken, {
      polling: false,
      filepath: false,
      // Route through proxy when configured (RU servers can't reach Telegram directly)
      ...(telegramProxyAgent ? { request: { agent: telegramProxyAgent } } : {})
    });

    logger.info('Telegram bot initialized successfully', {
      viaProxy: !!telegramProxyAgent
    });
    return botInstance;
  } catch (error) {
    logger.error('Failed to initialize Telegram bot', { error: error.message });
    throw error;
  }
};

/**
 * Get Telegram bot instance
 * @param {string} token - Optional token for user-specific bot
 */
export const getTelegramBot = (token = null) => {
  if (token) {
    return initializeTelegramBot(token);
  }
  
  if (!botInstance) {
    return initializeTelegramBot();
  }
  
  return botInstance;
};

/**
 * Test bot connection and get bot info
 * @param {string} token - Optional bot token to test
 */
export const testConnection = async (token = null) => {
  try {
    const bot = getTelegramBot(token);
    const botInfo = await bot.getMe();
    
    logger.info('Telegram bot connection test successful', {
      username: botInfo.username,
      id: botInfo.id
    });
    
    return {
      success: true,
      bot: {
        id: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name
      }
    };
  } catch (error) {
    logger.error('Telegram bot connection test failed', { error: error.message });
    throw new TelegramError('Failed to connect to Telegram bot', {
      originalError: error.message
    });
  }
};

/**
 * Test if bot can send messages to a channel
 * @param {string} channelId - Channel ID to test
 * @param {string} token - Optional bot token
 */
export const testChannelAccess = async (channelId, token = null) => {
  try {
    const bot = getTelegramBot(token);
    
    // Try to get chat info
    const chatInfo = await bot.getChat(channelId);
    
    // Try to send a test message
    const testMessage = await bot.sendMessage(
      channelId,
      '✅ *Bot Connection Test*\n\nThis is a test message to verify bot access\\.',
      { parse_mode: 'MarkdownV2' }
    );
    
    logger.info('Channel access test successful', {
      channelId,
      chatTitle: chatInfo.title
    });
    
    return {
      success: true,
      channel: {
        id: chatInfo.id,
        title: chatInfo.title,
        type: chatInfo.type
      },
      messageId: testMessage.message_id
    };
  } catch (error) {
    logger.error('Channel access test failed', { 
      channelId, 
      error: error.message 
    });
    
    throw new TelegramError('Cannot access channel. Ensure bot is admin of the channel.', {
      channelId,
      originalError: error.message
    });
  }
};

/**
 * Send message to channel
 * @param {string} channelId - Target channel ID
 * @param {string} message - Message text (supports Markdown)
 * @param {object} options - Additional options
 * @param {string} token - Optional bot token
 */
export const sendMessage = async (channelId, message, options = {}, token = null) => {
  try {
    const bot = getTelegramBot(token);
    
    const defaultOptions = {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      ...options
    };
    
    const result = await bot.sendMessage(channelId, message, defaultOptions);
    
    logger.info('Message sent to Telegram', {
      channelId,
      messageId: result.message_id
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to send Telegram message', {
      channelId,
      error: error.message
    });
    
    throw new TelegramError('Failed to send message to Telegram', {
      channelId,
      originalError: error.message
    });
  }
};

/**
 * Format lead message for Telegram
 * @param {object} lead - Lead data
 * @param {object} analysis - AI analysis results
 */
/**
 * Create inline keyboard for lead message
 * @param {object} lead - Lead data
 * @returns {object} Inline keyboard markup
 */
export const createLeadKeyboard = (lead) => {
  const buttons = [];
  
  if (lead.username) {
    // If username is available, add button with deep link to profile
    buttons.push([{
      text: '✉️ Написать',
      url: `https://t.me/${lead.username}`
    }]);
  } else if (lead.telegram_message_link) {
    // If no username but message link is available
    buttons.push([{
      text: '💬 Открыть сообщение',
      url: lead.telegram_message_link
    }]);
  } else if (lead.chat_id && lead.telegram_message_id) {
    // Try to construct deep link to message
    // Format: https://t.me/c/{chat_id}/{message_id}
    // Note: chat_id needs to be without -100 prefix for private channels
    const chatIdStr = String(lead.chat_id).replace('-100', '');
    buttons.push([{
      text: '💬 Открыть сообщение',
      url: `https://t.me/c/${chatIdStr}/${lead.telegram_message_id}`
    }]);
  }
  
  return {
    inline_keyboard: buttons
  };
};

export const formatLeadMessage = (lead, analysis, messageSuggestion = null) => {
  const escapeMarkdown = (text) => {
    if (!text) return 'Не указано';
    // Escape special MarkdownV2 characters
    // Must escape: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  };
  
  // Get confidence emoji based on score
  const getConfidenceEmoji = (score) => {
    if (score >= 90) return '🟢'; // Green - very high
    if (score >= 75) return '🔵'; // Blue - high
    if (score >= 60) return '🟡'; // Yellow - medium
    return '🟠'; // Orange - low
  };
  
  const confidenceEmoji = getConfidenceEmoji(analysis.confidence_score);
  
  const fullName = [lead.first_name, lead.last_name]
    .filter(Boolean)
    .join(' ') || 'Не указано';
  
  const usernameDisplay = lead.username 
    ? '@' + escapeMarkdown(lead.username)
    : '🔒 _Скрыт пользователем_';
  
  let message = `
👤 *Контактная информация*
• *Имя:* ${escapeMarkdown(fullName)}
• *Username:* ${usernameDisplay}
• *Био:* ${escapeMarkdown(lead.bio || 'Не указано')}

📱 *Источник*
• *Канал:* ${escapeMarkdown(lead.chat_name)}
• *Время:* ${escapeMarkdown(new Date(lead.message_time).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }))}

💬 *Сообщение лида*
*${escapeMarkdown(lead.message)}*

🤖 *AI Анализ*
• *Уверенность:* ${confidenceEmoji} *${escapeMarkdown(String(analysis.confidence_score))}%*
• *Обоснование:* ${escapeMarkdown(analysis.reasoning)}`;

  // Add matched criteria if available
  if (analysis.matched_criteria && analysis.matched_criteria.length > 0) {
    const criteriaText = analysis.matched_criteria
      .map(c => escapeMarkdown(c))
      .join('\n• ');
    message += `

🔍 *AUDIT RESULT*
Matched Criteria: ${criteriaText}`;
  }

  // Add message suggestion if provided - compact format
  if (messageSuggestion) {
    message += `

💡 *Подсказка для первого сообщения:*
_${escapeMarkdown(messageSuggestion)}_`;
  }

  message += `

_ID лида: ${escapeMarkdown(String(lead.id))}_`;
  
  return message.trim();
};

/**
 * Health check for Telegram bot
 */
export const healthCheck = async () => {
  try {
    await testConnection();
    return {
      status: 'healthy',
      message: 'Telegram bot is working'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message
    };
  }
};

export default {
  initializeTelegramBot,
  getTelegramBot,
  testConnection,
  testChannelAccess,
  sendMessage,
  formatLeadMessage,
  createLeadKeyboard,
  healthCheck
};

