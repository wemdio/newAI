/**
 * Contact Enrichment Service
 * Агрегирует контакты из messages и обогащает их с помощью AI (Qwen 2.5-7B)
 */

import { getSupabase } from '../config/database.js';
import logger from '../utils/logger.js';

// ============= КОНФИГУРАЦИЯ =============
const CONFIG = {
  // Модель для обогащения (супер-дешёвая)
  MODEL: 'qwen/qwen-2.5-7b-instruct',
  
  // Батчинг
  AGGREGATION_BATCH_SIZE: 1000,    // Сколько username обрабатывать за раз при агрегации
  ENRICHMENT_BATCH_SIZE: 10,       // Сколько контактов отправлять в один запрос AI (уменьшено для надёжности)
  
  // API
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1/chat/completions',
  MAX_TOKENS: 3000,                // Лимит токенов на ответ (увеличено с 2000)
  
  // Цены Qwen 2.5-7B (за 1M токенов)
  PRICE_INPUT: 0.04,
  PRICE_OUTPUT: 0.10,
  
  // Лимиты
  MAX_BIO_LENGTH: 450,          // было 200 — часто отрезало ключевую инфу о работе
  MAX_MESSAGE_LENGTH: 260,      // чуть компактнее для токенов, но достаточно для смысла
  FETCH_MESSAGES_LIMIT: 30,     // сколько последних сообщений подтягиваем для выбора релевантных
  
  // Параллельность
  PARALLEL_DB_REQUESTS: 10,  // Сколько запросов к БД делать параллельно
  BATCH_DELAY_MS: 300,       // Пауза между батчами AI (мс)
};

// ============= АГРЕГАЦИЯ КОНТАКТОВ =============

/**
 * Получить список уникальных username, которых ещё нет в contacts
 */
async function getUnaggregatedUsernames(limit = 1000) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .rpc('get_unaggregated_usernames', { batch_limit: limit });
  
  if (error) {
    // Если функция не существует, используем обычный запрос
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('messages')
      .select('username')
      .not('username', 'is', null)
      .neq('username', '')
      .limit(limit);
    
    if (fallbackError) throw fallbackError;
    
    // Получим существующие контакты
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('username');
    
    const existingSet = new Set((existingContacts || []).map(c => c.username));
    const uniqueUsernames = [...new Set(fallbackData.map(m => m.username))];
    
    return uniqueUsernames.filter(u => !existingSet.has(u));
  }
  
  return data?.map(d => d.username) || [];
}

/**
 * Проверить, является ли username ботом
 */
function isBot(username) {
  if (!username) return true;
  const lower = username.toLowerCase();
  return lower.endsWith('bot') || lower.endsWith('бот') || lower.includes('_bot_');
}

/**
 * Агрегировать данные для одного username
 */
async function aggregateContactData(username) {
  // Пропускаем ботов
  if (isBot(username)) {
    return null;
  }
  
  const supabase = getSupabase();
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('username', username)
    .order('message_time', { ascending: false })
    .limit(50);
  
  if (error || !messages?.length) {
    return null;
  }
  
  // Агрегируем данные
  const latestWithBio = messages.find(m => m.bio);
  const latestWithName = messages.find(m => m.first_name || m.last_name);
  
  const sourceChats = [...new Set(messages.map(m => m.chat_name).filter(Boolean))];
  
  return {
    telegram_user_id: messages[0].user_id,
    username,
    first_name: latestWithName?.first_name || null,
    last_name: latestWithName?.last_name || null,
    bio: latestWithBio?.bio || null,
    profile_link: messages[0].profile_link,
    source_chats: sourceChats,
    messages_count: messages.length,
    first_seen_at: messages[messages.length - 1].message_time,
    last_seen_at: messages[0].message_time,
    last_message_preview: messages[0].message?.substring(0, 200),
    // Сообщения для обогащения (топ-5 самых длинных)
    top_messages: messages
      .filter(m => m.message && m.message.length > 20)
      .sort((a, b) => b.message.length - a.message.length)
      .slice(0, 5)
      .map(m => m.message.substring(0, CONFIG.MAX_MESSAGE_LENGTH)),
    message_ids: messages.map(m => m.id)
  };
}

/**
 * Сохранить контакт в базу
 */
