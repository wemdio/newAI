import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const supabase = getSupabase();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to get user ID from request
const getUserId = (req) => req.headers['x-user-id'];

// ================= ACCOUNTS =================

// GET /api/outreach/accounts
router.get('/accounts', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching outreach accounts', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/accounts
router.post('/accounts', async (req, res) => {
  const userId = getUserId(req);
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

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Account with this phone number already exists.' });
      }
      throw error;
    }
    res.status(201).json(data[0]);
  } catch (error) {
    logger.error('Error creating outreach account', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/outreach/accounts/:id - Update account
router.patch('/accounts/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const accountId = req.params.id;

  const allowedFields = ['phone_number', 'api_id', 'api_hash', 'session_string', 'proxy_url', 'status'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  try {
    const { data, error } = await supabase
      .from('outreach_accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(data[0]);
  } catch (error) {
    logger.error('Error updating account', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const accountId = req.params.id;

  try {
    const { error } = await supabase
      .from('outreach_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) throw error;
    res.status(200).json({ message: 'Account deleted' });
  } catch (error) {
    logger.error('Error deleting account', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/accounts/import - Import from ZIP
router.post('/accounts/import', upload.array('files'), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const defaultProxy = req.body.default_proxy;
  const accountsToInsert = [];
  let skippedCount = 0;

  try {
    for (const file of req.files) {
      try {
        const zip = new AdmZip(file.buffer);
        const zipEntries = zip.getEntries();
        
        const jsonFiles = {};
        const sessionFiles = {};

        zipEntries.forEach(entry => {
          if (entry.isDirectory) return;
          const name = entry.name;
          if (name.endsWith('.json')) {
            jsonFiles[name] = entry;
          } else if (name.endsWith('.session')) {
            sessionFiles[name] = entry;
          }
        });

        for (const [jsonName, jsonEntry] of Object.entries(jsonFiles)) {
          try {
            const content = jsonEntry.getData().toString('utf8');
            const data = JSON.parse(content);
            
            const baseName = jsonName.replace('.json', '');
            const sessionName = baseName + '.session';
            
            if (sessionFiles[sessionName]) {
              const sessionEntry = sessionFiles[sessionName];
              const sessionBuffer = sessionEntry.getData();
              
              let proxyUrl = defaultProxy || null;
              if (data.proxy && typeof data.proxy === 'string') {
                const parts = data.proxy.split(':');
                if (parts.length >= 4) {
                  const protocol = parts[0];
                  const ip = parts[1];
                  const port = parts[2];
                  const user = parts[3];
                  const pass = parts[4] || '';
                  proxyUrl = `${protocol}://${user}:${pass}@${ip}:${port}`;
                } else {
                  proxyUrl = data.proxy;
                }
              }

              if (!proxyUrl && defaultProxy) {
                proxyUrl = defaultProxy;
              }

              if (!proxyUrl) {
                logger.warn(`Skipping import for ${baseName}: No proxy found.`);
                skippedCount++;
                continue;
              }

              accountsToInsert.push({
                user_id: userId,
                phone_number: data.phone || baseName,
                api_id: data.app_id || data.api_id,
                api_hash: data.app_hash || data.api_hash,
                proxy_url: proxyUrl,
                session_file_data: sessionBuffer.toString('base64'),
                session_string: '',
                status: 'pending_conversion',
                import_status: 'pending_conversion'
              });
            }
          } catch (e) {
            logger.warn(`Failed to parse JSON ${jsonName}: ${e.message}`);
          }
        }
      } catch (fileError) {
        logger.error(`Error processing zip file ${file.originalname}: ${fileError.message}`);
      }
    }

    if (accountsToInsert.length === 0) {
      return res.status(400).json({ 
        error: `No valid accounts found. Skipped ${skippedCount} accounts due to missing proxy.` 
      });
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('outreach_accounts')
      .upsert(accountsToInsert, { onConflict: 'user_id, phone_number', ignoreDuplicates: true })
      .select();

    if (insertError) throw insertError;

    res.json({
      count: insertedData ? insertedData.length : 0,
      skipped: skippedCount,
      message: `Processed ${accountsToInsert.length} accounts. Skipped ${skippedCount} (missing proxy).`
    });

  } catch (error) {
    logger.error('Import failed', { error: error.message });
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

// ================= CAMPAIGNS =================

// GET /api/outreach/campaigns
router.get('/campaigns', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching campaigns', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/outreach/campaigns/:id - Get single campaign with stats
router.get('/campaigns/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    const { data: campaign, error } = await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get targets stats
    const { data: targets, error: targetsError } = await supabase
      .from('outreach_targets')
      .select('status')
      .eq('campaign_id', campaignId);

    const stats = {
      total: targets?.length || 0,
      pending: targets?.filter(t => t.status === 'pending').length || 0,
      sent: targets?.filter(t => t.status === 'sent').length || 0,
      replied: targets?.filter(t => t.status === 'replied').length || 0,
      failed: targets?.filter(t => t.status === 'failed').length || 0
    };

    res.json({ ...campaign, stats });
  } catch (error) {
    logger.error('Error fetching campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns - Create campaign
router.post('/campaigns', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { 
    name, 
    message_template, 
    account_ids, 
    auto_reply_enabled,
    ai_prompt,
    ai_model,
    message_delay_min,
    message_delay_max,
    daily_limit
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .insert([{
        user_id: userId,
        name,
        message_template,
        account_ids: account_ids || [],
        auto_reply_enabled: !!auto_reply_enabled,
        ai_prompt: ai_prompt || null,
        ai_model: ai_model || 'google/gemini-2.0-flash-001',
        message_delay_min: message_delay_min || 60,
        message_delay_max: message_delay_max || 180,
        daily_limit: daily_limit || 20,
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

// PATCH /api/outreach/campaigns/:id - Update campaign
router.patch('/campaigns/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  const allowedFields = [
    'name', 'message_template', 'account_ids', 'auto_reply_enabled',
    'ai_prompt', 'ai_model', 'message_delay_min', 'message_delay_max',
    'daily_limit', 'status'
  ];
  
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .update(updates)
      .eq('id', campaignId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(data[0]);
  } catch (error) {
    logger.error('Error updating campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns/:id/start - Start campaign
router.post('/campaigns/:id/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    // Verify campaign and check prerequisites
    const { data: campaign, error: campError } = await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();

    if (campError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!campaign.account_ids || campaign.account_ids.length === 0) {
      return res.status(400).json({ error: 'No accounts assigned to campaign' });
    }

    // Check for pending targets
    const { count, error: countError } = await supabase
      .from('outreach_targets')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    if (count === 0) {
      return res.status(400).json({ error: 'No pending targets in campaign' });
    }

    // Update status to active
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .update({ status: 'active', last_activity_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    // Log the start
    await supabase.from('outreach_logs').insert({
      user_id: userId,
      campaign_id: campaignId,
      level: 'INFO',
      message: `Campaign "${campaign.name}" started with ${count} pending targets`
    });

    res.json({ message: 'Campaign started', campaign: data[0] });
  } catch (error) {
    logger.error('Error starting campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns/:id/stop - Stop campaign
router.post('/campaigns/:id/stop', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    const { data, error } = await supabase
      .from('outreach_campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await supabase.from('outreach_logs').insert({
      user_id: userId,
      campaign_id: campaignId,
      level: 'INFO',
      message: `Campaign stopped`
    });

    res.json({ message: 'Campaign stopped', campaign: data[0] });
  } catch (error) {
    logger.error('Error stopping campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    const { error } = await supabase
      .from('outreach_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    logger.error('Error deleting campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= TARGETS =================

// GET /api/outreach/campaigns/:id/targets
router.get('/campaigns/:id/targets', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    // Verify ownership
    const { data: campaign, error: campError } = await supabase
      .from('outreach_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();

    if (campError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { data, error } = await supabase
      .from('outreach_targets')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching targets', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns/:id/targets - Add targets
router.post('/campaigns/:id/targets', async (req, res) => {
  const userId = getUserId(req);
  const campaignId = req.params.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targets } = req.body;

  if (!targets || !Array.isArray(targets)) {
    return res.status(400).json({ error: 'Invalid targets format' });
  }

  try {
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
      username: t.username?.replace('@', '') || null,
      phone: t.phone || null,
      status: 'pending'
    })).filter(t => t.username || t.phone);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid targets provided' });
    }

    const { data, error } = await supabase
      .from('outreach_targets')
      .insert(rows)
      .select();

    if (error) throw error;

    await supabase.from('outreach_logs').insert({
      user_id: userId,
      campaign_id: campaignId,
      level: 'INFO',
      message: `Added ${data.length} targets to campaign`
    });

    res.status(201).json({ count: data.length, message: 'Targets added' });
  } catch (error) {
    logger.error('Error adding targets', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/campaigns/:id/targets - Clear all targets
router.delete('/campaigns/:id/targets', async (req, res) => {
  const userId = getUserId(req);
  const campaignId = req.params.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: campaign, error: campError } = await supabase
      .from('outreach_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();

    if (campError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { error } = await supabase
      .from('outreach_targets')
      .delete()
      .eq('campaign_id', campaignId);

    if (error) throw error;
    res.json({ message: 'All targets cleared' });
  } catch (error) {
    logger.error('Error clearing targets', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= CHATS =================

// GET /api/outreach/chats - Get all chats for user
router.get('/chats', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_chats')
      .select(`
        *,
        account:outreach_accounts(phone_number),
        campaign:outreach_campaigns(name)
      `)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching chats', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/outreach/chats/:id/messages - Get messages for a chat
router.get('/chats/:id/messages', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const chatId = req.params.id;

  try {
    // Verify ownership
    const { data: chat, error: chatError } = await supabase
      .from('outreach_chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();

    if (chatError || !chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const { data, error } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Mark as read
    await supabase
      .from('outreach_messages')
      .update({ is_read: true })
      .eq('chat_id', chatId)
      .eq('is_read', false);

    await supabase
      .from('outreach_chats')
      .update({ unread_count: 0 })
      .eq('id', chatId);

    res.json(data);
  } catch (error) {
    logger.error('Error fetching messages', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/outreach/chats/:id - Update chat (e.g., switch to manual mode)
router.patch('/chats/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const chatId = req.params.id;

  const { status } = req.body;

  try {
    const { data, error } = await supabase
      .from('outreach_chats')
      .update({ status })
      .eq('id', chatId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(data[0]);
  } catch (error) {
    logger.error('Error updating chat', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= LOGS =================

// GET /api/outreach/logs
router.get('/logs', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { campaign_id, limit = 100 } = req.query;

  try {
    let query = supabase
      .from('outreach_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching logs', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= STATS =================

// GET /api/outreach/stats - Get overall stats
router.get('/stats', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const [accountsRes, campaignsRes, chatsRes] = await Promise.all([
      supabase.from('outreach_accounts').select('id, status').eq('user_id', userId),
      supabase.from('outreach_campaigns').select('id, status, messages_sent, messages_replied').eq('user_id', userId),
      supabase.from('outreach_chats').select('id, status, unread_count').eq('user_id', userId)
    ]);

    const accounts = accountsRes.data || [];
    const campaigns = campaignsRes.data || [];
    const chats = chatsRes.data || [];

    const stats = {
      accounts: {
        total: accounts.length,
        active: accounts.filter(a => a.status === 'active').length
      },
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter(c => c.status === 'active').length,
        totalSent: campaigns.reduce((sum, c) => sum + (c.messages_sent || 0), 0),
        totalReplied: campaigns.reduce((sum, c) => sum + (c.messages_replied || 0), 0)
      },
      chats: {
        total: chats.length,
        unread: chats.reduce((sum, c) => sum + (c.unread_count || 0), 0)
      }
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching stats', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
