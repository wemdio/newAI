import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function debugNow() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== DEBUG - ЧТО ПРОИСХОДИТ ПРЯМО СЕЙЧАС ===\n');
    
    // 1. Check recent messages
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
    const { data: veryRecentMessages } = await supabase
      .from('messages')
      .select('*')
      .gte('created_at', oneMinuteAgo.toISOString())
      .order('created_at', { ascending: false });
    
    console.log(`📨 Новых сообщений за ПОСЛЕДНЮЮ МИНУТУ: ${veryRecentMessages?.length || 0}`);
    
    if (veryRecentMessages && veryRecentMessages.length > 0) {
      console.log('ЕСТЬ НОВЫЕ СООБЩЕНИЯ!');
      veryRecentMessages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. ID:${msg.id}, Created: ${new Date(msg.created_at).toLocaleString()}`);
        console.log(`     Text: ${msg.message?.substring(0, 60)}...`);
      });
    } else {
      console.log('⚠️  НЕТ новых сообщений за последнюю минуту!');
      console.log('Scanner ждет НОВЫЕ сообщения.');
      console.log('Проблема: Нет новых данных для обработки!');
    }
    
    // 2. Check recent leads
    const { data: veryRecentLeads } = await supabase
      .from('detected_leads')
      .select('*')
      .gte('detected_at', oneMinuteAgo.toISOString())
      .order('detected_at', { ascending: false });
    
    console.log(`\n🎯 Новых ЛИДОВ за последнюю минуту: ${veryRecentLeads?.length || 0}`);
    
    if (veryRecentLeads && veryRecentLeads.length > 0) {
      veryRecentLeads.forEach((lead, idx) => {
        console.log(`  ${idx + 1}. Lead ID:${lead.id}, Posted: ${lead.posted_to_telegram ? 'YES' : 'NO'}`);
      });
    }
    
    // 3. Check config
    const { data: config } = await supabase.from('user_config').select('*').single();
    console.log(`\n⚙️  КОНФИГУРАЦИЯ:`);
    console.log(`   Active: ${config.is_active}`);
    console.log(`   Channel: ${config.telegram_channel_id}`);
    console.log(`   Has Prompt: ${!!config.lead_prompt}`);
    console.log(`   Has API Key: ${!!config.openrouter_api_key}`);
    
    // 4. Check scanner via API
    console.log(`\n🔍 SCANNER STATUS (через API):`);
    try {
      const response = await fetch('http://localhost:3000/api/scanner/status', {
        headers: { 'x-user-id': config.user_id }
      });
      const status = await response.json();
      console.log(`   Running: ${status.status.isRunning}`);
    } catch (e) {
      console.log(`   ERROR: ${e.message}`);
    }
    
    // 5. Recommendations
    console.log(`\n💡 ДИАГНОЗ:`);
    
    if (!veryRecentMessages || veryRecentMessages.length === 0) {
      console.log(`   ❌ ПРОБЛЕМА: Нет новых сообщений в базе!`);
      console.log(`   → Scanner работает но НЕТ данных для обработки`);
      console.log(`   → Вы подключили Telegram каналы для мониторинга?`);
      console.log(`   → Scanner ждет REALTIME сообщения (не старые!)`);
    } else if (!veryRecentLeads || veryRecentLeads.length === 0) {
      console.log(`   ⚠️  Есть новые сообщения, но нет новых лидов`);
      console.log(`   → Сообщения не соответствуют критериям поиска`);
      console.log(`   → Или AI решил что это не лиды`);
    } else {
      const unposted = veryRecentLeads.filter(l => !l.posted_to_telegram);
      if (unposted.length > 0) {
        console.log(`   ❌ ПРОБЛЕМА: Лиды созданы но НЕ отправлены!`);
        console.log(`   → Realtime scanner НЕ вызывает postLeadToChannel`);
        console.log(`   → Нужно смотреть логи backend на ошибки`);
      } else {
        console.log(`   ✅ ВСЁ РАБОТАЕТ! Лиды создаются и отправляются!`);
      }
    }
    
    console.log(`\n=== END DEBUG ===\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

debugNow();