async function saveContact(contactData) {
  const supabase = getSupabase();
  
  const { top_messages, message_ids, ...contact } = contactData;
  
  const { data, error } = await supabase
    .from('contacts')
    .upsert(contact, { onConflict: 'username' })
    .select()
    .single();
  
  if (error) {
    logger.error('Failed to save contact', { username: contact.username, error: error.message });
    return null;
  }
  
  // Связываем с сообщениями (первые 100)
  if (data && message_ids?.length) {
    const links = message_ids.slice(0, 100).map(mid => ({
      contact_id: data.id,
      message_id: mid
    }));
    
    await supabase
      .from('contact_messages')
      .upsert(links, { onConflict: 'contact_id,message_id', ignoreDuplicates: true })
      .then(() => {})
      .catch(() => {}); // Игнорируем ошибки связывания
  }
  
  return { ...data, top_messages };
}

/**
 * Агрегировать контакты батчами
 */
export async function aggregateContacts(options = {}) {
  const { batchSize = CONFIG.AGGREGATION_BATCH_SIZE, maxContacts = null } = options;
  
  logger.info('Starting contact aggregation...');
  
  let totalProcessed = 0;
  let totalSaved = 0;
  
  const supabase = getSupabase();
  
  // Получаем все уникальные username из messages
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Получаем батч уникальных username
    const { data: usernameBatch, error } = await supabase
      .from('messages')
      .select('username')
      .not('username', 'is', null)
      .neq('username', '')
      .order('username')
      .range(offset, offset + batchSize * 10 - 1); // Берём больше, т.к. будут дубликаты
    
    if (error) {
      logger.error('Error fetching usernames', { error: error.message });
      break;
    }
    
    if (!usernameBatch?.length) {
      hasMore = false;
      break;
    }
    
    // Уникальные username в этом батче
    const uniqueUsernames = [...new Set(usernameBatch.map(m => m.username))];
    
    // Проверяем, какие уже есть в contacts
    const { data: existing } = await supabase
      .from('contacts')
      .select('username')
      .in('username', uniqueUsernames);
    
    const existingSet = new Set((existing || []).map(c => c.username));
    const newUsernames = uniqueUsernames.filter(u => !existingSet.has(u));
    
    if (newUsernames.length === 0) {
      offset += batchSize * 10;
      continue;
    }
    
    // Обрабатываем новые контакты
    for (const username of newUsernames.slice(0, batchSize)) {
      try {
        const contactData = await aggregateContactData(username);
        if (contactData) {
          await saveContact(contactData);
          totalSaved++;
        }
        totalProcessed++;
        
        if (maxContacts && totalSaved >= maxContacts) {
          hasMore = false;
          break;
        }
      } catch (err) {
        logger.error('Error processing contact', { username, error: err.message });
      }
    }
    
    logger.info('Aggregation progress', { totalProcessed, totalSaved, currentBatch: newUsernames.length });
    
    offset += batchSize * 10;
    
    if (maxContacts && totalSaved >= maxContacts) {
      break;
    }
  }
  
  logger.info('Contact aggregation complete', { totalProcessed, totalSaved });
  
  return { totalProcessed, totalSaved };
}

// ============= ОБОГАЩЕНИЕ AI =============

/**
 * Промпт для обогащения контактов (компактный)
 */
