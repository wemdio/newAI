import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';
import { postLeadToChannel, markLeadAsPosted } from './src/services/telegramPoster.js';

dotenv.config();

async function sendUnposted() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== ОТПРАВКА НЕОТПРАВЛЕННЫХ ЛИДОВ ===\n');
    
    // Get unposted leads
    const { data: leads } = await supabase
      .from('detected_leads')
      .select(`
        *,
        messages(*)
      `)
      .eq('posted_to_telegram', false)
      .order('detected_at', { ascending: false});
    
    if (!leads || leads.length === 0) {
      console.log('✅ Нет неотправленных лидов!');
      process.exit(0);
      return;
    }
    
    console.log(`Найдено неотправленных лидов: ${leads.length}\n`);
    
    // Get user config
    const { data: config } = await supabase
      .from('user_config')
      .select('*')
      .single();
    
    console.log(`Отправка в канал: ${config.telegram_channel_id}\n`);
    
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const lead of leads) {
      try {
        console.log(`\nОбработка лида #${lead.id}:`);
        console.log(`  Message ID: ${lead.message_id}`);
        console.log(`  Confidence: ${lead.confidence_score}%`);
        console.log(`  Message: ${lead.messages?.message?.substring(0, 60) || 'NO MESSAGE'}...`);
        
        const analysis = {
          confidence_score: lead.confidence_score,
          reasoning: lead.reasoning,
          matched_criteria: lead.matched_criteria
        };
        
        console.log(`  Отправка...`);
        
        const result = await postLeadToChannel(
          lead.messages,
          analysis,
          config.telegram_channel_id,
          null,
          lead.user_id,
          null
        );
        
        console.log(`  Result: success=${result.success}, skipped=${result.skipped}`);
        
        if (result.success && !result.skipped) {
          await markLeadAsPosted(lead.id);
          console.log(`  ✅ ОТПРАВЛЕНО! Message ID: ${result.messageId}`);
          sent++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (result.skipped) {
          console.log(`  ⏭️  Пропущен (${result.reason})`);
          skipped++;
        } else {
          console.log(`  ❌ Не отправлен`);
          failed++;
        }
      } catch (error) {
        console.log(`  ❌ ОШИБКА: ${error.message}`);
        console.log(`     Stack: ${error.stack}`);
        failed++;
      }
    }
    
    console.log(`\n=== РЕЗУЛЬТАТЫ ===`);
    console.log(`Отправлено: ${sent}`);
    console.log(`Пропущено: ${skipped}`);
    console.log(`Ошибок: ${failed}`);
    
    if (sent > 0) {
      console.log(`\n✅ Проверьте Telegram канал: ${config.telegram_channel_id}`);
    }
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

sendUnposted();
