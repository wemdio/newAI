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

let isRunning = false;
let intervalHandle = null;
let lastProcessedId = null;
let startedAt = null;
let stats = { cycles: 0, messagesScanned: 0, leadsFound: 0, errors: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const model = process.env.CATEGORY_AI_MODEL || 'google/gemini-2.0-flash-001';
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
    if ((result.confidence_score || 0) < 60) continue;

    const messageText = msg.message || '';
    const messageHash = crypto.createHash('sha256').update(messageText).digest('hex');
    const senderId = msg.username;

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

    lastProcessedId = rawMessages[rawMessages.length - 1].id;
    stats.messagesScanned += rawMessages.length;

    const filtered = filterMessages(rawMessages);
    if (filtered.length === 0) return;

    const deduped = await deduplicateMessages(filtered);
    if (deduped.length === 0) return;

    logger.info('[CategoryClassifier] Processing messages', {
      raw: rawMessages.length,
      filtered: filtered.length,
      afterDedup: deduped.length
    });

    let totalSaved = 0;
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
        stats.errors++;
      }
    }

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