function buildEnrichmentPrompt(contacts) {
  const contactsText = contacts.map((c, i) => {
    const bio = c.bio ? `[BIO]: ${c.bio.substring(0, CONFIG.MAX_BIO_LENGTH)}` : '';
    // Берём больше сообщений, но они уже отфильтрованы как "самоописание/работа"
    const msgs = c.top_messages?.slice(0, 4).map(m => `[MSG]: ${m}`).join(' ') || '';
    const data = [bio, msgs].filter(Boolean).join(' ') || 'нет данных';
    return `[${i}] @${c.username}: ${data}`;
  }).join('\n');
  
  return `Анализ ${contacts.length} Telegram профилей. Ответ НА РУССКОМ.

ВАЖНО:
- company/position: ТОЛЬКО из [BIO] или явных утверждений в [MSG] типа "я работаю в...", "я директор...", "моя компания...". 
- Если человек просто УПОМИНАЕТ компанию (обсуждает, жалуется, хвалит) — НЕ записывай её как его место работы!
- Если в BIO нет инфо о работе — оставь company/position пустыми (null).
- Для каждого заполненного поля company/position/lpr ОБЯЗАТЕЛЬНО дай короткую цитату-доказательство (evidence) из [BIO] или [MSG].
- Если не можешь привести точную цитату — ставь null/false.

${contactsText}

JSON (без markdown):
[{"i":0,"company":null,"company_evidence":null,"position":null,"position_evidence":null,"type":"CEO|DIRECTOR|MANAGER|SPECIALIST|FREELANCER|OTHER","lpr":false,"lpr_evidence":null,"industry":null,"size":"SOLO|SMALL|MEDIUM|LARGE|UNKNOWN","score":0-100,"confidence":0-100,"interests":[],"pains":[],"summary":"1 короткое предложение (до 180 символов)"}]

Правила:
- type/size - английские коды.
- Если нет явных данных о работе: company=null, position=null, score=0-20, confidence=0-40.
- interests/pains: максимум 5 коротких пунктов, только если явно следует из текста.
- evidence поля: короткая точная цитата (до 140 символов).`;
}

/**
 * Вызов OpenRouter API
 */
async function callOpenRouter(prompt, apiKey) {
  const response = await fetch(CONFIG.OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://leadparser.app',
      'X-Title': 'LeadParser Contact Enrichment'
    },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages: [
        {
          role: 'system',
          content: 'Ты эксперт по анализу профилей. Отвечай ТОЛЬКО валидным JSON без markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: CONFIG.MAX_TOKENS
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 }
  };
}

/**
 * Парсинг ответа AI
 */
function parseAIResponse(content) {
  try {
    // Убираем возможные markdown-обёртки
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Если модель добавила текст вокруг JSON — пробуем вытащить массив
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    return JSON.parse(cleaned);
  } catch (err) {
    logger.error('Failed to parse AI response', { content: content.substring(0, 200), error: err.message });
    return null;
  }
}

/**
 * Обогатить батч контактов
 */
async function enrichBatch(contacts, apiKey) {
  const prompt = buildEnrichmentPrompt(contacts);
  
  try {
    const { content, usage } = await callOpenRouter(prompt, apiKey);
    const results = parseAIResponse(content);
    
    if (!Array.isArray(results)) {
      throw new Error('AI response is not an array');
    }
    
    // Обновляем контакты
    const supabase = getSupabase();
    let enrichedCount = 0;
    
    for (const result of results) {
      const idx = Number(result?.i);
      const contact = contacts[idx];
      if (!contact) continue;
      
      const score = Math.min(100, Math.max(0, parseInt(result?.score) || 0));
      const confidenceRaw = parseInt(result?.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.min(100, Math.max(0, confidenceRaw))
        : (score > 0 ? 60 : 0);

      const normalizeText = (v) => {
        if (typeof v !== 'string') return null;
        const t = v.trim();
        return t.length ? t : null;
      };

      const normalizeStringArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) {
          return v.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, 10);
        }
        if (typeof v === 'string') {
          const t = v.trim();
          return t ? [t] : [];
        }
        return [];
      };
      
      const updateData = {
        company_name: normalizeText(result?.company),
        position: normalizeText(result?.position),
        position_type: ['CEO', 'DIRECTOR', 'MANAGER', 'SPECIALIST', 'FREELANCER', 'OTHER'].includes(result?.type) ? result.type : 'OTHER',
        is_decision_maker: result?.lpr === true || result?.type === 'CEO' || result?.type === 'DIRECTOR',
        industry: normalizeText(result?.industry),
        company_size: ['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN'].includes(result?.size) ? result.size : 'UNKNOWN',
        interests: normalizeStringArray(result?.interests),
        pain_points: normalizeStringArray(result?.pains || result?.pain_points),
        lead_score: score,
        enrichment_confidence: confidence,
        ai_summary: normalizeText(result?.summary),
        raw_ai_response: result,
        is_enriched: true,
        enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', contact.id);
      
      if (!error) {
        enrichedCount++;
      }
    }
    
    // Расчёт стоимости
    const cost = (usage.prompt_tokens * CONFIG.PRICE_INPUT / 1000000) +
                 (usage.completion_tokens * CONFIG.PRICE_OUTPUT / 1000000);
    
    return {
      enrichedCount,
      tokensUsed: usage.prompt_tokens + usage.completion_tokens,
      cost
    };
  } catch (err) {
    logger.error('Batch enrichment failed', { error: err.message });
    return { enrichedCount: 0, tokensUsed: 0, cost: 0, error: err.message };
  }
}

