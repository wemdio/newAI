import { getSupabase } from '../config/database.js';
import { getOpenRouter } from '../config/openrouter.js';
import { buildCategoryBatchPrompt, parseCategoryBatchResponse } from './categoryPrompt.js';
import { retryWithBackoff } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

const BATCH_INTERVAL = parseInt(process.env.CATEGORY_CLASSIFIER_BATCH_INTERVAL || '10000', 10);
const BATCH_SIZE = parseInt(process.env.CATEGORY_CLASSIFIER_BATCH_SIZE || '15', 10);
const BATCH_DELAY = parseInt(process.env.CATEGORY_CLASSIFIER_BATCH_DELAY || '4000', 10);
const MESSAGES_PER_CYCLE = 500;
const DEDUP_WINDOW_DAYS = 7;
const MIN_MESSAGE_LENGTH = 15;

const API_KEYS = [process.env.CATEGORY_API_KEY, process.env.CATEGORY_API_KEY_2].filter(Boolean);
let keyIndex = 0;

const JOB_SEEKER_PATTERNS = [
  /\bищу\s+работ/i,
  /\bв\s+поиске\s+работ/i,
  /\bищу\s+подработ/i,
  /\bищу\s+ваканси/i,
  /\bрезюме\b/i,
  /\bрассмотрю\s+предложени/i,
  /\bopen\s*to\s*work\b/i
];

const PARTNERSHIP_PATTERNS = [
  /\bищ(у|ем)\s+партн[её]р/i,
  /\bпартн[её]рств/i,
  /\bколлаборац/i,
  /\bсотрудничеств/i
];

const OFFER_PATTERNS = [
  /\bпредлагаю\b/i,
  /\bмогу\s+помочь\b/i,
  /\bпомогу\b/i,
  /\bоказыва(ю|ем)\b/i,
  /\bподробности\s+в\s+лич/i,
  /\bпишите\s+(в\s+)?(whatsapp|ватсап|wa|tg|телеграм|личку|лс)\b/i
];

const REQUEST_MARKER_PATTERNS = [
  /\bищу\s+(специалист|подрядчик|исполнитель|дизайнер|разработчик|маркетолог|таргетолог|юрист|бухгалтер|монтаж[её]р|моушн)\b/i,
  /\bнуж(ен|на|но|ны)\b/i,
  /\bкто\s+(может|делает|возьм[её]тся)\b/i,
  /\bсколько\s+стоит\b/i,
  /\bхочу\s+заказать\b/i,
  /\bтребуется\s+(специалист|исполнитель)\b/i
];

let isRunning = false;
let intervalHandle = null;
let lastProcessedId = null;
let startedAt = null;
let stats = { cycles: 0, messagesScanned: 0, leadsFound: 0, errors: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const matchesAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));
const getResponseMeta = (requestedModel, response) => ({
  requestedModel,
  resolvedModel: response?.model || null,
  usage: response?.usage || null,
  finishReason: response?.choices?.[0]?.finish_reason || null
});

const getHardRejectReason = (messageText) => {
  const text = (messageText || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (matchesAny(text, JOB_SEEKER_PATTERNS)) return 'job_seeker';
  if (matchesAny(text, PARTNERSHIP_PATTERNS)) return 'partnership';
  if (matchesAny(text, OFFER_PATTERNS) && !matchesAny(text, REQUEST_MARKER_PATTERNS)) {
    return 'self_promo';
  }

  return null;
};

const isClassifierEnabled = async () => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'category_classifier_enabled')
      .single();
    if (error || !data) return false;
    return data.value === true;
  } catch {
    return false;
  }
};

const initLastProcessedId = async () => {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('messages')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();
  lastProcessedId = data?.id || 0;
  logger.info('[CategoryClassifier] Initialized lastProcessedId', { lastProcessedId });
};

const fetchNewMessages = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .gt('id', lastProcessedId)
    .not('username', 'is', null)
    .neq('username', '')
    .order('id', { ascending: true })
    .limit(MESSAGES_PER_CYCLE);

  if (error) {
    logger.error('[CategoryClassifier] Failed to fetch messages', { error: error.message });
    return [];
  }
  return data || [];
};

const filterMessages = (messages) => {
  return messages.filter((msg) => {
    const text = msg.message || '';
    if (text.length < MIN_MESSAGE_LENGTH) return false;
    if (/(.)\1{9,}/.test(text)) return false;
    return true;
  });
};

const deduplicateMessages = async (messages) => {
  if (messages.length === 0) return [];

  const supabase = getSupabase();
  const senderIds = messages.map((m) => m.username);
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('categorized_leads')
    .select('sender_id')
    .in('sender_id', senderIds)
    .gte('created_at', windowStart);

  const existingSet = new Set((existing || []).map((r) => r.sender_id));

  return messages.filter((m) => !existingSet.has(m.username));
};

const getNextApiKey = () => {
  if (API_KEYS.length === 0) return null;
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
};

