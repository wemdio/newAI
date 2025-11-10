import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function finalTest() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== ФИНАЛЬНЫЙ ТЕСТ С AI-ПОДСКАЗКАМИ ===\n');
    
    const testMessage = {
      message: `ФИНАЛЬНЫЙ ТЕСТ ${Date.now()}: Ищу агентство по лидогенерации в России. Нужна настройка рекламы для B2B компании.`,
      chat_name: 'Test Channel Final',
      first_name: 'Иван',
      last_name: 'Петров',
      username: 'ivan_test',
      bio: 'CEO компании',
      message_time: new Date().toISOString(),
      user_id: 987654321,
      profile_link: 'test'
    };
    
    const { data, error } = await supabase
      .from('messages')
      .insert(testMessage)
      .select()
      .single();
    
    if (error) {
      console.error('Ошибка:', error.message);
      return;
    }
    
    console.log(`✅ Тестовое сообщение создано! ID: ${data.id}`);
    console.log(`   Текст: ${data.message}`);
    console.log(`\n⏳ Scanner обрабатывает сообщение...`);
    console.log(`   1. Проверит критерии`);
    console.log(`   2. Вызовет AI для анализа`);
    console.log(`   3. Сгенерирует подсказку`);
    console.log(`   4. Отправит в Telegram`);
    
    console.log(`\n⏰ Ждем 20 секунд (генерация подсказки занимает время)...\n`);
    await new Promise(r => setTimeout(r, 20000));
    
    // Check result
    const { data: lead } = await supabase
      .from('detected_leads')
      .select('*')
      .eq('message_id', data.id)
      .single();
    
    if (lead) {
      console.log(`\n✅ ЛИД СОЗДАН!`);
      console.log(`   Lead ID: ${lead.id}`);
      console.log(`   Confidence: ${lead.confidence_score}%`);
      console.log(`   Posted: ${lead.posted_to_telegram ? '✅ ДА' : '❌ НЕТ'}`);
      
      if (lead.posted_to_telegram) {
        console.log(`\n🎉🎉🎉 УСПЕХ! 🎉🎉🎉`);
        console.log(`\n✅ Лид отправлен в Telegram автоматически!`);
        console.log(`✅ С AI-подсказкой (если генерация прошла успешно)`);
        console.log(`\n📱 Проверьте Telegram канал: -1002988109791`);
        console.log(`   Лид должен содержать AI-подсказку в конце!`);
        console.log(`\n🚀 ВСЯ СИСТЕМА РАБОТАЕТ ПОЛНОСТЬЮ!`);
      } else {
        console.log(`\n⚠️  Лид создан но не отправлен - проблема осталась`);
      }
    } else {
      console.log(`\n❌ Лид не создан - сообщение не прошло фильтры`);
    }
    
    console.log(`\n=== ТЕСТ ЗАВЕРШЕН ===\n`);
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
  
  process.exit(0);
}

finalTest();

