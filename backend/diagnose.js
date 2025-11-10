import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function diagnose() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== ПОЛНАЯ ДИАГНОСТИКА ===\n');
    
    // 1. Проверка конфигурации
    console.log('1. Проверка конфигурации пользователя:');
    const { data: configs } = await supabase
      .from('user_config')
      .select('*');
    
    if (!configs || configs.length === 0) {
      console.log('❌ Нет конфигурации в базе!');
      return;
    }
    
    const config = configs[0];
    console.log(`✅ User ID: ${config.user_id}`);
    console.log(`✅ Channel ID: ${config.telegram_channel_id}`);
    console.log(`✅ Active: ${config.is_active}`);
    console.log(`✅ Lead Prompt: ${config.lead_prompt ? 'Установлен' : 'НЕ установлен'}`);
    console.log(`✅ API Key: ${config.openrouter_api_key ? 'Установлен' : 'НЕ установлен'}`);
    
    // 2. Проверка сообщений
    console.log('\n2. Проверка новых сообщений:');
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`Всего последних сообщений: ${recentMessages?.length || 0}`);
    if (recentMessages && recentMessages.length > 0) {
      console.log('Последние 3 сообщения:');
      recentMessages.slice(0, 3).forEach((msg, idx) => {
        console.log(`  ${idx + 1}. ID: ${msg.id}`);
        console.log(`     Text: ${msg.message?.substring(0, 60)}...`);
        console.log(`     Created: ${new Date(msg.created_at).toLocaleString()}`);
      });
    } else {
      console.log('⚠️  НЕТ НОВЫХ СООБЩЕНИЙ В БАЗЕ!');
      console.log('Scanner не может найти лиды если нет сообщений.');
    }
    
    // 3. Проверка лидов
    console.log('\n3. Проверка лидов:');
    const { data: leads } = await supabase
      .from('detected_leads')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(5);
    
    console.log(`Всего лидов: ${leads?.length || 0}`);
    const posted = leads?.filter(l => l.posted_to_telegram).length || 0;
    const notPosted = leads?.filter(l => !l.posted_to_telegram).length || 0;
    console.log(`  Отправлено: ${posted}`);
    console.log(`  НЕ отправлено: ${notPosted}`);
    
    if (notPosted > 0) {
      console.log('\n⚠️  ЕСТЬ НЕОТПРАВЛЕННЫЕ ЛИДЫ!');
      leads.filter(l => !l.posted_to_telegram).forEach((lead, idx) => {
        console.log(`  ${idx + 1}. Lead ID: ${lead.id}, Confidence: ${lead.confidence_score}%`);
      });
    }
    
    // 4. Проверка последнего сообщения
    console.log('\n4. Проверка - было ли добавлено сообщение за последние 5 минут:');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: veryRecentMessages } = await supabase
      .from('messages')
      .select('*')
      .gte('created_at', fiveMinutesAgo.toISOString());
    
    if (veryRecentMessages && veryRecentMessages.length > 0) {
      console.log(`✅ Найдено ${veryRecentMessages.length} новых сообщений за последние 5 минут`);
      console.log('Scanner должен был их обработать!');
    } else {
      console.log('⚠️  НЕТ новых сообщений за последние 5 минут');
      console.log('Проблема: Scanner работает, но НЕТ новых сообщений для анализа!');
      console.log('\n💡 РЕШЕНИЕ:');
      console.log('Scanner ждет НОВЫЕ сообщения из Telegram каналов.');
      console.log('Вы подключили Telegram каналы для мониторинга?');
      console.log('Проверьте что есть активные каналы в которых появляются сообщения.');
    }
    
    console.log('\n=== ДИАГНОСТИКА ЗАВЕРШЕНА ===\n');
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
  
  process.exit(0);
}

diagnose();

