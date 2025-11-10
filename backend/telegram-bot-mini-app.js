/**
 * Простой Telegram бот для открытия Mini App
 * Запускает Mini App с передачей initData
 */

import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';

const token = process.env.TELEGRAM_MINI_APP_BOT_TOKEN;

if (!token) {
  console.error('❌ TELEGRAM_MINI_APP_BOT_TOKEN not set!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('✅ Mini App Bot started');

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Пользователь';

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
              web_app: { url: 'https://telegram-scanner.ru' }
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
                web_app: { url: 'https://telegram-scanner.ru' }
              }
            ]
          ]
        }
      }
    );
  }
});

console.log('🤖 Bot is ready. Send /start to test.');

