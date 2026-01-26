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

const normalizeSleepPeriods = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeUsername = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/^@/, '');
};

const parseProxyLines = (input) => {
  if (!input) return [];
  return String(input)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
};

const normalizeCampaignSafety = (body) => {
  const messageDelayMin = normalizeInt(body.message_delay_min, 60);
  const messageDelayMax = normalizeInt(body.message_delay_max, 180);
  const preReadDelayMin = normalizeInt(body.pre_read_delay_min, 5);
  const preReadDelayMax = normalizeInt(body.pre_read_delay_max, 10);
  const readReplyDelayMin = normalizeInt(body.read_reply_delay_min, 5);
  const readReplyDelayMax = normalizeInt(body.read_reply_delay_max, 10);
  const accountLoopDelayMin = normalizeInt(body.account_loop_delay_min, 300);
  const accountLoopDelayMax = normalizeInt(body.account_loop_delay_max, 600);
  const dialogWaitWindowMin = normalizeInt(body.dialog_wait_window_min, 40);
  const dialogWaitWindowMax = normalizeInt(body.dialog_wait_window_max, 60);

  return {
    message_delay_min: Math.min(messageDelayMin, messageDelayMax),
    message_delay_max: Math.max(messageDelayMin, messageDelayMax),
    pre_read_delay_min: Math.min(preReadDelayMin, preReadDelayMax),
    pre_read_delay_max: Math.max(preReadDelayMin, preReadDelayMax),
    read_reply_delay_min: Math.min(readReplyDelayMin, readReplyDelayMax),
    read_reply_delay_max: Math.max(readReplyDelayMin, readReplyDelayMax),
    account_loop_delay_min: Math.min(accountLoopDelayMin, accountLoopDelayMax),
    account_loop_delay_max: Math.max(accountLoopDelayMin, accountLoopDelayMax),
    dialog_wait_window_min: Math.min(dialogWaitWindowMin, dialogWaitWindowMax),
    dialog_wait_window_max: Math.max(dialogWaitWindowMin, dialogWaitWindowMax),
    daily_limit: normalizeInt(body.daily_limit, 20),
    timezone_offset: normalizeInt(body.timezone_offset, 3),
    sleep_periods: normalizeSleepPeriods(body.sleep_periods),
    ignore_bot_usernames: body.ignore_bot_usernames ?? true,
    account_cooldown_hours: normalizeInt(body.account_cooldown_hours, 5),
    follow_up_enabled: !!body.follow_up_enabled,
    follow_up_delay_hours: normalizeInt(body.follow_up_delay_hours, 24),
    follow_up_prompt: body.follow_up_prompt || null,
    reply_only_if_previously_wrote: body.reply_only_if_previously_wrote ?? true
  };
};

const parseIntValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const applyRangeUpdate = (body, updates, minKey, maxKey) => {
  const hasMin = body[minKey] !== undefined;
  const hasMax = body[maxKey] !== undefined;
  const min = parseIntValue(body[minKey]);
  const max = parseIntValue(body[maxKey]);

  if (hasMin && min !== null) updates[minKey] = min;
  if (hasMax && max !== null) updates[maxKey] = max;

  if (hasMin && hasMax && min !== null && max !== null) {
    updates[minKey] = Math.min(min, max);
    updates[maxKey] = Math.max(min, max);
  }
};

