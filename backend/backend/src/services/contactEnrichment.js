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
  ENRICHMENT_BATCH_SIZE: 30,       // Сколько контактов отправлять в один запрос AI
  
  // API
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1/chat/completions',
  
  // Цены Qwen 2.5-7B (за 1M токенов)
  PRICE_INPUT: 0.04,
  PRICE_OUTPUT: 0.10,
  
  // Лимиты
  MAX_BIO_LENGTH: 200,
  MAX_MESSAGE_LENGTH: 300,
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
 * Промпт для обогащения контактов
 */
function buildEnrichmentPrompt(contacts) {
  const contactsText = contacts.map((c, i) => {
    const bio = c.bio ? c.bio.substring(0, CONFIG.MAX_BIO_LENGTH) : '-';
    const msgs = c.top_messages?.slice(0, 3).join(' | ') || '-';
    return `[${i}] @${c.username} | Bio: ${bio} | Msgs: ${msgs}`;
  }).join('\n');
  
  return `Проанализируй ${contacts.length} профилей Telegram. ВСЯ ИНФОРМАЦИЯ ДОЛЖНА БЫТЬ НА РУССКОМ ЯЗЫКЕ.

Определи для каждого:
- company: название компании на русском (если есть)
- position: должность НА РУССКОМ (например: Директор, Менеджер, Разработчик, Маркетолог, Предприниматель)
- type: CEO/DIRECTOR/MANAGER/SPECIALIST/FREELANCER/OTHER (это оставь на английском для системы)
- lpr: true если ЛПР (владелец, директор, основатель, CEO)
- industry: отрасль бизнеса НА РУССКОМ (например: IT, Маркетинг, Образование, E-commerce, Финансы)
- size: SOLO/SMALL/MEDIUM/LARGE/UNKNOWN (это оставь на английском)
- interests: массив интересов НА РУССКОМ (макс 3)
- pains: массив проблем/болей НА РУССКОМ (макс 3)
- score: 0-100 (качество как лида)
- confidence: 0-100 (уверенность анализа)
- summary: 1 предложение о человеке НА РУССКОМ

ПРОФИЛИ:
${contactsText}

ВАЖНО: Все текстовые поля (position, industry, interests, pains, summary) ОБЯЗАТЕЛЬНО на русском языке!

Ответь ТОЛЬКО JSON массивом (без markdown):
[{"i":0,"company":"...","position":"...","type":"...","lpr":true,"industry":"...","size":"...","interests":[],"pains":[],"score":50,"confidence":70,"summary":"..."},...]`;
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
      max_tokens: 2000
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
      const contact = contacts[result.i];
      if (!contact) continue;
      
      const updateData = {
        company_name: result.company || null,
        position: result.position || null,
        position_type: result.type || 'OTHER',
        is_decision_maker: result.lpr === true,
        industry: result.industry || null,
        company_size: result.size || 'UNKNOWN',
        interests: result.interests || [],
        pain_points: result.pains || [],
        lead_score: Math.min(100, Math.max(0, result.score || 0)),
        enrichment_confidence: Math.min(100, Math.max(0, result.confidence || 0)),
        ai_summary: result.summary || null,
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
 * Обогатить контакты
 */
export async function enrichContacts(options = {}) {
  const {
    apiKey,
    batchSize = CONFIG.ENRICHMENT_BATCH_SIZE,
    maxContacts = null,
    onlyWithBio = false,
    minMessages = 1
  } = options;
  
  if (!apiKey) {
    throw new Error('OpenRouter API key is required');
  }
  
  logger.info('Starting contact enrichment...', { batchSize, maxContacts, onlyWithBio, minMessages });
  
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
  
  let hasMore = true;
  
  while (hasMore) {
    // Получаем контакты для обогащения
    let query = supabase
      .from('contacts')
      .select('*')
      .eq('is_enriched', false)
      .gte('messages_count', minMessages)
      .order('messages_count', { ascending: false })
      .limit(batchSize);
    
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
    
    // Получаем top_messages для каждого контакта
    for (const contact of contacts) {
      const { data: messages } = await supabase
        .from('messages')
        .select('message')
        .eq('username', contact.username)
        .not('message', 'is', null)
        .order('message_time', { ascending: false })
        .limit(5);
      
      contact.top_messages = messages?.map(m => m.message?.substring(0, CONFIG.MAX_MESSAGE_LENGTH)) || [];
    }
    
    // Обогащаем батч
    const result = await enrichBatch(contacts, apiKey);
    
    totalEnriched += result.enrichedCount;
    totalFailed += contacts.length - result.enrichedCount;
    totalTokens += result.tokensUsed;
    totalCost += result.cost;
    
    logger.info('Enrichment progress', {
      batch: contacts.length,
      enriched: result.enrichedCount,
      totalEnriched,
      totalCost: totalCost.toFixed(4)
    });
    
    if (maxContacts && totalEnriched >= maxContacts) {
      break;
    }
    
    // Небольшая пауза между батчами
    await new Promise(resolve => setTimeout(resolve, 500));
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
