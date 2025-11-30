import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';
import { getTelegramBot } from './src/config/telegram.js';

dotenv.config();

async function fullDiagnostic() {
  try {
    const supabase = getSupabase();
    
    console.log('\n========================================');
    console.log('       ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ      ');
    console.log('========================================\n');
    
    // 1. Проверка конфигурации
    console.log('📋 1. КОНФИГУРАЦИЯ:');
    const { data: config } = await supabase
      .from('user_config')
      .select('*')
      .single();
    
    if (!config) {
      console.log('❌ Нет конфигурации в базе!');
      return;
    }
    
    console.log(`   User ID: ${config.user_id}`);
    console.log(`   Channel ID: ${config.telegram_channel_id}`);
    console.log(`   Active: ${config.is_active}`);
    console.log(`   Lead Prompt: ${config.lead_prompt ? '✅' : '❌'}`);
    console.log(`   API Key: ${config.openrouter_api_key ? '✅' : '❌'}`);
    
    // 2. Проверка Telegram бота
    console.log('\n🤖 2. TELEGRAM BOT:');
    try {
      const bot = getTelegramBot();
      const botInfo = await bot.getMe();
      console.log(`   ✅ Bot active: @${botInfo.username}`);
      
      // Проверка доступа к каналу
      try {
        await bot.sendMessage(config.telegram_channel_id, '🧪 Test from diagnostic');
        console.log(`   ✅ Can send to channel: ${config.telegram_channel_id}`);
      } catch (channelError) {
        console.log(`   ❌ Cannot send to channel: ${channelError.message}`);
        console.log('   💡 Add bot to channel as admin with "Post Messages" permission');
      }
    } catch (botError) {
      console.log(`   ❌ Bot error: ${botError.message}`);
    }
    
    // 3. Проверка сообщений
    console.log('\n📨 3. СООБЩЕНИЯ В БАЗЕ:');
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('*')
      .gte('created_at', tenMinutesAgo.toISOString())
      .order('created_at', { ascending: false });
    
    console.log(`   Новых за 10 минут: ${recentMessages?.length || 0}`);
    
    if (recentMessages && recentMessages.length > 0) {
      console.log('   Последние 3:');
      recentMessages.slice(0, 3).forEach((msg, idx) => {
        console.log(`     ${idx + 1}. ID:${msg.id} - ${msg.message?.substring(0, 40)}...`);
        console.log(`        Created: ${new Date(msg.created_at).toLocaleString()}`);
      });
    } else {
      console.log('   ⚠️  НЕТ новых сообщений!');
      console.log('   💡 Scanner ждет НОВЫЕ сообщения из Telegram каналов');
      console.log('   💡 Вы подключили Telegram каналы для мониторинга?');
    }
    
    // 4. Проверка лидов
    console.log('\n🎯 4. ЛИДЫ:');
    const { data: allLeads } = await supabase
      .from('detected_leads')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(10);
    
    const total = allLeads?.length || 0;
    const posted = allLeads?.filter(l => l.posted_to_telegram).length || 0;
    const notPosted = allLeads?.filter(l => !l.posted_to_telegram).length || 0;
    
    console.log(`   Всего лидов: ${total}`);
    console.log(`   Отправлено: ${posted}`);
    console.log(`   НЕ отправлено: ${notPosted}`);
    
    if (notPosted > 0) {
      console.log('\n   ⚠️  НЕОБРАБОТАННЫЕ ЛИДЫ:');
      allLeads.filter(l => !l.posted_to_telegram).forEach((lead, idx) => {
        console.log(`     ${idx + 1}. ID:${lead.id}, Conf:${lead.confidence_score}%, Time:${new Date(lead.detected_at).toLocaleString()}`);
      });
    }
    
    // 5. Проверка Scanner через API
    console.log('\n🔍 5. SCANNER STATUS:');
    try {
      const response = await fetch('http://localhost:3000/api/scanner/status', {
        headers: { 'x-user-id': config.user_id }
      });
      
      if (response.ok) {
        const status = await response.json();
        console.log(`   Running: ${status.status.isRunning ? '✅ TRUE' : '❌ FALSE'}`);
        if (status.status.subscribedAt) {
          console.log(`   Started: ${status.status.subscribedAt}`);
        }
      } else {
        console.log(`   ❌ API error: ${response.status}`);
      }
    } catch (apiError) {
      console.log(`   ❌ Cannot connect to backend: ${apiError.message}`);
    }
    
    // 6. Рекомендации
    console.log('\n💡 РЕКОМЕНДАЦИИ:');
    
    if (notPosted > 0) {
      console.log('   ⚠️  Есть необработанные лиды!');
      console.log('   → Запустите: node send-unposted.js');
    }
    
    if (!recentMessages || recentMessages.length === 0) {
      console.log('   ⚠️  Нет новых сообщений для анализа!');
      console.log('   → Проверьте что Telegram каналы подключены');
      console.log('   → Scanner ждет НОВЫЕ сообщения (realtime)');
    }
    
    if (recentMessages && recentMessages.length > 0 && notPosted === 0) {
      console.log('   ✅ Есть сообщения, но нет новых лидов');
      console.log('   → Сообщения не соответствуют критериям поиска');
      console.log('   → Или все лиды уже отправлены');
    }
    
    console.log('\n========================================\n');
    
  } catch (error) {
    console.error('Ошибка диагностики:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

fullDiagnostic();