const normalizeCampaignSafetyUpdates = (body) => {
  const updates = {};

  applyRangeUpdate(body, updates, 'message_delay_min', 'message_delay_max');
  applyRangeUpdate(body, updates, 'pre_read_delay_min', 'pre_read_delay_max');
  applyRangeUpdate(body, updates, 'read_reply_delay_min', 'read_reply_delay_max');
  applyRangeUpdate(body, updates, 'account_loop_delay_min', 'account_loop_delay_max');
  applyRangeUpdate(body, updates, 'dialog_wait_window_min', 'dialog_wait_window_max');

  if (body.daily_limit !== undefined) {
    const value = parseIntValue(body.daily_limit);
    if (value !== null) updates.daily_limit = value;
  }
  if (body.timezone_offset !== undefined) {
    const value = parseIntValue(body.timezone_offset);
    if (value !== null) updates.timezone_offset = value;
  }
  if (body.account_cooldown_hours !== undefined) {
    const value = parseIntValue(body.account_cooldown_hours);
    if (value !== null) updates.account_cooldown_hours = value;
  }
  if (body.follow_up_delay_hours !== undefined) {
    const value = parseIntValue(body.follow_up_delay_hours);
    if (value !== null) updates.follow_up_delay_hours = value;
  }

  if (body.sleep_periods !== undefined) {
    updates.sleep_periods = normalizeSleepPeriods(body.sleep_periods);
  }
  if (body.ignore_bot_usernames !== undefined) {
    updates.ignore_bot_usernames = !!body.ignore_bot_usernames;
  }
  if (body.follow_up_enabled !== undefined) {
    updates.follow_up_enabled = !!body.follow_up_enabled;
  }
  if (body.follow_up_prompt !== undefined) {
    updates.follow_up_prompt = body.follow_up_prompt || null;
  }
  if (body.reply_only_if_previously_wrote !== undefined) {
    updates.reply_only_if_previously_wrote = !!body.reply_only_if_previously_wrote;
  }

  return updates;
};

const DEFAULT_FORWARD_LIMIT = 5;
const DEFAULT_HISTORY_LIMIT = 20;

const normalizeText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeLeadSettings = (body) => {
  return {
    trigger_phrase_positive: normalizeText(body.trigger_phrase_positive),
    trigger_phrase_negative: normalizeText(body.trigger_phrase_negative),
    target_chat_positive: normalizeText(body.target_chat_positive),
    target_chat_negative: normalizeText(body.target_chat_negative),
    forward_limit: normalizeInt(body.forward_limit, DEFAULT_FORWARD_LIMIT),
    history_limit: normalizeInt(body.history_limit, DEFAULT_HISTORY_LIMIT),
    use_fallback_on_ai_fail: !!body.use_fallback_on_ai_fail,
    fallback_text: normalizeText(body.fallback_text)
  };
};

