import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { getSupabase } from '../../config/database.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const supabase = getSupabase();
const upload = multer({ storage: multer.memoryStorage() });

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

    if (error) {
        if (error.code === '23505') { // Unique violation
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

// DELETE /api/outreach/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
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

// POST /api/outreach/accounts/import
router.post('/accounts/import', upload.array('files'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const defaultProxy = req.body.default_proxy;
  const accountsToInsert = [];
  let skippedCount = 0;

  try {
    // Iterate over all uploaded ZIP files
    for (const file of req.files) {
        try {
            const zip = new AdmZip(file.buffer);
            const zipEntries = zip.getEntries();
            
            // Index files by name
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

            // Process pairs
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
       return res.status(400).json({ error: `No valid accounts found in uploaded files. Skipped ${skippedCount} accounts due to missing proxy.` });
    }

    // Use ignoreDuplicates (onConflict) to handle duplicates gracefully
    const { data, error } = await supabase
      .from('outreach_accounts')
      .insert(accountsToInsert)
      .select(); // Note: upsert/ignoreDuplicates via Supabase JS client is explicit: .upsert(rows, { onConflict: 'user_id, phone_number', ignoreDuplicates: true })

    // However, standard insert with duplicate might throw. 
    // Let's use upsert with ignoreDuplicates
    
    const { data: insertedData, error: insertError } = await supabase
        .from('outreach_accounts')
        .upsert(accountsToInsert, { onConflict: 'user_id, phone_number', ignoreDuplicates: true })
        .select();

    if (insertError) throw insertError;

    // Note: 'data' might be null/empty for ignored rows depending on client version, 
    // but usually returns the rows that were touched or all if selected.
    
    // If we want to count ACTUAL inserts, it's harder with ignoreDuplicates. 
    // We can just say "Processed X accounts".

    res.json({ 
        count: insertedData ? insertedData.length : 0, 
        skipped: skippedCount,
        message: `Processed ${accountsToInsert.length} accounts from files. Skipped ${skippedCount} (missing proxy). Duplicates were ignored.` 
    });

  } catch (error) {
    logger.error('Import failed', { error: error.message });
    res.status(500).json({ error: 'Import failed: ' + error.message });
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

// ================= LOGS =================

// GET /api/outreach/logs
router.get('/logs', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('outreach_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('Error fetching logs', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;

