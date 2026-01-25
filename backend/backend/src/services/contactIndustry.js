import { getSupabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { detectIndustryCategory } from '../utils/contactIndustry.js';

export async function recalculateIndustryCategories(options = {}) {
  const {
    batchSize = 500,
    onlyEnriched = true,
    overwrite = false
  } = options;

  const supabase = getSupabase();
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
      throw error;
    }

    if (!contacts || contacts.length === 0) {
      break;
    }

    const updates = contacts
      .map((contact) => {
        const category = detectIndustryCategory(contact);
        if (!category) return null;
        if (!overwrite && contact.industry_category === category) return null;
        if (!overwrite && contact.industry_category && contact.industry_category !== category) return null;
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
        throw updateError;
      }
      updated += updates.length;
    }

    processed += contacts.length;
    offset += batchSize;

    logger.info('Industry categorization progress', { processed, updated });
    await new Promise((r) => setTimeout(r, 50));
  }

  logger.info('Industry categorization completed', { processed, updated });
  return { processed, updated };
}

export default {
  recalculateIndustryCategories
};

