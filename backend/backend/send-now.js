import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';
import { postLeadToChannel, markLeadAsPosted } from './src/services/telegramPoster.js';

dotenv.config();

async function sendNow() {
  try {
    const supabase = getSupabase();
    
    const { data: leads } = await supabase
      .from('detected_leads')
      .select('*, messages(*)')
      .eq('posted_to_telegram', false);
    
    if (!leads || leads.length === 0) {
      console.log('No unposted leads');
      process.exit(0);
      return;
    }
    
    const { data: config } = await supabase.from('user_config').select('*').single();
    
    for (const lead of leads) {
      try {
        const result = await postLeadToChannel(
          lead.messages,
          { confidence_score: lead.confidence_score, reasoning: lead.reasoning, matched_criteria: lead.matched_criteria },
          config.telegram_channel_id,
          null,
          lead.user_id,
          null
        );
        
        if (result.success && !result.skipped) {
          await markLeadAsPosted(lead.id);
          console.log(`Lead ${lead.id} sent! Message ID: ${result.messageId}`);
        }
      } catch (e) {
        console.log(`Error sending lead ${lead.id}: ${e.message}`);
      }
    }
  } catch (error) {
    console.error(error.message);
  }
  process.exit(0);
}

sendNow();

