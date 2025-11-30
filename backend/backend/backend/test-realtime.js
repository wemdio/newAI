import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function testRealtime() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== ТЕСТ REALTIME SCANNER ===\n');
    
    console.log('Создаю тестовое сообщение...');
    
    // Create test message
    const testMessage = {
      message: 'Ищу специалиста по лидогенерации в России. Нужна помощь с настройкой рекламы.',
      chat_id: -1001234567890,
      chat_name: 'Test Channel',
      telegram_message_id: Math.floor(Math.random() * 1000000),
      sender_id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      message_time: new Date().toISOString(),
      message_link: 'https://t.me/test/123'
    };
    
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert(testMessage)
      .select()
      .single();
    
    if (error) {
      console.error('Ошибка создания сообщения:', error.message);
      return;
    }
    
    console.log(`✅ Тестовое сообщение создано! ID: ${inserted.id}`);
    console.log(`   Текст: ${inserted.message}`);
    console.log(`\n⏳ Scanner должен обработать его в течение 5 секунд...`);
    console.log(`\n📊 ЧТО ПРОВЕРИТЬ:`);
    console.log(`   1. Проверьте логи backend - должны появиться сообщения:`);
    console.log(`      - "New message received"`);
    console.log(`      - "Processing batch of new messages"`);
    console.log(`      - "🚀 ATTEMPTING TO POST LEAD TO TELEGRAM"`);
    console.log(`\n   2. Через 10 секунд проверьте базу данных:`);
    console.log(`      - Появился ли новый лид с message_id=${inserted.id}?`);
    console.log(`\n   3. Проверьте Telegram канал -1002988109791`);
    console.log(`      - Пришел ли туда лид?`);
    
    console.log(`\n⏰ Жду 15 секунд чтобы Scanner обработал сообщение...\n`);
    
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Check if lead was created
    const { data: lead } = await supabase
      .from('detected_leads')
      .select('*')
      .eq('message_id', inserted.id)
      .single();
    
    if (lead) {
      console.log(`\n✅ ЛИД СОЗДАН!`);
      console.log(`   Lead ID: ${lead.id}`);
      console.log(`   Confidence: ${lead.confidence_score}%`);
      console.log(`   Posted to Telegram: ${lead.posted_to_telegram ? '✅ ДА' : '❌ НЕТ'}`);
      
      if (!lead.posted_to_telegram) {
        console.log(`\n⚠️  ЛИД НЕ ОТПРАВЛЕН В TELEGRAM!`);
        console.log(`   Это значит что Scanner НЕ вызывает postLeadToChannel`);
        console.log(`   Проверьте логи backend на ошибки!`);
      } else {
        console.log(`\n🎉 ВСЁ РАБОТАЕТ! Лид отправлен в Telegram!`);
      }
    } else {
      console.log(`\n❌ ЛИД НЕ СОЗДАН!`);
      console.log(`   Scanner не обработал сообщение.`);
      console.log(`   Возможные причины:`);
      console.log(`   1. Scanner не запущен`);
      console.log(`   2. Realtime subscription не работает`);
      console.log(`   3. Сообщение не прошло предфильтр`);
      console.log(`   4. Ошибка в AI анализе`);
    }
    
    console.log(`\n=== ТЕСТ ЗАВЕРШЕН ===\n`);
    
  } catch (error) {
    console.error('Ошибка теста:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testRealtime();

