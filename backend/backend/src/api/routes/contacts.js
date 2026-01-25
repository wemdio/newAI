/**
 * API Routes for Contacts
 * Управление базой контактов и обогащением
 */

import express from 'express';
import { getSupabase } from '../../config/database.js';
import { aggregateContacts, enrichContacts, getContactStats } from '../../services/contactEnrichment.js';
import { recalculateIndustryCategories } from '../../services/contactIndustry.js';
import logger from '../../utils/logger.js';
import { normalizeCompanyName, normalizePositionTitle, normalizePositionType } from '../../utils/contactNormalization.js';

const router = express.Router();

// ============= ADMIN CONFIG =============
// Список email администраторов
const ADMIN_EMAILS = [
  'egorkanigin@polzaagency.ru',
  'admin@leadparser.app'
];

// Проверка админа по email
function isAdmin(userEmail) {
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}

const VALID_SORT_FIELDS = ['messages_count', 'lead_score', 'last_seen_at', 'created_at', 'first_name'];

const applyContactFilters = (query, filters) => {
  const {
    is_decision_maker,
    position_type,
    is_enriched,
    min_score,
    max_score,
    min_messages,
    industry,
    industry_category,
    search,
    is_spam,
    is_low_quality,
    hide_spam,
    hide_low_quality
  } = filters;

  const hideSpam = hide_spam !== 'false' && hide_spam !== false && hide_spam !== '0';
  const hideLowQuality = hide_low_quality !== 'false' && hide_low_quality !== false && hide_low_quality !== '0';

  if (is_decision_maker === 'true') {
    query = query.eq('is_decision_maker', true);
  }

  if (position_type) {
    query = query.eq('position_type', position_type);
  }

  if (is_enriched === 'true') {
    query = query.eq('is_enriched', true);
  } else if (is_enriched === 'false') {
    query = query.eq('is_enriched', false);
  }

  if (min_score) {
    query = query.gte('lead_score', parseInt(min_score, 10));
  }

  if (max_score) {
    query = query.lte('lead_score', parseInt(max_score, 10));
  }

  if (min_messages) {
    query = query.gte('messages_count', parseInt(min_messages, 10));
  }

  if (industry) {
    query = query.ilike('industry', `%${industry}%`);
  }

  if (industry_category) {
    const raw = String(industry_category);
    const categories = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (categories.length > 1) {
      query = query.in('industry_category', categories);
    } else if (categories.length === 1) {
      query = query.eq('industry_category', categories[0]);
    }
  }

  if (search) {
    query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,bio.ilike.%${search}%,company_name.ilike.%${search}%`);
  }

  if (is_spam === 'true') {
    query = query.eq('is_spam', true);
  } else if (is_spam === 'false') {
    query = query.eq('is_spam', false);
  } else if (hideSpam) {
    query = query.eq('is_spam', false);
  }

  if (is_low_quality === 'true') {
    query = query.eq('is_low_quality', true);
  } else if (is_low_quality === 'false') {
    query = query.eq('is_low_quality', false);
  } else if (hideLowQuality) {
    query = query.eq('is_low_quality', false);
  }

  return query;
};

const applyContactSorting = (query, sort_by, sort_order) => {
  const sortField = VALID_SORT_FIELDS.includes(sort_by) ? sort_by : 'messages_count';
  return query.order(sortField, { ascending: sort_order === 'asc' });
};

const applyQualityExclusions = (query, options = {}) => {
  const includeSpam = options.include_spam === 'true' || options.include_spam === true;
  const includeLowQuality = options.include_low_quality === 'true' || options.include_low_quality === true;

  if (!includeSpam) {
    query = query.eq('is_spam', false);
  }

  if (!includeLowQuality) {
    query = query.eq('is_low_quality', false);
  }

  return query;
};

// ============= GET /api/contacts =============
// Получить список контактов с фильтрацией и пагинацией
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      // Фильтры
      is_decision_maker,
      position_type,
      is_enriched,
      min_score,
      max_score,
      min_messages,
      industry,
      industry_category,
      search,
      is_spam,
      is_low_quality,
      hide_spam,
      hide_low_quality,
      // Сортировка
      sort_by = 'messages_count',
      sort_order = 'desc'
    } = req.query;
    
    const supabase = getSupabase();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' });
    
    query = applyContactFilters(query, {
      is_decision_maker,
      position_type,
      is_enriched,
      min_score,
      max_score,
      min_messages,
      industry,
      industry_category,
      search,
      is_spam,
      is_low_quality,
      hide_spam,
      hide_low_quality
    });
    
    query = applyContactSorting(query, sort_by, sort_order);
    
    // Пагинация
    query = query.range(offset, offset + parseInt(limit) - 1);
    
    const { data: contacts, count, error } = await query;
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching contacts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= GET /api/contacts/stats =============
// Статистика по контактам
router.get('/stats', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { include_spam, include_low_quality } = req.query;
    
    // Общая статистика
    const { count: total } = await applyQualityExclusions(
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      { include_spam, include_low_quality }
    );
    
    const { count: enriched } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('is_enriched', true),
      { include_spam, include_low_quality }
    );
    
    const { count: lprs } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('is_decision_maker', true),
      { include_spam, include_low_quality }
    );
    
    const { count: withBio } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .not('bio', 'is', null)
        .neq('bio', ''),
      { include_spam, include_low_quality }
    );
    
    // Статистика по position_type
    const { data: positionStats } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('position_type')
        .eq('is_enriched', true),
      { include_spam, include_low_quality }
    );
    
    const positionCounts = {};
    positionStats?.forEach(c => {
      const type = c.position_type || 'OTHER';
      positionCounts[type] = (positionCounts[type] || 0) + 1;
    });
    
    // Топ отраслей
    const { data: industryStats } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('industry')
        .eq('is_enriched', true)
        .not('industry', 'is', null),
      { include_spam, include_low_quality }
    );
    
    const industryCounts = {};
    industryStats?.forEach(c => {
      if (c.industry) {
        industryCounts[c.industry] = (industryCounts[c.industry] || 0) + 1;
      }
    });
    
    const topIndustries = Object.entries(industryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    
    // Распределение по score
    const { data: scoreData } = await applyQualityExclusions(
      supabase
        .from('contacts')
        .select('lead_score')
        .eq('is_enriched', true),
      { include_spam, include_low_quality }
    );

    const { count: spam } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_spam', true);

    const { count: lowQuality } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_low_quality', true);
    
    const scoreRanges = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    scoreData?.forEach(c => {
      const score = c.lead_score || 0;
      if (score <= 20) scoreRanges['0-20']++;
      else if (score <= 40) scoreRanges['21-40']++;
      else if (score <= 60) scoreRanges['41-60']++;
      else if (score <= 80) scoreRanges['61-80']++;
      else scoreRanges['81-100']++;
    });
    
    // Стоимость обогащения
    const { data: costData } = await supabase
      .from('contact_enrichment_logs')
      .select('cost_usd, tokens_used, contacts_enriched')
      .order('started_at', { ascending: false })
      .limit(100);
    
    const totalCost = costData?.reduce((sum, log) => sum + (parseFloat(log.cost_usd) || 0), 0) || 0;
    const totalTokens = costData?.reduce((sum, log) => sum + (log.tokens_used || 0), 0) || 0;
    
    res.json({
      success: true,
      stats: {
        total: total || 0,
        enriched: enriched || 0,
        notEnriched: (total || 0) - (enriched || 0),
        lprs: lprs || 0,
        withBio: withBio || 0,
        spam: spam || 0,
        lowQuality: lowQuality || 0,
        positionTypes: positionCounts,
        topIndustries,
        scoreDistribution: scoreRanges,
        enrichmentCost: {
          totalUsd: totalCost.toFixed(4),
          totalTokens
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching contact stats', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= GET /api/contacts/admin/check =============
// Проверка прав администратора (должен быть ПЕРЕД /:id !)
router.get('/admin/check', async (req, res) => {
  try {
    // Используем email из заголовка (добавляется в api.js интерцепторе)
    const userEmail = req.headers['x-user-email'];
    
    logger.info('Admin check', { userEmail });
    
    res.json({
      success: true,
      isAdmin: isAdmin(userEmail)
    });
  } catch (error) {
    logger.error('Error checking admin status', { error: error.message });
    res.json({ success: true, isAdmin: false });
  }
});

// ============= GET /api/contacts/:id =============
// Получить контакт с его сообщениями
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    // Получаем контакт
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    
    // Получаем сообщения контакта
    const { data: messages } = await supabase
      .from('messages')
      .select('id, message, message_time, chat_name')
      .eq('username', contact.username)
      .order('message_time', { ascending: false })
      .limit(50);
    
    res.json({
      success: true,
      contact,
      messages: messages || []
    });
  } catch (error) {
    logger.error('Error fetching contact', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/aggregate =============
// Запустить агрегацию контактов
router.post('/aggregate', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const { maxContacts = 5000 } = req.body;
    
    logger.info('Starting contact aggregation via API', { maxContacts });
    
    // Запускаем в фоне
    res.json({
      success: true,
      message: 'Aggregation started in background',
      maxContacts
    });
    
    // Асинхронная агрегация
    aggregateContacts({ maxContacts })
      .then(result => {
        logger.info('Aggregation completed', result);
      })
      .catch(err => {
        logger.error('Aggregation failed', { error: err.message });
      });
    
  } catch (error) {
    logger.error('Error starting aggregation', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/update-data =============
// Обновить данные контактов (bio, имена) из messages
router.post('/update-data', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const { batchSize = 500 } = req.body;
    const supabase = getSupabase();
    
    logger.info('Starting contact data update from messages');
    
    res.json({
      success: true,
      message: 'Data update started in background'
    });
    
    // Асинхронное обновление
    (async () => {
      let totalUpdated = 0;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        // Получаем контакты без bio
        const { data: contacts, error } = await supabase
          .from('contacts')
          .select('id, username')
          .or('bio.is.null,bio.eq.')
          .range(offset, offset + batchSize - 1);
        
        if (error || !contacts?.length) {
          hasMore = false;
          break;
        }
        
        // Обновляем каждый контакт
        for (const contact of contacts) {
          try {
            const { data: messages } = await supabase
              .from('messages')
              .select('first_name, last_name, bio, user_id, profile_link')
              .eq('username', contact.username)
              .not('bio', 'is', null)
              .neq('bio', '')
              .order('message_time', { ascending: false })
              .limit(1);
            
            if (messages?.length) {
              const msg = messages[0];
              await supabase
                .from('contacts')
                .update({
                  first_name: msg.first_name || null,
                  last_name: msg.last_name || null,
                  bio: msg.bio,
                  telegram_user_id: msg.user_id,
                  profile_link: msg.profile_link,
                  updated_at: new Date().toISOString()
                })
                .eq('id', contact.id);
              
              totalUpdated++;
            }
          } catch (err) {
            // Ignore individual errors
          }
        }
        
        logger.info('Contact data update progress', { checked: offset + contacts.length, updated: totalUpdated });
        offset += batchSize;
        
        // Small delay to not overload API
        await new Promise(r => setTimeout(r, 50));
      }
      
      logger.info('Contact data update completed', { totalUpdated });
    })();
    
  } catch (error) {
    logger.error('Error starting data update', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/normalize =============
// Нормализовать компании/должности/типы ролей (без AI, только чистка) — только для админа
router.post('/normalize', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const {
      batchSize = 1000,
      maxContacts = null,
      onlyEnriched = true
    } = req.body || {};

    const supabase = getSupabase();

    res.json({
      success: true,
      message: 'Normalization started in background',
      batchSize,
      onlyEnriched
    });

    (async () => {
      let offset = 0;
      let processed = 0;
      let updated = 0;

      try {
        while (true) {
          let query = supabase
            .from('contacts')
            .select('id, company_name, position, position_type, raw_ai_response')
            .order('created_at', { ascending: true })
            .range(offset, offset + batchSize - 1);

          if (onlyEnriched) {
            query = query.eq('is_enriched', true);
          }

          const { data: contacts, error } = await query;
          if (error) throw error;
          if (!contacts?.length) break;

          const updates = [];

          for (const c of contacts) {
            const raw = c.raw_ai_response || {};

            const companySource = c.company_name || raw.company || null;
            const positionSource = c.position || raw.position || null;
            const typeSource = c.position_type || raw.type || 'OTHER';

            const normalizedCompany = normalizeCompanyName(companySource);
            const normalizedPosition = normalizePositionTitle(positionSource);
            const normalizedType = normalizePositionType(typeSource, `${normalizedPosition || ''} ${raw.position_evidence || ''}`);

            const changed =
              (normalizedCompany || null) !== (c.company_name || null) ||
              (normalizedPosition || null) !== (c.position || null) ||
              (normalizedType || 'OTHER') !== (c.position_type || 'OTHER');

            if (changed) {
              updates.push({
                id: c.id,
                company_name: normalizedCompany,
                position: normalizedPosition,
                position_type: normalizedType,
                updated_at: new Date().toISOString()
              });
            }
          }

          if (updates.length > 0) {
            const { error: upsertError } = await supabase
              .from('contacts')
              .upsert(updates, { onConflict: 'id' });

            if (!upsertError) updated += updates.length;
          }

          processed += contacts.length;
          offset += batchSize;

          logger.info('Contacts normalization progress', { processed, updated });

          if (maxContacts && processed >= maxContacts) break;

          await new Promise(r => setTimeout(r, 50));
        }

        logger.info('Contacts normalization completed', { processed, updated });
      } catch (err) {
        logger.error('Contacts normalization failed', { error: err.message, processed, updated });
      }
    })();

  } catch (error) {
    logger.error('Error starting contacts normalization', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/recalculate-industry =============
// Пересчитать сферы деятельности (без AI) — только для админа
router.post('/recalculate-industry', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const {
      batchSize = 500,
      onlyEnriched = true,
      overwrite = false
    } = req.body || {};

    res.json({
      success: true,
      message: 'Industry categorization started in background',
      batchSize,
      onlyEnriched,
      overwrite
    });

    (async () => {
      try {
        const result = await recalculateIndustryCategories({ batchSize, onlyEnriched, overwrite });
        logger.info('Industry categorization completed', result);
      } catch (err) {
        logger.error('Industry categorization failed', { error: err.message });
      }
    })();
  } catch (error) {
    logger.error('Error starting industry categorization', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/enrich =============
// Запустить обогащение контактов
router.post('/enrich', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const {
      apiKey,  // API ключ передаётся в запросе
      maxContacts = 50000,  // По умолчанию до 50k, можно обогатить все
      onlyWithBio = false,
      minMessages = 1,
      // 2-tier: второй проход сильной моделью для топ/сомнительных
      twoTier = false,
      advancedMinScore = 70,
      advancedMaxConfidence = 50,
      maxAdvancedContacts = null
    } = req.body;
    
    // Проверяем наличие API ключа
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({
        success: false,
        error: 'OpenRouter API key is required. Please enter your API key.'
      });
    }
    
    const supabase = getSupabase();
    
    logger.info('Starting contact enrichment via API', { maxContacts, onlyWithBio, minMessages });
    
    // Считаем сколько контактов для обогащения
    let countQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_enriched', false)
      .gte('messages_count', minMessages);
    
    if (onlyWithBio) {
      countQuery = countQuery.not('bio', 'is', null).neq('bio', '');
    }
    
    const { count } = await countQuery;
    
    const actualMax = Math.min(maxContacts, count || 0);
    
    if (actualMax === 0) {
      return res.json({
        success: true,
        message: 'No contacts to enrich',
        contactsToEnrich: 0,
        estimatedCostUsd: '0.0000'
      });
    }
    
    // Оценка стоимости (Qwen 2.5-7B: $0.04/1M input, $0.10/1M output)
    // ~100 токенов на контакт с батчингом по 30
    const estimatedTokens = actualMax * 100;
    const estimatedCost = (estimatedTokens * 0.04 / 1000000) + (estimatedTokens * 0.3 * 0.10 / 1000000);
    
    res.json({
      success: true,
      message: 'Enrichment started in background',
      contactsToEnrich: actualMax,
      estimatedCostUsd: estimatedCost.toFixed(4),
      twoTier: !!twoTier,
      // оценка второго прохода зависит от модели; тут показываем только лимит/правила отбора
      advancedSelection: twoTier ? { advancedMinScore, advancedMaxConfidence, maxAdvancedContacts } : null
    });
    
    // Асинхронное обогащение с переданным ключом
    enrichContacts({
      apiKey: apiKey.trim(),
      maxContacts: actualMax,
      onlyWithBio,
      minMessages,
      twoTier: !!twoTier,
      advancedMinScore,
      advancedMaxConfidence,
      maxAdvancedContacts
    })
      .then(result => {
        logger.info('Enrichment completed', result);
      })
      .catch(err => {
        logger.error('Enrichment failed', { error: err.message });
      });
    
  } catch (error) {
    logger.error('Error starting enrichment', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= GET /api/contacts/export/csv =============
// Экспорт контактов в CSV
router.get('/export/csv', async (req, res) => {
  try {
    const {
      is_decision_maker,
      position_type,
      min_score,
      max_score,
      min_messages,
      industry,
      industry_category,
      search,
      is_enriched,
      is_spam,
      is_low_quality,
      hide_spam,
      hide_low_quality,
      sort_by = 'messages_count',
      sort_order = 'desc'
    } = req.query;
    
    const supabase = getSupabase();
    
    const EXPORT_BATCH_SIZE = 1000;
    let offset = 0;
    const contacts = [];
    let hasMore = true;
    
    while (hasMore) {
      let query = supabase
        .from('contacts')
        .select('username, first_name, last_name, bio, company_name, position, position_type, is_decision_maker, industry, industry_category, lead_score, messages_count, source_chats, ai_summary');

      query = applyContactFilters(query, {
        is_decision_maker,
        position_type,
        is_enriched,
        min_score,
        max_score,
        min_messages,
        industry,
        search,
        is_spam,
        is_low_quality,
        hide_spam,
        hide_low_quality
      });
      
      query = applyContactSorting(query, sort_by, sort_order);
      query = query.range(offset, offset + EXPORT_BATCH_SIZE - 1);
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }
      
      contacts.push(...data);
      
      if (data.length < EXPORT_BATCH_SIZE) {
        hasMore = false;
        break;
      }
      
      offset += EXPORT_BATCH_SIZE;
    }
    
    // Формируем CSV
    const headers = [
      'Username',
      'First Name',
      'Last Name',
      'Bio',
      'Company',
      'Position',
      'Position Type',
      'Is LPR',
      'Industry',
      'Industry Category',
      'Lead Score',
      'Messages Count',
      'Source Chats',
      'AI Summary'
    ];
    
    const rows = contacts.map(c => [
      c.username ? `@${c.username}` : '',
      c.first_name || '',
      c.last_name || '',
      c.bio ? `"${c.bio.replace(/"/g, '""')}"` : '',
      c.company_name || '',
      c.position || '',
      c.position_type || '',
      c.is_decision_maker ? 'Yes' : 'No',
      c.industry || '',
      c.industry_category || '',
      c.lead_score || 0,
      c.messages_count || 0,
      c.source_chats?.join(', ') || '',
      c.ai_summary ? `"${c.ai_summary.replace(/"/g, '""')}"` : ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=contacts_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv); // BOM для Excel
    
  } catch (error) {
    logger.error('Error exporting contacts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= DELETE /api/contacts/:id =============
// Удалить контакт
router.delete('/:id', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const { id } = req.params;
    const supabase = getSupabase();
    
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    logger.error('Error deleting contact', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= POST /api/contacts/reset-enrichment =============
// Сбросить обогащение для повторной обработки (только для админа)
router.post('/reset-enrichment', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const supabase = getSupabase();
    
    logger.info('Resetting enrichment status for all contacts');
    
    // Сбрасываем флаг обогащения и все AI-данные
    const { data, error } = await supabase
      .from('contacts')
      .update({
        is_enriched: false,
        company_name: null,
        position: null,
        position_type: 'UNKNOWN',
        is_decision_maker: false,
        industry: null,
        company_size: 'UNKNOWN',
        interests: null,
        pain_points: null,
        lead_score: 0,
        enrichment_confidence: null,
        ai_summary: null,
        raw_ai_response: null,
        enriched_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('is_enriched', true);
    
    if (error) throw error;
    
    // Считаем сколько сбросили
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_enriched', false);
    
    logger.info('Enrichment reset completed', { resetCount: count });
    
    res.json({
      success: true,
      message: 'Enrichment reset completed',
      resetCount: count
    });
  } catch (error) {
    logger.error('Error resetting enrichment', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
