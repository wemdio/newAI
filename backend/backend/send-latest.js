import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';
import { postLeadToChannel, markLeadAsPosted } from './src/services/telegramPoster.js';

dotenv.config();

async function sendLatest() {
  try {
    const supabase = getSupabase();
    
    console.log('Getting latest unposted lead...');
    
    const { data: lead } = await supabase
      .from('detected_leads')
      .select('*, messages(*)')
      .eq('posted_to_telegram', false)
      .order('detected_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!lead) {
      console.log('No unposted leads!');
      process.exit(0);
      return;
    }
    
    console.log(`Found lead ${lead.id} (${lead.confidence_score}%)`);
    
    const { data: config } = await supabase.from('user_config').select('*').single();
    
    console.log(`Sending to channel: ${config.telegram_channel_id}`);
    
    const result = await postLeadToChannel(
      lead.messages,
      {
        confidence_score: lead.confidence_score,
        reasoning: lead.reasoning,
        matched_criteria: lead.matched_criteria
      },
      config.telegram_channel_id,
      null,
      lead.user_id,
      null
    );
    
    if (result.success && !result.skipped) {
      await markLeadAsPosted(lead.id);
      console.log(`SUCCESS! Message ID: ${result.messageId}`);
      console.log(`Check Telegram: ${config.telegram_channel_id}`);
    } else {
      console.log(`Not sent: ${result.reason}`);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

sendLatest();