const normalizeLeadSettingsUpdates = (body) => {
  const updates = {};

  if (body.trigger_phrase_positive !== undefined) {
    updates.trigger_phrase_positive = normalizeText(body.trigger_phrase_positive);
  }
  if (body.trigger_phrase_negative !== undefined) {
    updates.trigger_phrase_negative = normalizeText(body.trigger_phrase_negative);
  }
  if (body.target_chat_positive !== undefined) {
    updates.target_chat_positive = normalizeText(body.target_chat_positive);
  }
  if (body.target_chat_negative !== undefined) {
    updates.target_chat_negative = normalizeText(body.target_chat_negative);
  }

  if (body.forward_limit !== undefined) {
    const value = parseIntValue(body.forward_limit);
    if (value !== null) updates.forward_limit = value;
  }
  if (body.history_limit !== undefined) {
    const value = parseIntValue(body.history_limit);
    if (value !== null) updates.history_limit = value;
  }

  if (body.use_fallback_on_ai_fail !== undefined) {
    updates.use_fallback_on_ai_fail = !!body.use_fallback_on_ai_fail;
  }
  if (body.fallback_text !== undefined) {
    updates.fallback_text = normalizeText(body.fallback_text);
  }

  return updates;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

  const allowedFields = ['phone_number', 'api_id', 'api_hash', 'session_string', 'proxy_url', 'proxy_id', 'status'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  try {
    if (Object.prototype.hasOwnProperty.call(updates, 'proxy_id')) {
      if (updates.proxy_id) {
        const { data: proxy, error: proxyError } = await supabase
          .from('outreach_proxies')
          .select('id, url')
          .eq('id', updates.proxy_id)
          .eq('user_id', userId)
          .single();
        if (proxyError || !proxy) {
          return res.status(404).json({ error: 'Proxy not found' });
        }
        updates.proxy_url = proxy.url;
      } else {
        updates.proxy_url = null;
      }
    } else if (Object.prototype.hasOwnProperty.call(updates, 'proxy_url')) {
      updates.proxy_id = null;
    }

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

// ================= PROXIES =================

// GET /api/outreach/proxies - List proxies
router.get('/proxies', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_proxies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('Error fetching proxies', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/proxies - Add proxy
router.post('/proxies', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { url, name } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Proxy URL is required' });

  try {
    const { data: existing } = await supabase
      .from('outreach_proxies')
      .select('id')
      .eq('user_id', userId)
      .eq('url', url)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'Proxy already exists' });
    }

    const { data, error } = await supabase
      .from('outreach_proxies')
      .insert([{ user_id: userId, url, name: name || null }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    logger.error('Error adding proxy', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/outreach/proxies/:id - Update proxy
router.patch('/proxies/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const proxyId = req.params.id;
  const { url, name, is_active: isActive } = req.body || {};
  const updates = {};
  if (url !== undefined) updates.url = url;
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.is_active = !!isActive;

  try {
    const { data, error } = await supabase
      .from('outreach_proxies')
      .update(updates)
      .eq('id', proxyId)
      .eq('user_id', userId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    if (updates.url) {
      await supabase
        .from('outreach_accounts')
        .update({ proxy_url: updates.url })
        .eq('user_id', userId)
        .eq('proxy_id', proxyId);
    }
    res.json(data[0]);
  } catch (error) {
    logger.error('Error updating proxy', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/proxies/:id - Delete proxy
router.delete('/proxies/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const proxyId = req.params.id;

  try {
    await supabase
      .from('outreach_accounts')
      .update({ proxy_id: null, proxy_url: null })
      .eq('user_id', userId)
      .eq('proxy_id', proxyId);

    const { error } = await supabase
      .from('outreach_proxies')
      .delete()
      .eq('id', proxyId)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ status: 'deleted' });
  } catch (error) {
    logger.error('Error deleting proxy', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/proxies - Clear all proxies
router.delete('/proxies', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await supabase
      .from('outreach_accounts')
      .update({ proxy_id: null, proxy_url: null })
      .eq('user_id', userId);

    const { error } = await supabase
      .from('outreach_proxies')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ status: 'cleared' });
  } catch (error) {
    logger.error('Error clearing proxies', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/proxies/bulk - Add proxies from list
router.post('/proxies/bulk', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { proxies_text: proxiesText } = req.body || {};

  const lines = parseProxyLines(proxiesText);
  const uniqueLines = Array.from(new Set(lines));
  if (!lines.length) {
    return res.status(400).json({ error: 'No proxies provided' });
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('outreach_proxies')
      .select('url')
      .eq('user_id', userId);
    if (existingError) throw existingError;
    const existingUrls = new Set((existing || []).map(p => p.url));

    const rows = uniqueLines
      .filter(url => !existingUrls.has(url))
      .map(url => ({ user_id: userId, url }));

    if (!rows.length) {
      return res.json({ status: 'success', added: 0, skipped: uniqueLines.length });
    }

    const { data, error } = await supabase
      .from('outreach_proxies')
      .insert(rows)
      .select();
    if (error) throw error;
    res.json({
      status: 'success',
      added: data?.length || 0,
      skipped: uniqueLines.length - (data?.length || 0)
    });
  } catch (error) {
    logger.error('Error adding proxies in bulk', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/outreach/proxies/usage - Proxy usage stats
router.get('/proxies/usage', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: proxies, error: proxyError } = await supabase
      .from('outreach_proxies')
      .select('*')
      .eq('user_id', userId);
    if (proxyError) throw proxyError;

    const { data: accounts, error: accError } = await supabase
      .from('outreach_accounts')
      .select('id, proxy_id')
      .eq('user_id', userId);
    if (accError) throw accError;

    const usage = (proxies || []).map(proxy => {
      const count = (accounts || []).filter(acc => acc.proxy_id === proxy.id).length;
      return { proxy, accounts_count: count };
    });

    res.json({ usage });
  } catch (error) {
    logger.error('Error fetching proxy usage', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
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
    ai_model
  } = req.body;
  const safetySettings = normalizeCampaignSafety(req.body);
  const leadSettings = normalizeLeadSettings(req.body);

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
        status: 'draft',
        ...safetySettings,
        ...leadSettings
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
    'ai_prompt', 'ai_model', 'status'
  ];
  
  const updates = {
    ...normalizeCampaignSafetyUpdates(req.body),
    ...normalizeLeadSettingsUpdates(req.body)
  };
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

// POST /api/outreach/campaigns/:id/restart - Restart campaign
router.post('/campaigns/:id/restart', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaignId = req.params.id;

  try {
    const { data: campaign, error: campError } = await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();

    if (campError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await supabase
      .from('outreach_campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId)
      .eq('user_id', userId);

    const { data, error } = await supabase
      .from('outreach_campaigns')
      .update({ status: 'active', last_activity_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    await supabase.from('outreach_logs').insert({
      user_id: userId,
      campaign_id: campaignId,
      level: 'INFO',
      message: `Campaign "${campaign.name}" restarted`
    });

    res.json({ message: 'Campaign restarted', campaign: data[0] });
  } catch (error) {
    logger.error('Error restarting campaign', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/campaigns/:id/reset-status - Reset campaign status
router.post('/campaigns/:id/reset-status', async (req, res) => {
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
      message: 'Campaign status reset to paused'
    });

    res.json({ message: 'Campaign status reset', campaign: data[0] });
  } catch (error) {
    logger.error('Error resetting campaign status', { error: error.message });
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
        campaign:outreach_campaigns(id, name)
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

  const allowedFields = ['status', 'lead_status', 'processed_at'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  if (updates.lead_status === 'none') {
    updates.processed_at = null;
  }
  if (
    updates.lead_status &&
    updates.lead_status !== 'none' &&
    !updates.processed_at
  ) {
    updates.processed_at = new Date().toISOString();
  }

  try {
    const { data, error } = await supabase
      .from('outreach_chats')
      .update(updates)
      .eq('id', chatId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    const updatedChat = data[0];
    if (updates.lead_status !== undefined && updatedChat.campaign_id && updatedChat.target_username) {
      const normalized = normalizeUsername(updatedChat.target_username);
      const identifier = normalized || updatedChat.target_username;
      let targetQuery = supabase
        .from('outreach_targets')
        .update({ lead_status: updates.lead_status })
        .eq('campaign_id', updatedChat.campaign_id);
      if (identifier) {
        targetQuery = targetQuery.or(`username.eq.${identifier},phone.eq.${identifier}`);
      }
      await targetQuery;

      if (updates.lead_status === 'lead' || updates.lead_status === 'not_lead') {
        await supabase
          .from('outreach_processed_clients')
          .upsert([{
            user_id: userId,
            campaign_id: updatedChat.campaign_id,
            target_username: identifier,
            target_name: updatedChat.target_name || null
          }], { onConflict: 'campaign_id,target_username' });
      } else if (updates.lead_status === 'none') {
        await supabase
          .from('outreach_processed_clients')
          .delete()
          .eq('user_id', userId)
          .eq('campaign_id', updatedChat.campaign_id)
          .eq('target_username', identifier);
      }
    }
    res.json(updatedChat);
  } catch (error) {
    logger.error('Error updating chat', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/chats/:id - Delete chat and messages
router.delete('/chats/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const chatId = req.params.id;

  try {
    const { error } = await supabase
      .from('outreach_chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ status: 'deleted' });
  } catch (error) {
    logger.error('Error deleting chat', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/chats/:id/send - Queue manual message
router.post('/chats/:id/send', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const chatId = req.params.id;
  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message content is required' });

  try {
    const { data: chat, error: chatError } = await supabase
      .from('outreach_chats')
      .select('id, campaign_id, account_id, target_username')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();
    if (chatError || !chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const { data, error } = await supabase
      .from('outreach_manual_messages')
      .insert([{
        user_id: userId,
        campaign_id: chat.campaign_id,
        chat_id: chat.id,
        account_id: chat.account_id,
        target_username: chat.target_username,
        content,
        status: 'pending'
      }])
      .select();
    if (error) throw error;

    await supabase
      .from('outreach_chats')
      .update({ status: 'manual' })
      .eq('id', chatId)
      .eq('user_id', userId);

    res.status(201).json({ status: 'queued', message: data?.[0] || null });
  } catch (error) {
    logger.error('Error queueing manual message', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= PROCESSED CLIENTS =================

// GET /api/outreach/processed
router.get('/processed', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { campaign_id: campaignId } = req.query;

  try {
    let query = supabase
      .from('outreach_processed_clients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('Error fetching processed clients', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/processed
router.post('/processed', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { campaign_id: campaignId, target_username: targetUsernameRaw, target_name: targetName } = req.body || {};

  const targetUsername = normalizeUsername(targetUsernameRaw);
  if (!campaignId || !targetUsername) {
    return res.status(400).json({ error: 'campaign_id and target_username are required' });
  }

  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('outreach_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { data, error } = await supabase
      .from('outreach_processed_clients')
      .upsert([{
        user_id: userId,
        campaign_id: campaignId,
        target_username: targetUsername,
        target_name: targetName || null
      }], { onConflict: 'campaign_id,target_username' })
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    logger.error('Error adding processed client', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/outreach/processed/:id
router.delete('/processed/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const processedId = req.params.id;

  try {
    const { error } = await supabase
      .from('outreach_processed_clients')
      .delete()
      .eq('id', processedId)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ status: 'deleted' });
  } catch (error) {
    logger.error('Error deleting processed client', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/processed/upload
router.post('/processed/upload', upload.single('file'), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { campaign_id: campaignId } = req.body || {};

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  if (!campaignId) {
    return res.status(400).json({ error: 'campaign_id is required' });
  }

  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('outreach_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const content = req.file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const seen = new Set();

    const rows = lines.map(line => {
      const parts = line.split('|').map(part => part.trim()).filter(Boolean);
      const username = normalizeUsername(parts.length > 1 ? parts[1] : parts[0]);
      return {
        user_id: userId,
        campaign_id: campaignId,
        target_username: username,
        target_name: parts.length > 2 ? parts.slice(2).join(' ') : null
      };
    }).filter(row => {
      if (!row.target_username) return false;
      if (seen.has(row.target_username)) return false;
      seen.add(row.target_username);
      return true;
    });

    if (!rows.length) {
      return res.json({ added_count: 0 });
    }

    const { data, error } = await supabase
      .from('outreach_processed_clients')
      .upsert(rows, { onConflict: 'campaign_id,target_username' })
      .select();
    if (error) throw error;
    res.json({ added_count: data?.length || 0 });
  } catch (error) {
    logger.error('Error uploading processed clients', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================= HISTORY =================

// GET /api/outreach/history/export - Export dialogs
router.get('/history/export', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { format = 'json', campaign_id: campaignId } = req.query;
  const safeFormat = String(format).toLowerCase();

  try {
    let chatsQuery = supabase
      .from('outreach_chats')
      .select(`
        *,
        account:outreach_accounts(phone_number),
        campaign:outreach_campaigns(id, name)
      `)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (campaignId) {
      chatsQuery = chatsQuery.eq('campaign_id', campaignId);
    }

    const { data: chats, error: chatsError } = await chatsQuery;
    if (chatsError) throw chatsError;

    const chatIds = (chats || []).map(chat => chat.id);
    let messages = [];
    if (chatIds.length > 0) {
      const { data: msgs, error: msgsError } = await supabase
        .from('outreach_messages')
        .select('*')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: true });
      if (msgsError) throw msgsError;
      messages = msgs || [];
    }

    const messagesByChat = messages.reduce((acc, msg) => {
      const key = msg.chat_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(msg);
      return acc;
    }, {});

    const payload = {
      exported_at: new Date().toISOString(),
      dialogs: (chats || []).map(chat => ({
        chat_id: chat.id,
        campaign_id: chat.campaign_id,
        campaign_name: chat.campaign?.name || null,
        account_phone: chat.account?.phone_number || null,
        target_username: chat.target_username,
        target_name: chat.target_name,
        lead_status: chat.lead_status || 'none',
        status: chat.status,
        processed_at: chat.processed_at,
        last_message_at: chat.last_message_at,
        messages: (messagesByChat[chat.id] || []).map(m => ({
          sender: m.sender,
          content: m.content,
          created_at: m.created_at
        }))
      }))
    };

    const dateStamp = new Date().toISOString().slice(0, 10);
    if (safeFormat === 'html') {
      const leadLabels = {
        lead: '✅ Лид',
        not_lead: '❌ Не лид',
        later: '⏰ Потом',
        none: '—'
      };
      const stats = payload.dialogs.reduce((acc, dialog) => {
        const key = dialog.lead_status || 'none';
        acc[key] = (acc[key] || 0) + 1;
        acc.total += 1;
        return acc;
      }, { total: 0, lead: 0, not_lead: 0, later: 0, none: 0 });

      const dialogsHtml = payload.dialogs.map(dialog => {
        const status = dialog.lead_status || 'none';
        const messagesHtml = (dialog.messages || []).map(msg => (
          `<div class="msg ${msg.sender === 'me' ? 'me' : 'them'}">
            <div class="msg-role">${msg.sender === 'me' ? 'Мы' : 'Он'}</div>
            <div class="msg-text">${escapeHtml(msg.content || '')}</div>
            <div class="msg-time">${escapeHtml(msg.created_at || '')}</div>
          </div>`
        )).join('');

        return `
          <div class="dialog">
            <div class="dialog-header">
              <div class="dialog-title">${escapeHtml(dialog.target_name || '')} ${dialog.target_username ? '@' + escapeHtml(dialog.target_username) : ''}</div>
              <div class="dialog-meta">
                <span class="badge ${status}">${leadLabels[status] || status}</span>
                <span>${escapeHtml(dialog.account_phone || '')}</span>
                <span>${escapeHtml(dialog.campaign_name || '')}</span>
              </div>
            </div>
            <div class="dialog-messages">${messagesHtml || '<div class="empty">Нет сообщений</div>'}</div>
          </div>
        `;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>История диалогов</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f6f7fb; margin: 0; padding: 20px; color: #1f2937; }
    .header { margin-bottom: 20px; }
    .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .stat { background: #fff; padding: 10px 14px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .dialog { background: #fff; padding: 12px; border-radius: 10px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .dialog-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .dialog-title { font-weight: 600; }
    .dialog-meta { display: flex; gap: 8px; font-size: 12px; color: #6b7280; align-items: center; }
    .badge { padding: 2px 6px; border-radius: 6px; font-size: 11px; color: #fff; }
    .badge.lead { background: #5cb85c; }
    .badge.not_lead { background: #d9534f; }
    .badge.later { background: #f0ad4e; }
    .badge.none { background: #9ca3af; }
    .dialog-messages { margin-top: 10px; display: grid; gap: 6px; }
    .msg { padding: 8px 10px; border-radius: 8px; background: #f3f4f6; }
    .msg.me { background: #dbeafe; }
    .msg-role { font-size: 11px; color: #6b7280; }
    .msg-text { margin: 4px 0; }
    .msg-time { font-size: 10px; color: #9ca3af; }
    .empty { font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <h2>История диалогов</h2>
    <div>Экспортировано: ${escapeHtml(payload.exported_at)}</div>
  </div>
  <div class="stats">
    <div class="stat">Всего: ${stats.total}</div>
    <div class="stat">Лиды: ${stats.lead}</div>
    <div class="stat">Не лиды: ${stats.not_lead}</div>
    <div class="stat">Потом: ${stats.later}</div>
    <div class="stat">Не размечены: ${stats.none}</div>
  </div>
  ${dialogsHtml || '<div class="empty">Нет диалогов</div>'}
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="outreach_dialogs_${dateStamp}.html"`);
      return res.send(html);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="outreach_dialogs_${dateStamp}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.error('Error exporting history', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/outreach/history/import - Import lead statuses
router.post('/history/import', upload.single('file'), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let payload;
  try {
    payload = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON file' });
  }

  const dialogs = Array.isArray(payload.dialogs) ? payload.dialogs : [];
  const validStatuses = new Set(['none', 'lead', 'not_lead', 'later']);
  let imported = 0;
  let skipped = 0;
  let missingCampaign = 0;
  let missingUsername = 0;
  const fallbackCampaignId = req.body?.campaign_id || req.query?.campaign_id || null;

  try {
    for (const dialog of dialogs) {
      const rawStatus = String(dialog.lead_status || dialog.status || 'none').toLowerCase();
      const leadStatus = validStatuses.has(rawStatus) ? rawStatus : 'none';
      const updates = { lead_status: leadStatus };

      if (leadStatus === 'lead' || leadStatus === 'not_lead') {
        updates.processed_at = new Date().toISOString();
        updates.status = 'manual';
      } else if (leadStatus === 'none') {
        updates.processed_at = null;
      }

      let updatedChats = [];
      if (dialog.chat_id) {
        const { data, error } = await supabase
          .from('outreach_chats')
          .update(updates)
          .eq('id', dialog.chat_id)
          .eq('user_id', userId)
          .select('id, campaign_id, target_username, target_name');
        if (error) throw error;
        updatedChats = data || [];
      } else {
        const campaignId = dialog.campaign_id || fallbackCampaignId;
        const username = normalizeUsername(dialog.target_username || dialog.username);
        if (!campaignId) {
          missingCampaign += 1;
          skipped += 1;
          continue;
        }
        if (!username) {
          missingUsername += 1;
          skipped += 1;
          continue;
        }
        const { data, error } = await supabase
          .from('outreach_chats')
          .update(updates)
          .eq('campaign_id', campaignId)
          .eq('target_username', username)
          .eq('user_id', userId)
          .select('id, campaign_id, target_username, target_name');
        if (error) throw error;
        updatedChats = data || [];
      }

      if (!updatedChats.length) {
        skipped += 1;
        continue;
      }

      imported += 1;

      const chat = updatedChats[0];
      if (chat?.campaign_id && chat?.target_username) {
        const identifier = normalizeUsername(chat.target_username) || chat.target_username;
        await supabase
          .from('outreach_targets')
          .update({ lead_status: leadStatus })
          .eq('campaign_id', chat.campaign_id)
          .or(`username.eq.${identifier},phone.eq.${identifier}`);
      }

      if (chat?.campaign_id && chat?.target_username) {
        const identifier = normalizeUsername(chat.target_username) || chat.target_username;
        if (leadStatus === 'lead' || leadStatus === 'not_lead') {
          await supabase
            .from('outreach_processed_clients')
            .upsert([{
              user_id: userId,
              campaign_id: chat.campaign_id,
              target_username: identifier,
              target_name: chat.target_name || null
            }], { onConflict: 'campaign_id,target_username' });
        } else if (leadStatus === 'none') {
          await supabase
            .from('outreach_processed_clients')
            .delete()
            .eq('user_id', userId)
            .eq('campaign_id', chat.campaign_id)
            .eq('target_username', identifier);
        }
      }
    }

    res.json({
      imported_count: imported,
      skipped_count: skipped,
      skipped_missing_campaign: missingCampaign,
      skipped_missing_username: missingUsername
    });
  } catch (error) {
    logger.error('Error importing history', { error: error.message });
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
