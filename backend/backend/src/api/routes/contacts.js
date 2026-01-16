/**
 * API Routes for Contacts
 * Управление базой контактов и обогащением
 */

import express from 'express';
import { getSupabase } from '../../config/database.js';
import { aggregateContacts, enrichContacts, getContactStats } from '../../services/contactEnrichment.js';
import logger from '../../utils/logger.js';

const router = express.Router();

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
      search,
      // Сортировка
      sort_by = 'messages_count',
      sort_order = 'desc'
    } = req.query;
    
    const supabase = getSupabase();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' });
    
    // Применяем фильтры
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
      query = query.gte('lead_score', parseInt(min_score));
    }
    
    if (max_score) {
      query = query.lte('lead_score', parseInt(max_score));
    }
    
    if (min_messages) {
      query = query.gte('messages_count', parseInt(min_messages));
    }
    
    if (industry) {
      query = query.ilike('industry', `%${industry}%`);
    }
    
    if (search) {
      query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,bio.ilike.%${search}%,company_name.ilike.%${search}%`);
    }
    
    // Сортировка
    const validSortFields = ['messages_count', 'lead_score', 'last_seen_at', 'created_at', 'first_name'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'messages_count';
    query = query.order(sortField, { ascending: sort_order === 'asc' });
    
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
    
    // Общая статистика
    const { count: total } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });
    
    const { count: enriched } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_enriched', true);
    
    const { count: lprs } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('is_decision_maker', true);
    
    const { count: withBio } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .not('bio', 'is', null)
      .neq('bio', '');
    
    // Статистика по position_type
    const { data: positionStats } = await supabase
      .from('contacts')
      .select('position_type')
      .eq('is_enriched', true);
    
    const positionCounts = {};
    positionStats?.forEach(c => {
      const type = c.position_type || 'OTHER';
      positionCounts[type] = (positionCounts[type] || 0) + 1;
    });
    
    // Топ отраслей
    const { data: industryStats } = await supabase
      .from('contacts')
      .select('industry')
      .eq('is_enriched', true)
      .not('industry', 'is', null);
    
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
    const { data: scoreData } = await supabase
      .from('contacts')
      .select('lead_score')
      .eq('is_enriched', true);
    
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

// ============= POST /api/contacts/enrich =============
// Запустить обогащение контактов
router.post('/enrich', async (req, res) => {
  try {
    const {
      maxContacts = 1000,
      onlyWithBio = false,
      minMessages = 1
    } = req.body;
    
    const supabase = getSupabase();
    
    // Получаем API ключ пользователя
    // Для простоты берём первый активный конфиг
    const { data: config } = await supabase
      .from('user_config')
      .select('openrouter_api_key')
      .eq('is_active', true)
      .not('openrouter_api_key', 'is', null)
      .limit(1)
      .single();
    
    if (!config?.openrouter_api_key) {
      return res.status(400).json({
        success: false,
        error: 'OpenRouter API key not found. Please configure it in Settings.'
      });
    }
    
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
    
    // Оценка стоимости (примерно)
    // ~500 токенов на контакт при батче по 30
    const estimatedTokens = actualMax * 100; // ~100 токенов на контакт с батчингом
    const estimatedCost = (estimatedTokens * 0.04 / 1000000) + (estimatedTokens * 0.3 * 0.10 / 1000000);
    
    res.json({
      success: true,
      message: 'Enrichment started in background',
      contactsToEnrich: actualMax,
      estimatedCostUsd: estimatedCost.toFixed(4)
    });
    
    // Асинхронное обогащение
    enrichContacts({
      apiKey: config.openrouter_api_key,
      maxContacts: actualMax,
      onlyWithBio,
      minMessages
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
      is_enriched = 'true'
    } = req.query;
    
    const supabase = getSupabase();
    
    let query = supabase
      .from('contacts')
      .select('username, first_name, last_name, bio, company_name, position, position_type, is_decision_maker, industry, lead_score, messages_count, source_chats, ai_summary')
      .order('lead_score', { ascending: false })
      .limit(10000);
    
    if (is_enriched === 'true') {
      query = query.eq('is_enriched', true);
    }
    
    if (is_decision_maker === 'true') {
      query = query.eq('is_decision_maker', true);
    }
    
    if (position_type) {
      query = query.eq('position_type', position_type);
    }
    
    if (min_score) {
      query = query.gte('lead_score', parseInt(min_score));
    }
    
    const { data: contacts, error } = await query;
    
    if (error) throw error;
    
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

export default router;
