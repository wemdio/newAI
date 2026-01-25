#!/usr/bin/env node
/**
 * Recalculate industry categories for existing contacts.
 *
 * Usage:
 *   node scripts/recalculate-industry-categories.js --batch 500 --only-enriched true --overwrite false
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { detectIndustryCategory } from '../src/utils/contactIndustry.js';

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
const onlyEnriched = String(getArg('only-enriched', 'true')).toLowerCase() !== 'false';
const overwrite = String(getArg('overwrite', 'false')).toLowerCase() === 'true';

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

while (true) {
  let query = supabase
    .from('contacts')
    .select('id, industry, position, company_name, bio, ai_summary, last_message_preview, industry_category, is_enriched')
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (onlyEnriched) {
    query = query.eq('is_enriched', true);
  }

  const { data: contacts, error } = await query;

  if (error) {
    console.error('❌ Failed to fetch contacts:', error.message);
    process.exit(1);
  }

  if (!contacts || contacts.length === 0) {
    break;
  }

  const updates = contacts
    .map((contact) => {
      const category = detectIndustryCategory(contact);
      if (!category) return null;
      if (!overwrite && contact.industry_category) return null;
      if (!overwrite && contact.industry_category === category) return null;
      return {
        id: contact.id,
        industry_category: category,
        updated_at: new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (updates.length > 0) {
    const { error: updateError } = await supabase
      .from('contacts')
      .upsert(updates, { onConflict: 'id' });

    if (updateError) {
      console.error('❌ Failed to update contacts:', updateError.message);
      process.exit(1);
    }

    updated += updates.length;
  }

  processed += contacts.length;
  offset += batchSize;

  console.log(`... processed ${processed}, updated ${updated}`);
  await new Promise((r) => setTimeout(r, 50));
}

console.log(`✅ Industry categorization complete. Processed: ${processed}, updated: ${updated}`);