/**
 * Получить данные контакта из messages (параллельно)
 */
async function fetchContactData(supabase, contact) {
  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('message, bio, first_name, last_name, chat_name')
      .eq('username', contact.username)
      .order('message_time', { ascending: false })
      .limit(CONFIG.FETCH_MESSAGES_LIMIT);
    
    // Берём bio из messages если нет в контакте
    const msgWithBio = messages?.find(m => m.bio);
    const msgWithName = messages?.find(m => m.first_name);

    // Выбираем "самоописательные" сообщения вместо просто последних/длинных
    const SELF_PATTERNS = [
      // роли/должности
      /\b(ceo|founder|co-founder|owner|cto|cmo|coo|vp|head of|директор|гендир|генеральн\w*\s+директор|руководител\w*|владелец|собственник|основател\w*|соосновател\w*)\b/i,
      // "я работаю/занимаюсь"
      /\bя\s+(работаю|занимаюсь|делаю|помогаю|руковожу|управляю|веду)\b/i,
      // "моя/наша компания"
      /\b(моя|наша)\s+компани\w+\b/i,
      // явные формулировки услуг/профиля
      /\b(оказываю|предлагаю|продаю|настраиваю|делаю)\b/i,
      /\b(агентств\w+|студ\w+|компани\w+|стартап)\b/i
    ];

    const clean = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '');

    const scored = (messages || [])
      .map(m => {
        const text = clean(m.message);
        if (!text || text.length < 20) return null;
        let score = 0;
        for (const re of SELF_PATTERNS) {
          if (re.test(text)) score += 3;
        }
        // предпочитаем информативные, но не бесконечно длинные
        score += Math.min(3, Math.floor(text.length / 120));
        // небольшой бонус за био-совпадение (часто первое сообщение в чате "кто я")
        if (text.includes('@') || /https?:\/\//i.test(text)) score += 1;
        return { text, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // Дедуп по тексту и берём топ-4
    const seen = new Set();
    const selected = [];
    for (const item of scored) {
      if (selected.length >= 4) break;
      const key = item.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(item.text.substring(0, CONFIG.MAX_MESSAGE_LENGTH));
    }

    // Фолбэк: если ничего не выбрали, возьмём просто 2 самых длинных из последних
    const fallback = (messages || [])
      .map(m => clean(m.message))
      .filter(t => t && t.length > 30)
      .sort((a, b) => b.length - a.length)
      .slice(0, 2)
      .map(t => t.substring(0, CONFIG.MAX_MESSAGE_LENGTH));
    
    return {
      ...contact,
      bio: contact.bio || msgWithBio?.bio || null,
      first_name: contact.first_name || msgWithName?.first_name || null,
      last_name: contact.last_name || msgWithName?.last_name || null,
      top_messages: selected.length ? selected : fallback
    };
  } catch (err) {
    logger.error('Error fetching contact data', { username: contact.username, error: err.message });
    return { ...contact, bio: null, top_messages: [] };
  }
}

/**
 * Обработать массив батчами параллельно
 */
async function processInParallelBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Обогатить контакты
 */
export async function enrichContacts(options = {}) {
  const {
    apiKey,
    batchSize = CONFIG.ENRICHMENT_BATCH_SIZE,
    maxContacts = null,
    onlyWithBio = false
  } = options;
  
  if (!apiKey) {
    throw new Error('OpenRouter API key is required');
  }
  
  logger.info('Starting contact enrichment...', { batchSize, maxContacts, onlyWithBio });
  
  const supabase = getSupabase();
  const batchId = crypto.randomUUID();
  
  // Создаём лог
  await supabase.from('contact_enrichment_logs').insert({
    batch_id: batchId,
    model_used: CONFIG.MODEL
  });
  
  let totalEnriched = 0;
  let totalFailed = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let batchNumber = 0;
  
  let hasMore = true;
  
  while (hasMore) {
    batchNumber++;
    const batchStartTime = Date.now();
    
    // Получаем контакты для обогащения
    let query = supabase
      .from('contacts')
      .select('*')
      .eq('is_enriched', false)
      .order('created_at', { ascending: true })
      .limit(batchSize);
    
    // Опционально фильтруем только с bio
    if (onlyWithBio) {
      query = query.not('bio', 'is', null).neq('bio', '');
    }
    
    const { data: contacts, error } = await query;
    
    if (error) {
      logger.error('Error fetching contacts for enrichment', { error: error.message });
      break;
    }
    
    if (!contacts?.length) {
      hasMore = false;
      break;
    }
    
    // ⚡ ПАРАЛЛЕЛЬНОЕ получение данных из messages
    const contactsWithData = await processInParallelBatches(
      contacts,
      CONFIG.PARALLEL_DB_REQUESTS,
      (contact) => fetchContactData(supabase, contact)
    );
    
    // Разделяем на контакты с данными и без
    const toEnrich = [];
    const noData = [];
    
    for (const contact of contactsWithData) {
      if (contact.bio || contact.top_messages?.length > 0) {
        toEnrich.push(contact);
      } else {
        noData.push(contact);
      }
    }
    
    // Помечаем контакты без данных (параллельно)
    if (noData.length > 0) {
      const updatePromises = noData.map(contact => 
        supabase.from('contacts').update({
          is_enriched: true,
          enriched_at: new Date().toISOString(),
          lead_score: 0,
          enrichment_confidence: 0,
          ai_summary: 'Нет данных для анализа',
          updated_at: new Date().toISOString()
        }).eq('id', contact.id)
      );
      await Promise.all(updatePromises);
      totalFailed += noData.length;
    }
    
    // Обогащаем батч если есть контакты с данными
    if (toEnrich.length > 0) {
      const result = await enrichBatch(toEnrich, apiKey);
      
      totalEnriched += result.enrichedCount;
      totalFailed += toEnrich.length - result.enrichedCount;
      totalTokens += result.tokensUsed;
      totalCost += result.cost;
    }
    
    const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    
    logger.info(`Batch #${batchNumber} complete`, {
      contacts: contacts.length,
      withData: toEnrich.length,
      noData: noData.length,
      totalEnriched,
      totalFailed,
      totalCost: totalCost.toFixed(4),
      batchTimeSec: batchTime
    });
    
    // Обновляем лог после каждого батча
    await supabase
      .from('contact_enrichment_logs')
      .update({
        contacts_processed: totalEnriched + totalFailed,
        contacts_enriched: totalEnriched,
        contacts_failed: totalFailed,
        tokens_used: totalTokens,
        cost_usd: totalCost,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId);
    
    if (maxContacts && (totalEnriched + totalFailed) >= maxContacts) {
      break;
    }
    
    // Короткая пауза между батчами
    await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY_MS));
  }
  
  // Обновляем лог
  await supabase
    .from('contact_enrichment_logs')
    .update({
      contacts_processed: totalEnriched + totalFailed,
      contacts_enriched: totalEnriched,
      contacts_failed: totalFailed,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      finished_at: new Date().toISOString()
    })
    .eq('batch_id', batchId);
  
  logger.info('Contact enrichment complete', {
    totalEnriched,
    totalFailed,
    totalTokens,
    totalCost: totalCost.toFixed(4)
  });
  
  return {
    batchId,
    totalEnriched,
    totalFailed,
    totalTokens,
    totalCost
  };
}

// ============= СТАТИСТИКА =============

export async function getContactStats() {
  const supabase = getSupabase();
  
  const { data, error } = await supabase.rpc('get_contact_stats');
  
  if (error) {
    // Fallback - простые запросы
    const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    const { count: enriched } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('is_enriched', true);
    const { count: lprs } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('is_decision_maker', true);
    const { count: withBio } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).not('bio', 'is', null).neq('bio', '');
    
    return {
      total: total || 0,
      enriched: enriched || 0,
      notEnriched: (total || 0) - (enriched || 0),
      lprs: lprs || 0,
      withBio: withBio || 0
    };
  }
  
  return data;
}

export default {
  aggregateContacts,
  enrichContacts,
  getContactStats
};
