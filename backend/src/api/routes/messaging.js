/**
 * Messaging API Routes
 * Manages Telegram accounts, campaigns, conversations, and hot leads
 */
import express from 'express';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';

const router = express.Router();
const execAsync = promisify(exec);

// Configure multer for tdata upload (use memory storage to avoid permission issues)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

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
      phone_number 
    } = req.body;

    if (!userId || !account_name || !session_file || !api_id || !api_hash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('telegram_accounts')
      .insert({
        user_id: userId,
        account_name,
        session_file,
        api_id: parseInt(api_id),
        api_hash,
        proxy_url,
        phone_number,
        status: 'active',
        is_available: true
      })
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
 * POST /api/messaging/accounts/upload-tdata
 * Upload and convert Telegram Desktop tdata to Telethon session
 */
router.post('/accounts/upload-tdata', upload.single('tdata'), async (req, res) => {
  let tempDir = null;
  
  try {
    const userId = req.headers['x-user-id'];
    const { account_name, proxy_url } = req.body;
    
    if (!userId || !account_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID and account name required' 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No tdata zip file uploaded' 
      });
    }
    
    logger.info('Processing tdata upload', { userId, filename: req.file.originalname });
    
    // Create temporary directory (all in /tmp to avoid permission issues)
    const tempId = randomUUID();
    tempDir = path.join('/tmp', `tdata_${tempId}`);
    const tdataDir = path.join(tempDir, 'tdata');
    const sessionsDir = path.join('/tmp', 'sessions');
    
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(tdataDir, { recursive: true });
    await fs.mkdir(sessionsDir, { recursive: true });
    
    // Extract zip file
    logger.info('Extracting tdata zip...', { tempDir });
    const zip = new AdmZip(req.file.buffer);
    zip.extractAllTo(tdataDir, true);
    
    // Check if there's a nested tdata folder and fix the structure
    const nestedTdataPath = path.join(tdataDir, 'tdata');
    try {
      const stats = await fs.stat(nestedTdataPath);
      if (stats.isDirectory()) {
        logger.info('Found nested tdata folder, moving contents up...');
        const files = await fs.readdir(nestedTdataPath);
        for (const file of files) {
          const oldPath = path.join(nestedTdataPath, file);
          const newPath = path.join(tdataDir, file);
          await fs.rename(oldPath, newPath);
        }
        await fs.rmdir(nestedTdataPath);
        logger.info('Nested tdata folder contents moved successfully');
      }
    } catch (err) {
      // No nested tdata folder, that's fine
      logger.info('No nested tdata folder found, using direct structure');
    }
    
    // Generate session filename
    const sessionName = `session_${tempId}`;
    const sessionPath = path.join(sessionsDir, sessionName);
    
    // Run Python converter
    const pythonScript = path.join(process.cwd(), 'python-service', 'tdata_converter.py');
    logger.info('Converting tdata to session...', { 
      sessionPath,
      pythonScript,
      cwd: process.cwd()
    });
    
    // Check if Python script exists
    try {
      await fs.access(pythonScript);
      logger.info('Python script found, attempting to execute');
    } catch (error) {
      // List directory contents for debugging
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'python-service'));
        logger.error('Python script not found. Directory contents:', { 
          path: path.join(process.cwd(), 'python-service'),
          files 
        });
      } catch (dirError) {
        logger.error('Python script not found and cannot list directory', { 
          error: dirError.message 
        });
      }
      throw new Error(`Python script not found: ${pythonScript}`);
    }
    
    let result;
    try {
      const { stdout, stderr } = await execAsync(
        `xvfb-run -a python "${pythonScript}" "${tdataDir}" "${sessionPath}"`,
        { 
          timeout: 60000, // 60 seconds
          maxBuffer: 10 * 1024 * 1024 // 10MB
        }
      );
      
      // Parse JSON result from Python output
      const jsonMatch = stdout.match(/=== RESULT ===\s*(\{.*\})/s);
      if (!jsonMatch) {
        throw new Error('Failed to parse Python output: ' + stdout);
      }
      
      result = JSON.parse(jsonMatch[1]);
      
      if (!result.success) {
        throw new Error(result.error || 'Conversion failed');
      }
      
      logger.info('Conversion successful', { 
        phone: result.phone, 
        username: result.username 
      });
      
    } catch (error) {
      logger.error('Python conversion failed', { error: error.message });
      throw new Error(`Conversion failed: ${error.message}`);
    }
    
    // Save to database
    const supabase = getSupabase();
    const { data: account, error: dbError } = await supabase
      .from('telegram_accounts')
      .insert({
        user_id: userId,
        account_name,
        session_file: `${sessionName}.session`,
        api_id: result.api_id,
        api_hash: result.api_hash,
        proxy_url: proxy_url || null,
        phone_number: result.phone,
        status: 'active',
        is_available: true
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    logger.info('Account created from tdata', { 
      userId, 
      accountId: account.id,
      phone: result.phone 
    });
    
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    
    res.json({ 
      success: true, 
      account: account,
      phone: result.phone,
      username: result.username
    });
    
  } catch (error) {
    logger.error('Failed to upload tdata', { error: error.message });
    
    // Cleanup temp directory on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.error('Failed to cleanup temp directory', { error: cleanupError.message });
      }
    }
    
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
      target_channel_id 
    } = req.body;

    if (!name || !communication_prompt || !hot_lead_criteria) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messaging_campaigns')
      .insert({
        user_id: userId,
        name,
        communication_prompt,
        hot_lead_criteria,
        target_channel_id,
        status: 'draft'
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

