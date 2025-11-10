import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function checkSchema() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== ПРОВЕРКА СХЕМЫ ТАБЛИЦЫ messages ===\n');
    
    // Get one message to see structure
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .limit(1);
    
    if (messages && messages.length > 0) {
      console.log('Колонки в таблице messages:');
      Object.keys(messages[0]).forEach(key => {
        console.log(`  - ${key}: ${typeof messages[0][key]}`);
      });
      
      console.log('\nПример сообщения:');
      console.log(JSON.stringify(messages[0], null, 2));
    } else {
      console.log('❌ Нет сообщений в таблице!');
    }
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
  
  process.exit(0);
}

checkSchema();

