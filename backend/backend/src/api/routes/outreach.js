import express from 'express';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const supabase = getSupabase();

// Middleware to get user_id from request (assuming auth middleware sets req.user)
// But since I don't see explicit auth middleware in server.js globally, I should check how other routes do it.
// auth.js suggests /api/auth handles login. 
// Usually there is a verifyToken middleware.
// Let's check other routes like 'config.js' to see how they protect routes.

// ================= ACCOUNTS =================

// GET /api/outreach/accounts
router.get('/accounts', async (req, res) => {
  const userId = req.headers['x-user-id']; // Or from auth token
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching outreach accounts', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/accounts
router.post('/accounts', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { phone_number, api_id, api_hash, session_string, proxy_url } = req.body;

  try {
    const { data, error } = await supabase
      .from('outreach_accounts')
      .insert([{
        user_id: userId,
        phone_number,
        api_id,
        api_hash,
        session_string,
        proxy_url,
        status: 'active'
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    logger.error('Error creating outreach account', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= CAMPAIGNS =================

// GET /api/outreach/campaigns
router.get('/campaigns', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching campaigns', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns
router.post('/campaigns', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, message_template, account_ids } = req.body;

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .insert([{
        user_id: userId,
        name,
        message_template,
        account_ids: account_ids || [],
        status: 'draft'
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    logger.error('Error creating campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= TARGETS =================

// POST /api/outreach/campaigns/:id/targets
// Bulk add targets (usernames/phones)
router.post('/campaigns/:id/targets', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const campaignId = req.params.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targets } = req.body; // Array of { username, phone }

  if (!targets || !Array.isArray(targets)) {
    return res.status(400).json({ error: 'Invalid targets format' });
  }

  try {
    // Verify campaign ownership
    const { data: campaign, error: campError } = await supabase
      .from('outreach_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
      
    if (campError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const rows = targets.map(t => ({
      campaign_id: campaignId,
      username: t.username,
      phone: t.phone,
      status: 'pending'
    }));

    const { data, error } = await supabase
      .from('outreach_targets')
      .insert(rows)
      .select();

    if (error) throw error;
    res.status(201).json({ count: data.length, message: 'Targets added' });
  } catch (error) {
    logger.error('Error adding targets', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;

