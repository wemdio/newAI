/**
 * Messaging API Routes
 * Manages Telegram accounts, campaigns, conversations, and hot leads
 */
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============= TELEGRAM ACCOUNTS =============

/**
 * GET /api/messaging/accounts
 * Get all Telegram accounts for user
 */
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('telegram_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    logger.info('Fetched accounts', { userId, count: data?.length || 0 });
    res.json({ success: true, accounts: data || [] });

  } catch (error) {
    logger.error('Failed to fetch accounts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/accounts
 * Create new Telegram account (manual with api_id/api_hash)
 */
router.post('/accounts', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { 
      account_name, 
      session_file, 
      api_id, 
      api_hash, 
      proxy_url,
      phone_number,
      daily_limit
    } = req.body;

    if (!userId || !account_name || !session_file || !api_id || !api_hash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const supabase = getSupabase();
    const parsedDailyLimit = Number.parseInt(daily_limit, 10);
    const insertPayload = {
      user_id: userId,
      account_name,
      session_file,
      api_id: parseInt(api_id, 10),
      api_hash,
      proxy_url,
      phone_number,
      status: 'active',
      is_available: true
    };
    if (Number.isFinite(parsedDailyLimit)) {
      insertPayload.daily_limit = parsedDailyLimit;
    }

    const { data, error } = await supabase
      .from('telegram_accounts')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    logger.info('Created account', { userId, accountId: data.id });
    res.json({ success: true, account: data });

  } catch (error) {
    logger.error('Failed to create account', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/accounts/import-session
 * Import Telegram account from session string (from account shops)
 */
router.post('/accounts/import-session', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { account_name, session_string, api_id, api_hash, proxy_url, daily_limit } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required in x-user-id header' 
      });
    }
    
    if (!session_string) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session string is required' 
      });
    }
    
    // PROXY IS MANDATORY - validate proxy_url
    if (!proxy_url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Proxy is required! All accounts must have a proxy configured for security.' 
      });
    }
    
    // Validate proxy URL format
    const proxyPattern = /^(socks5|socks4|http|https):\/\/([^:]+:[^@]+@)?[\w.-]+:\d+$/i;
    if (!proxyPattern.test(proxy_url)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid proxy URL format. Expected: protocol://user:pass@host:port (e.g., socks5://login:password@1.2.3.4:1080)' 
      });
    }
    
    // Use default Telegram API credentials if not provided
    // These are public Telegram Desktop credentials
    const finalApiId = api_id || '2496';
    const finalApiHash = api_hash || '8da85b0d5bfe62527e5b244c209159c3';
    
    logger.info('Importing session string', { 
      userId, 
      accountNameLength: account_name?.length || 0,
      usingDefaultCredentials: !api_id,
      hasProxy: true,
      proxyProvided: !!proxy_url
    });
    
    // Generate session filename
    const sessionName = `imported_${Date.now()}`;
    const sessionsDir = path.join('/tmp', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, `${sessionName}.session`);
    
    // Clean and validate session string
    // Format: Telethon StringSession (hex:dc_id)
    let cleanSessionString;
    try {
      // Remove only whitespace/newlines, keep hex and colon
      cleanSessionString = session_string.replace(/\s+/g, '').trim();
      
      // Validate it's not empty
      if (cleanSessionString.length === 0) {
        throw new Error('Session string is empty after cleaning');
      }
      
      // Validate format (should be hex:number or just hex)
      if (!cleanSessionString.match(/^[0-9a-fA-F]+(:[0-9]+)?$/)) {
        throw new Error('Invalid session string format. Expected format: hex or hex:dc_id');
      }
      
      logger.info('Session string validated', { 
        originalLength: session_string.length,
        cleanedLength: cleanSessionString.length,
        format: cleanSessionString.includes(':') ? 'StringSession (hex:dc)' : 'raw hex'
      });
      
      // Note: We don't create session file here, Python Worker will use StringSession directly
      
    } catch (decodeError) {
      logger.error('Failed to validate session string', { error: decodeError.message });
      throw new Error('Invalid session string format. Expected Telethon StringSession format (hex or hex:dc_id)');
    }
    
    // Save to database (including session_string for Python Worker)
    const supabase = getSupabase();
    const parsedDailyLimit = Number.parseInt(daily_limit, 10);
    const insertPayload = {
      user_id: userId,
      account_name: account_name || 'Imported Account',
      session_file: sessionName,
      session_string: cleanSessionString, // Store cleaned hex string for worker
      api_id: parseInt(finalApiId, 10),
      api_hash: finalApiHash,
      proxy_url: proxy_url, // MANDATORY proxy
      phone_number: null, // Will be filled when session is used
      status: 'active',
      is_available: true // Make account available for Python Worker
    };
    if (Number.isFinite(parsedDailyLimit)) {
      insertPayload.daily_limit = parsedDailyLimit;
    }

    const { data: account, error: dbError } = await supabase
      .from('telegram_accounts')
      .insert(insertPayload)
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    logger.info('Account imported from session string', { 
      userId, 
      accountId: account.id
    });
    
    res.json({ 
      success: true, 
      account: account,
      message: 'Session string imported successfully'
    });
    
  } catch (error) {
    logger.error('Failed to import session string', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PUT /api/messaging/accounts/:id
 * Update account (proxy, status, etc)
 */
router.put('/accounts/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const updates = req.body;

    if (Object.prototype.hasOwnProperty.call(updates, 'daily_limit')) {
      const parsedDailyLimit = Number.parseInt(updates.daily_limit, 10);
      if (Number.isFinite(parsedDailyLimit)) {
        updates.daily_limit = parsedDailyLimit;
      } else {
        delete updates.daily_limit;
      }
    }

    // Force reset status to active/available on manual update
    // This allows users to fix "Error" status by just clicking Save
    if (!updates.status || updates.status === 'error') {
       updates.status = 'active';
    }
    updates.is_available = true;
    updates.needs_reconnect = false;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('telegram_accounts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Updated account', { userId, accountId: id });
    res.json({ success: true, account: data });

  } catch (error) {
    logger.error('Failed to update account', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/messaging/accounts/:id
 * Delete account
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { error } = await supabase
      .from('telegram_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info('Deleted account', { userId, accountId: id });
    res.json({ success: true });

  } catch (error) {
    logger.error('Failed to delete account', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= CAMPAIGNS =============

/**
 * GET /api/messaging/campaigns
 * Get all campaigns for user
 */
router.get('/campaigns', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, campaigns: data || [] });

  } catch (error) {
    logger.error('Failed to fetch campaigns', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/campaigns
 * Create new campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { 
      name, 
      communication_prompt, 
      hot_lead_criteria, 
      target_channel_id,
      filter_by_confidence,
      max_confidence_for_ai
    } = req.body;

    if (!name || !communication_prompt || !hot_lead_criteria) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const supabase = getSupabase();
    const parsedMaxConfidence = Number.parseInt(max_confidence_for_ai, 10);
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .insert({
        user_id: userId,
        name,
        communication_prompt,
        hot_lead_criteria,
        target_channel_id,
        status: 'draft',
        filter_by_confidence: !!filter_by_confidence,
        max_confidence_for_ai: Number.isFinite(parsedMaxConfidence) ? parsedMaxConfidence : undefined
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Created campaign', { userId, campaignId: data.id });
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to create campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/messaging/campaigns/:id
 * Update campaign
 */
router.put('/campaigns/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const updates = req.body;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Updated campaign', { userId, campaignId: id });
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to update campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/campaigns/:id/start
 * Start campaign
 */
router.post('/campaigns/:id/start', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Started campaign', { userId, campaignId: id });
    
    // TODO: Notify Python service to start processing
    
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to start campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/campaigns/:id/pause
 * Pause campaign
 */
router.post('/campaigns/:id/pause', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .update({ status: 'paused' })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Paused campaign', { userId, campaignId: id });
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to pause campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/campaigns/:id/stop
 * Stop campaign
 */
router.post('/campaigns/:id/stop', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .update({ 
        status: 'stopped',
        stopped_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Stopped campaign', { userId, campaignId: id });
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to stop campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/campaigns/:id/resume
 * Resume paused campaign
 */
router.post('/campaigns/:id/resume', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .update({ status: 'running' })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Resumed campaign', { userId, campaignId: id });
    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Failed to resume campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/messaging/campaigns/:id
 * Delete campaign
 */
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { error } = await supabase
      .from('messaging_campaigns')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info('Deleted campaign', { userId, campaignId: id });
    res.json({ success: true });

  } catch (error) {
    logger.error('Failed to delete campaign', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= CONVERSATIONS =============

/**
 * GET /api/messaging/conversations
 * Get conversations for user's campaigns
 */
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { campaign_id, status } = req.query;

    const supabase = getSupabase();
    
    // Join with campaigns to filter by user_id
    let query = supabase
      .from('ai_conversations')
      .select(`
        *,
        messaging_campaigns!inner(user_id),
        telegram_accounts(account_name)
      `)
      .eq('messaging_campaigns.user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, conversations: data || [] });

  } catch (error) {
    logger.error('Failed to fetch conversations', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/messaging/conversations/:id
 * Get conversation details with full history
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_conversations')
      .select(`
        *,
        messaging_campaigns!inner(user_id),
        telegram_accounts(account_name),
        detected_leads(confidence_score, reasoning)
      `)
      .eq('id', id)
      .eq('messaging_campaigns.user_id', userId)
      .single();

    if (error) throw error;

    res.json({ success: true, conversation: data });

  } catch (error) {
    logger.error('Failed to fetch conversation', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= MANUAL MESSAGING =============

/**
 * POST /api/messaging/conversations/:id/send
 * Send a manual message to a conversation (stops AI)
 */
router.post('/conversations/:id/send', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Message content required' });
    }

    const supabase = getSupabase();

    // 1. Get conversation details to ensure it exists and belongs to user
    const { data: conversation, error: convError } = await supabase
      .from('ai_conversations')
      .select(`
        id, 
        account_id, 
        peer_username, 
        status,
        messaging_campaigns!inner(user_id)
      `)
      .eq('id', id)
      .eq('messaging_campaigns.user_id', userId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // 2. Update status to 'stopped' to stop AI (was 'manual' but constraint allows: active, waiting, hot_lead, stopped, completed)
    if (conversation.status !== 'stopped') {
      await supabase
        .from('ai_conversations')
        .update({ status: 'stopped', updated_at: new Date().toISOString() })
        .eq('id', id);
        
      logger.info('Switched conversation to stopped mode (manual takeover)', { userId, conversationId: id });
    }

    // 3. Add to message_queue for Python worker
    const { data: queuedMsg, error: queueError } = await supabase
      .from('message_queue')
      .insert({
        conversation_id: id,
        account_id: conversation.account_id,
        peer_username: conversation.peer_username,
        content: content,
        status: 'pending'
      })
      .select()
      .single();

    if (queueError) throw queueError;

    logger.info('Queued manual message', { userId, conversationId: id, queueId: queuedMsg.id });

    res.json({ success: true, message: 'Message queued', queueId: queuedMsg.id });

  } catch (error) {
    logger.error('Failed to send manual message', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messaging/conversations/:id/takeover
 * Switch conversation to manual mode (stops AI)
 */
router.post('/conversations/:id/takeover', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;

    const supabase = getSupabase();

    // Verify ownership
    const { data: conversation, error: convError } = await supabase
      .from('ai_conversations')
      .select('messaging_campaigns!inner(user_id)')
      .eq('id', id)
      .eq('messaging_campaigns.user_id', userId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Update status
    const { error } = await supabase
      .from('ai_conversations')
      .update({ 
        status: 'stopped', // Was 'manual', changed to match constraint
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    logger.info('Manual takeover activated', { userId, conversationId: id });
    res.json({ success: true, message: 'Switched to manual mode' });

  } catch (error) {
    logger.error('Failed to takeover conversation', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= HOT LEADS =============

/**
 * GET /api/messaging/hot-leads
 * Get hot leads for user
 */
router.get('/hot-leads', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('hot_leads')
      .select(`
        *,
        messaging_campaigns!inner(user_id, name),
        ai_conversations(peer_username, peer_user_id)
      `)
      .eq('messaging_campaigns.user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, hot_leads: data || [] });

  } catch (error) {
    logger.error('Failed to fetch hot leads', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/messaging/hot-leads/:id
 * Update hot lead (notes, manager, etc)
 */
router.put('/hot-leads/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const updates = req.body;

    const supabase = getSupabase();
    
    // Verify ownership through campaign
    const { data, error } = await supabase
      .from('hot_leads')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        messaging_campaigns!inner(user_id)
      `)
      .single();

    if (error) throw error;

    if (data.messaging_campaigns.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    logger.info('Updated hot lead', { userId, hotLeadId: id });
    res.json({ success: true, hot_lead: data });

  } catch (error) {
    logger.error('Failed to update hot lead', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= STATISTICS =============

/**
 * GET /api/messaging/stats
 * Get messaging statistics for user
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];

    const supabase = getSupabase();
    
    // Get campaign stats
    const { data: campaigns } = await supabase
      .from('messaging_campaigns')
      .select('status, leads_contacted, hot_leads_found')
      .eq('user_id', userId);

    // Get account stats
    const { data: accounts } = await supabase
      .from('telegram_accounts')
      .select('status, messages_sent_today')
      .eq('user_id', userId);

    // Get conversation stats
    const { data: conversations } = await supabase
      .from('ai_conversations')
      .select('status, messaging_campaigns!inner(user_id)')
      .eq('messaging_campaigns.user_id', userId);

    const stats = {
      campaigns: {
        total: campaigns?.length || 0,
        running: campaigns?.filter(c => c.status === 'running').length || 0,
        total_leads_contacted: campaigns?.reduce((sum, c) => sum + (c.leads_contacted || 0), 0) || 0,
        total_hot_leads: campaigns?.reduce((sum, c) => sum + (c.hot_leads_found || 0), 0) || 0
      },
      accounts: {
        total: accounts?.length || 0,
        active: accounts?.filter(a => a.status === 'active').length || 0,
        total_messages_today: accounts?.reduce((sum, a) => sum + (a.messages_sent_today || 0), 0) || 0
      },
      conversations: {
        total: conversations?.length || 0,
        active: conversations?.filter(c => c.status === 'active').length || 0,
        hot_leads: conversations?.filter(c => c.status === 'hot_lead').length || 0
      }
    };

    res.json({ success: true, stats });

  } catch (error) {
    logger.error('Failed to fetch stats', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

