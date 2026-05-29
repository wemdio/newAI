import { getSupabase } from '../config/database.js';
import { getOpenRouter } from '../config/openrouter.js';
import { buildCategoryBatchPrompt, parseCategoryBatchResponse } from './categoryPrompt.js';
import { retryWithBackoff } from '../utils/errorHandler.js';
import { logAiUsage } from './costOptimizer.js';
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

const DIRECT_VACANCY_PATTERNS = [
  /\bнужны\s+люди\b/i,
  /\bнужны\s+(грузчик|курьер|водител|разнорабоч|сотрудник|менеджер|оператор|продав)/i,
  /\bищем\s+(сотрудник|менеджер|оператор|продав|курьер|водител|грузчик)/i,
  /\bтребуются\s+(сотрудник|менеджер|оператор|продав|курьер|водител|грузчик|люди)/i,
  /\bзп\s+\d/i,
  /\bзарплата\s+\d/i,
  /\bоплата\s+(в\s+)?(день|неделю|смену|час)\b/i,
  /\bвыплаты\s+(ежедневн|еженедельн)/i,
  /\bподработка\b/i,
  /\bвакансия\b/i,
  /\bстажировка\b/i
];

const MLM_SPAM_PATTERNS = [
  /онлайн[\s\-]?(занятость|заработок|работа|доход)/i,
  /удал[её]нн(ый|ая|ое|ые)\s+(заработок|доход)/i,
  /доход\s+(без|от)\s+\d/i,
  /пассивн(ый|ая|ое|ые)\s+доход/i,
  /финансов(ая|ую)\s+свобод/i,
  /сетев(ой|ого|ому)\s+(маркетинг|бизнес)/i,
  /\bmlm\b/i,
  /без\s+вложений/i,
  /работа\s+на\s+себя.*\d.*руб/i
];

const GIG_LABOR_PATTERNS = [
  /\b(разгруз|погруз|разбор(ка|ать)|уборк|сборк).{0,30}\d+\s*₽/i,
  /\b(разгруз|погруз|разбор(ка|ать)|уборк|сборк).{0,30}\d+\s*руб/i,
  /\bна\s+\d+\s*(час|ч\b)/i,
  /\bгрузчик/i
];

const PARTNERSHIP_PATTERNS = [
  /\bищ(у|ем)\s+партн[её]р/i,
  /\bпартн[её]рств/i,
  /\bколлаборац/i,
  /\bсотрудничеств/i
];

const OFFER_PATTERNS = [
  /\bпредлага(ю|ем)\b/i,
  /\bмо(гу|жем)\s+помочь\b/i,
  /\bпомо(гу|жем)\b/i,
  /\bпоможем\s+(с|в|по)\b/i,
  /\bпомощь\s+(с|в|по)\b/i,
  /\bоказыва(ю|ем)\b/i,
  /\bнаши\s+услуг/i,
  /\bобращайтесь\b/i,
  /\bподробности\s+в\s+лич/i,
  /\bпишите\s+(в\s+)?(whatsapp|ватсап|wa|tg|телеграм|личку|лс)\b/i,
  /\bзаписаться\s+(можно|по)\b/i,
  /\bоставляйте\s+заявк/i,
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
let scheduledTimer = null;
let isProcessingCycle = false;
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

const normalizeUnicode = (text) => {
  const MAP = {
    '\u1d00': 'а', '\u1d04': 'с', '\u1d07': 'е', '\u1d0b': 'к', '\u1d0d': 'м',
    '\u1d0f': 'о', '\u1d18': 'р', '\u1d1b': 'т', '\u1d1c': 'у', '\u1d21': 'ш',
    '\u0280': 'р', '\u0262': 'г', '\u029f': 'л', '\u0274': 'н',
    '\u0410': 'А', '\u0430': 'а', '\u0412': 'В', '\u0432': 'в',
    'ᴇ': 'е', 'ᴀ': 'а', 'ᴘ': 'р', 'ᴏ': 'о', 'ᴄ': 'с', 'ᴛ': 'т',
    'ᴜ': 'у', 'ᴋ': 'к', 'ᴍ': 'м', 'ᴎ': 'н', 'ᴅ': 'д',
    'ω': 'ш', 'ʏ': 'у', 'ɪ': 'и',
    'ᴧ': 'л', 'ᴨ': 'п', 'ᴩ': 'р', 'ᴦ': 'г',
    'ᴪ': 'ψ', 'ɢ': 'г', 'ᴥ': 'б',
    'ᴘ': 'р', 'ᴀ': 'а', 'ᴇ': 'е', 'ᴏ': 'о', 'ᴄ': 'с',
  };
  return text.replace(/./g, ch => MAP[ch] || ch);
};

const hasUnicodeObfuscation = (text) => {
  const suspicious = /[\u0250-\u02AF\u1D00-\u1D7F\u0370-\u03FF]/;
  const matches = text.match(suspicious);
  if (!matches) return false;
  const count = (text.match(new RegExp(suspicious.source, 'g')) || []).length;
  return count >= 3;
};

const getHardRejectReason = (messageText) => {
  const raw = (messageText || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  if (hasUnicodeObfuscation(raw)) return 'unicode_spam';

  const text = normalizeUnicode(raw);

  if (matchesAny(text, JOB_SEEKER_PATTERNS)) return 'job_seeker';
  if (matchesAny(text, DIRECT_VACANCY_PATTERNS)) return 'direct_vacancy';
  if (matchesAny(text, MLM_SPAM_PATTERNS)) return 'mlm_spam';
  if (matchesAny(text, GIG_LABOR_PATTERNS)) return 'gig_labor';
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

  await logAiUsage(response, { userId: null, stage: 'classifier', model });

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

const scheduleNextCycle = () => {
  if (!isRunning) return;
  scheduledTimer = setTimeout(processCycle, BATCH_INTERVAL);
};

const processCycle = async () => {
  if (isProcessingCycle) {
    logger.warn('[CategoryClassifier] Previous cycle still running, skipping');
    scheduleNextCycle();
    return;
  }

  isProcessingCycle = true;
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
  } finally {
    isProcessingCycle = false;
    scheduleNextCycle();
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
  isProcessingCycle = false;
  stats = { cycles: 0, messagesScanned: 0, leadsFound: 0, errors: 0 };

  logger.info('[CategoryClassifier] Starting', { interval: BATCH_INTERVAL });

  scheduleNextCycle();

  return { success: true, message: 'Category classifier started' };
};

export const stopCategoryClassifier = () => {
  if (!isRunning) return;
  isRunning = false;
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
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
