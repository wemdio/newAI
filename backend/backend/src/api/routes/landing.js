import express from 'express';
import amoCrmService from '../../services/amoCrm.js';
import { sendMessage } from '../../config/telegram.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Helper to escape MarkdownV2 characters
const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
};

router.post('/lead', async (req, res) => {
  try {
    const { name, contact, type } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ error: 'Name and contact are required' });
    }

    logger.info('New landing lead received', { name, contact, type });

    // Debug: List all env vars to check if they are passed correctly
    const envKeys = Object.keys(process.env).filter(key => key.startsWith('TELEGRAM_'));
    logger.info('Available TELEGRAM env vars:', { keys: envKeys });

    // 1. Send notification to Telegram (Priority)
    const targetChatId = (process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID || process.env.TELEGRAM_ADMIN_ID || '').trim();
    let telegramResult = null;

    if (targetChatId) {
      const message = `
🚀 *Новая заявка с лендинга*

👤 *Имя:* ${escapeMarkdown(name)}
📞 *Контакт:* \`${escapeMarkdown(contact)}\`
📱 *Тип:* ${escapeMarkdown(type === 'telegram' ? 'Telegram' : 'Телефон')}

_Пожалуйста, свяжитесь с клиентом как можно скорее\\._
      `.trim();

      try {
        telegramResult = await sendMessage(targetChatId, message);
        logger.info('Lead notification sent to Telegram', { targetChatId });
      } catch (tgError) {
        logger.error('Failed to send Telegram notification', { error: tgError.message });
      }
    } else {
      logger.warn('TELEGRAM_NOTIFICATIONS_CHAT_ID not set. Skipping Telegram notification.');
    }

    // 2. Send to AmoCRM (Optional/Secondary)
    // We don't await this to keep the UI fast, or we catch errors so it doesn't fail the request
    let crmResult = null;
    try {
      crmResult = await amoCrmService.createLead({ name, contact, type });
    } catch (crmError) {
      logger.error('AmoCRM submission failed', { error: crmError.message });
    }

    res.json({ 
      success: true, 
      telegram: !!telegramResult,
      crm: crmResult 
    });

  } catch (error) {
    logger.error('Error processing landing lead', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
