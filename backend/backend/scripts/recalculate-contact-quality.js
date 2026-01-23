#!/usr/bin/env node
/**
 * Recalculate spam/low-quality flags for existing contacts.
 *
 * Usage:
 *   node scripts/recalculate-contact-quality.js --batch 500
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { analyzeContactQuality } from '../src/utils/contactQuality.js';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const prefix = `--${name}`;
  const direct = args.find((arg) => arg.startsWith(`${prefix}=`));
  if (direct) return direct.slice(prefix.length + 1);
  const idx = args.indexOf(prefix);
  if (idx !== -1) return args[idx + 1] || fallback;
  return fallback;
};

const batchSize = parseInt(getArg('batch', '500'), 10);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let offset = 0;
let processed = 0;
let updated = 0;
let skipped = 0;

while (true) {
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, username, first_name, last_name, bio, last_message_preview, messages_count')
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('❌ Failed to fetch contacts:', error.message);
    process.exit(1);
  }

  if (!contacts || contacts.length === 0) {
    break;
  }

  const updates = contacts
    .filter((contact) => {
      if (!contact.username) {
        skipped += 1;
        return false;
      }
      return true;
    })
    .map((contact) => ({
      id: contact.id,
      username: contact.username,
      ...analyzeContactQuality({
        username: contact.username,
        first_name: contact.first_name,
        last_name: contact.last_name,
        bio: contact.bio,
        messages: [],
        last_message_preview: contact.last_message_preview,
        messages_count: contact.messages_count
      }),
      updated_at: new Date().toISOString()
    }));

  const { error: updateError } = await supabase
    .from('contacts')
    .upsert(updates, { onConflict: 'id' });

  if (updateError) {
    console.error('❌ Failed to update contacts:', updateError.message);
    process.exit(1);
  }

  processed += contacts.length;
  updated += updates.length;
  offset += batchSize;

  console.log(`... processed ${processed}`);
  await new Promise((r) => setTimeout(r, 50));
}

console.log(`✅ Quality recalculation complete. Processed: ${processed}, updated: ${updated}, skipped: ${skipped}`);
