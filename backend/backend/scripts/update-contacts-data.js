#!/usr/bin/env node

/**
 * Скрипт для обновления данных контактов (bio, имена) из messages
 * Запуск: node scripts/update-contacts-data.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 100;

async function main() {
  console.log('🚀 Обновление данных контактов из messages...\n');
  
  const startTime = Date.now();
  let totalUpdated = 0;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Получаем контакты без bio
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, username')
      .or('bio.is.null,bio.eq.')
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) {
      console.error('❌ Ошибка получения контактов:', error.message);
      break;
    }
    
    if (!contacts || contacts.length === 0) {
      hasMore = false;
      break;
    }
    
    // Обновляем каждый контакт
    for (const contact of contacts) {
      try {
        // Получаем данные из messages
        const { data: messages } = await supabase
          .from('messages')
          .select('first_name, last_name, bio, user_id, profile_link')
          .eq('username', contact.username)
          .not('bio', 'is', null)
          .neq('bio', '')
          .order('message_time', { ascending: false })
          .limit(1);
        
        if (messages && messages.length > 0) {
          const msg = messages[0];
          
          await supabase
            .from('contacts')
            .update({
              first_name: msg.first_name || null,
              last_name: msg.last_name || null,
              bio: msg.bio,
              telegram_user_id: msg.user_id,
              profile_link: msg.profile_link,
              updated_at: new Date().toISOString()
            })
            .eq('id', contact.id);
          
          totalUpdated++;
        }
      } catch (err) {
        // Игнорируем ошибки отдельных контактов
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r📊 Проверено: ${offset + contacts.length} | Обновлено с bio: ${totalUpdated} | ${elapsed}s`);
    
    offset += BATCH_SIZE;
    
    // Пауза чтобы не перегружать API
    await new Promise(r => setTimeout(r, 100));
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n\n✅ Обновление завершено!');
  console.log(`   📊 Обновлено контактов с bio: ${totalUpdated}`);
  console.log(`   ⏱️  Время: ${totalTime}s`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
