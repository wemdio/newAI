#!/usr/bin/env node

/**
 * Скрипт для первичной агрегации контактов из messages
 * Запуск: node scripts/aggregate-contacts.js
 * 
 * Этот скрипт создаёт записи в таблице contacts на основе
 * уникальных username из таблицы messages
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

const BATCH_SIZE = 100; // Сколько контактов обрабатывать за раз

async function getUniqueUsernames(offset, limit) {
  const { data, error } = await supabase
    .from('messages')
    .select('username')
    .not('username', 'is', null)
    .neq('username', '')
    .order('username')
    .range(offset, offset + limit - 1);
  
  if (error) throw error;
  return [...new Set(data?.map(m => m.username) || [])];
}

async function getExistingUsernames(usernames) {
  const { data, error } = await supabase
    .from('contacts')
    .select('username')
    .in('username', usernames);
  
  if (error) throw error;
  return new Set(data?.map(c => c.username) || []);
}

async function aggregateContact(username) {
  // Получаем все сообщения этого пользователя
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('username', username)
    .order('message_time', { ascending: false })
    .limit(50);
  
  if (error || !messages?.length) return null;
  
  // Находим данные
  const latestWithBio = messages.find(m => m.bio);
  const latestWithName = messages.find(m => m.first_name || m.last_name);
  const sourceChats = [...new Set(messages.map(m => m.chat_name).filter(Boolean))];
  
  return {
    telegram_user_id: messages[0].user_id,
    username,
    first_name: latestWithName?.first_name || null,
    last_name: latestWithName?.last_name || null,
    bio: latestWithBio?.bio || null,
    profile_link: messages[0].profile_link,
    source_chats: sourceChats,
    messages_count: messages.length,
    first_seen_at: messages[messages.length - 1].message_time,
    last_seen_at: messages[0].message_time,
    last_message_preview: messages[0].message?.substring(0, 200)
  };
}

async function saveContact(contactData) {
  const { error } = await supabase
    .from('contacts')
    .upsert(contactData, { onConflict: 'username' });
  
  return !error;
}

async function main() {
  console.log('🚀 Запуск агрегации контактов...\n');
  
  let offset = 0;
  let totalProcessed = 0;
  let totalSaved = 0;
  let hasMore = true;
  
  const startTime = Date.now();
  
  while (hasMore) {
    try {
      // Получаем батч username
      const usernames = await getUniqueUsernames(offset, BATCH_SIZE * 10);
      
      if (usernames.length === 0) {
        hasMore = false;
        break;
      }
      
      // Проверяем какие уже есть
      const existing = await getExistingUsernames(usernames);
      const newUsernames = usernames.filter(u => !existing.has(u));
      
      if (newUsernames.length === 0) {
        offset += BATCH_SIZE * 10;
        continue;
      }
      
      // Обрабатываем новых
      for (const username of newUsernames.slice(0, BATCH_SIZE)) {
        try {
          const contactData = await aggregateContact(username);
          if (contactData) {
            const saved = await saveContact(contactData);
            if (saved) totalSaved++;
          }
          totalProcessed++;
          
          // Прогресс каждые 50 записей
          if (totalProcessed % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (totalSaved / (elapsed / 60)).toFixed(1);
            process.stdout.write(`\r📊 Обработано: ${totalProcessed} | Сохранено: ${totalSaved} | ${elapsed}s | ${rate}/мин`);
          }
        } catch (err) {
          console.error(`\n❌ Ошибка для @${username}:`, err.message);
        }
      }
      
      offset += BATCH_SIZE * 10;
      
      // Небольшая пауза чтобы не перегрузить API
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err) {
      console.error('\n❌ Ошибка батча:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n\n✅ Агрегация завершена!');
  console.log(`   📊 Обработано: ${totalProcessed}`);
  console.log(`   💾 Сохранено: ${totalSaved}`);
  console.log(`   ⏱️  Время: ${totalTime}s`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
