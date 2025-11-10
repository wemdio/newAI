/**
 * Telegram Mini App Bot
 * Sends Web App button for automatic Telegram authentication
 */

import TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';

let bot = null;

/**
 * Start Mini App Bot
 * Sends Web App button when user sends /start
 */
export const startMiniAppBot = () => {
  const token = process.env.TELEGRAM_MINI_APP_BOT_TOKEN;

  if (!token) {
    logger.warn('⚠️ TELEGRAM_MINI_APP_BOT_TOKEN not set - Mini App bot disabled');
    logger.info('💡 Users can still use Menu Button with email/password login');
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });

    logger.info('✅ Mini App Bot started');

    // Handle /start command
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Пользователь';

      logger.info('Mini App bot: /start command', {
        userId: msg.from.id,
        username: msg.from.username,
        chatId
      });

      bot.sendMessage(
        chatId,
        `👋 Привет, ${firstName}!\n\n` +
        `🚀 Нажмите кнопку ниже, чтобы открыть Lead Scanner.\n\n` +
        `Вы автоматически войдете через Telegram ID.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🚀 Открыть Lead Scanner',
                  web_app: { url: process.env.FRONTEND_URL || 'https://telegram-scanner.ru' }
                }
              ]
            ]
          }
        }
      );
    });

    // Handle any other messages
    bot.on('message', (msg) => {
      if (!msg.text?.startsWith('/')) {
        const chatId = msg.chat.id;
        bot.sendMessage(
          chatId,
          '💡 Используйте /start чтобы открыть Lead Scanner',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Открыть Lead Scanner',
                    web_app: { url: process.env.FRONTEND_URL || 'https://telegram-scanner.ru' }
                  }
                ]
              ]
            }
          }
        );
      }
    });

    // Handle polling errors
    bot.on('polling_error', (error) => {
      logger.error('Mini App bot polling error', {
        error: error.message
      });
    });

    logger.info('🤖 Mini App bot is ready. Users can send /start to get Web App button.');

    return bot;
  } catch (error) {
    logger.error('Failed to start Mini App bot', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
};

/**
 * Stop Mini App Bot
 */
export const stopMiniAppBot = () => {
  if (bot) {
    bot.stopPolling();
    logger.info('Mini App bot stopped');
  }
};