const classifyBatch = async (messages) => {
  const apiKey = getNextApiKey();
  if (!apiKey) {
    throw new Error('No API keys configured — set CATEGORY_API_KEY (and optionally CATEGORY_API_KEY_2) in env');
  }

  const model = process.env.CATEGORY_AI_MODEL || 'policy/lead-classifier';
  const client = getOpenRouter(apiKey);
  const { systemPrompt, userPrompt } = buildCategoryBatchPrompt(messages);

  const response = await retryWithBackoff(async () => {
    return await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });
  }, 3, 1000);

  logger.info('[CategoryClassifier] Response metadata', {
    batchSize: messages.length,
    messageIds: messages.map((msg) => msg.id),
    ...getResponseMeta(model, response)
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from classification AI');

  return parseCategoryBatchResponse(content, messages.length);
};

const saveClassifiedLeads = async (messages, results) => {
  const supabase = getSupabase();
  let savedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const result = results[i];
    if (!result) continue;

    const msgId = String(msg.id);
    if (result.id && result.id !== msgId) {
      logger.warn('[CategoryClassifier] ID mismatch', { expected: msgId, got: result.id });
    }

    if (!result.is_request || !result.category) continue;
    if ((result.confidence_score || 0) < 75) continue;

    const messageText = msg.message || '';
    const senderId = msg.username;
    const hardRejectReason = getHardRejectReason(messageText);
    if (hardRejectReason) {
      logger.info('[CategoryClassifier] Hard-rejected candidate', {
        messageId: msg.id,
        senderId,
        category: result.category,
        reason: hardRejectReason
      });
      continue;
    }

    const messageHash = crypto.createHash('sha256').update(messageText).digest('hex');

    const windowStart = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: dup } = await supabase
      .from('categorized_leads')
      .select('id')
      .eq('sender_id', senderId)
      .gte('created_at', windowStart)
      .limit(1);

    if (dup && dup.length > 0) {
      logger.debug('[CategoryClassifier] Duplicate sender, skipping', { senderId });
      continue;
    }

    const { error } = await supabase
      .from('categorized_leads')
      .insert({
        message_id: msg.id,
        category: result.category,
        username: msg.username,
        first_name: msg.first_name || null,
        last_name: msg.last_name || null,
        message_text: messageText,
        chat_name: msg.chat_name || null,
        profile_link: msg.profile_link || null,
        message_time: msg.message_time || null,
        confidence_score: result.confidence_score || 0,
        reasoning: result.reasoning || '',
        sender_id: senderId,
        message_hash: messageHash
      });

    if (error) {
      logger.error('[CategoryClassifier] Failed to insert lead', { error: error.message, senderId });
      continue;
    }

    savedCount++;
  }

  return savedCount;
};

const processCycle = async () => {
  try {
    const enabled = await isClassifierEnabled();
    if (!enabled) {
      logger.debug('[CategoryClassifier] Disabled, skipping cycle');
      return;
    }

    if (lastProcessedId === null) {
      await initLastProcessedId();
      return;
    }

    const rawMessages = await fetchNewMessages();
    if (rawMessages.length === 0) return;

    stats.messagesScanned += rawMessages.length;

    const filtered = filterMessages(rawMessages);
    if (filtered.length === 0) {
      lastProcessedId = rawMessages[rawMessages.length - 1].id;
      return;
    }

    const deduped = await deduplicateMessages(filtered);
    if (deduped.length === 0) {
      lastProcessedId = rawMessages[rawMessages.length - 1].id;
      return;
    }

    logger.info('[CategoryClassifier] Processing messages', {
      raw: rawMessages.length,
      filtered: filtered.length,
      afterDedup: deduped.length
    });

    let totalSaved = 0;
    let totalFailed = 0;
    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_DELAY);
      const chunk = deduped.slice(i, i + BATCH_SIZE);
      try {
        const results = await classifyBatch(chunk);
        const saved = await saveClassifiedLeads(chunk, results);
        totalSaved += saved;
      } catch (err) {
        logger.error('[CategoryClassifier] Batch classification failed', {
          error: err.message,
          chunkSize: chunk.length
        });
        totalFailed += chunk.length;
        stats.errors++;
      }
    }

    if (totalFailed === deduped.length) {
      logger.warn('[CategoryClassifier] All batches failed — not advancing pointer, will retry next cycle');
      return;
    }

    lastProcessedId = rawMessages[rawMessages.length - 1].id;

    if (totalSaved > 0) {
      stats.leadsFound += totalSaved;
      logger.info('[CategoryClassifier] Cycle complete', {
        scanned: rawMessages.length,
        saved: totalSaved
      });
    }

    stats.cycles++;
  } catch (err) {
    logger.error('[CategoryClassifier] Cycle error', { error: err.message, stack: err.stack });
    stats.errors++;
  }
};

export const startCategoryClassifier = async () => {
  if (isRunning) {
    logger.warn('[CategoryClassifier] Already running');
    return;
  }

  isRunning = true;
  startedAt = new Date().toISOString();
  lastProcessedId = null;
  stats = { cycles: 0, messagesScanned: 0, leadsFound: 0, errors: 0 };

  logger.info('[CategoryClassifier] Starting', { interval: BATCH_INTERVAL });

  intervalHandle = setInterval(processCycle, BATCH_INTERVAL);

  return { success: true, message: 'Category classifier started' };
};

export const stopCategoryClassifier = () => {
  if (!isRunning) return;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  isRunning = false;
  startedAt = null;
  logger.info('[CategoryClassifier] Stopped');
  return { success: true, message: 'Category classifier stopped' };
};

export const getCategoryClassifierStatus = () => ({
  isRunning,
  startedAt,
  lastProcessedId,
  stats: { ...stats }
});

export default {
  startCategoryClassifier,
  stopCategoryClassifier,
  getCategoryClassifierStatus
};
