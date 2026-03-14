import express from 'express';
import { getSupabase } from '../../config/database.js';
import { getCategoryClassifierStatus } from '../../services/categoryClassifier.js';
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
  const status = getCategoryClassifierStatus();

  const supabase = getSupabase();
  const { data } = await supabase
    .from('system_config')
    .select('value, updated_at, updated_by')
    .eq('key', 'category_classifier_enabled')
    .single();

  res.json({
    success: true,
    enabled: data?.value === true,
    updatedAt: data?.updated_at,
    updatedBy: data?.updated_by,
    runtime: status
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
    .update({ value: enabled, updated_by: email, updated_at: new Date().toISOString() })
    .eq('key', 'category_classifier_enabled');

  if (error) {
    logger.error('[ClassifierAPI] Toggle failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to update setting' });
  }

  logger.info('[ClassifierAPI] Classifier toggled', { enabled, by: email });

  res.json({
    success: true,
    message: `Category classifier ${enabled ? 'enabled' : 'disabled'}`,
    enabled
  });
}));

router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const supabase = getSupabase();

  const { data: counts } = await supabase.rpc('get_categorized_leads_stats').catch(() => ({ data: null }));

  if (counts) {
    return res.json({ success: true, stats: counts });
  }

  const { count: total } = await supabase
    .from('categorized_leads')
    .select('*', { count: 'exact', head: true });

  const { data: byCat } = await supabase
    .from('categorized_leads')
    .select('category')
    .then(({ data }) => {
      if (!data) return { data: [] };
      const map = {};
      for (const r of data) {
        map[r.category] = (map[r.category] || 0) + 1;
      }
      return { data: Object.entries(map).map(([category, count]) => ({ category, count })) };
    });

  res.json({
    success: true,
    stats: { total: total || 0, byCategory: byCat || [] }
  });
}));

export default router;
