import express from 'express';
import { getSupabase } from '../../config/database.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const ADMIN_EMAILS = ['egorkanigin@polzaagency.ru', 'admin@leadparser.app'];

const requireAdmin = (req, res, next) => {
  const email = req.headers['x-user-email'];
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.get('/status', requireAdmin, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  const { data: configRow } = await supabase
    .from('system_config')
    .select('value, updated_at')
    .eq('key', 'leadbot_enabled')
    .single();

  const enabled = configRow?.value === true;

  const { count: totalLeads } = await supabase
    .from('categorized_leads')
    .select('*', { count: 'exact', head: true });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: leadsToday } = await supabase
    .from('categorized_leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneDayAgo);

  res.json({
    success: true,
    enabled,
    updatedAt: configRow?.updated_at,
    stats: {
      totalLeads: totalLeads || 0,
      leadsLast24h: leadsToday || 0,
    }
  });
}));

router.post('/toggle', requireAdmin, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) is required' });
  }

  const email = req.headers['x-user-email'];
  const supabase = getSupabase();

  const { error } = await supabase
    .from('system_config')
    .upsert({
      key: 'leadbot_enabled',
      value: enabled,
      updated_by: email,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  if (error) {
    logger.error('[LeadbotAPI] Toggle failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to update setting' });
  }

  logger.info('[LeadbotAPI] Lead bot toggled', { enabled, by: email });

  res.json({
    success: true,
    message: `Lead bot ${enabled ? 'enabled' : 'disabled'}`,
    enabled
  });
}));

router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  const { count: total } = await supabase
    .from('categorized_leads')
    .select('*', { count: 'exact', head: true });

  const { data: byCatRaw } = await supabase
    .from('categorized_leads')
    .select('category');

  const byCat = [];
  if (byCatRaw) {
    const map = {};
    for (const r of byCatRaw) {
      map[r.category] = (map[r.category] || 0) + 1;
    }
    for (const [category, count] of Object.entries(map)) {
      byCat.push({ category, count });
    }
    byCat.sort((a, b) => b.count - a.count);
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: leadsToday } = await supabase
    .from('categorized_leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneDayAgo);

  res.json({
    success: true,
    stats: {
      total: total || 0,
      leadsLast24h: leadsToday || 0,
      byCategory: byCat
    }
  });
}));

export default router;
