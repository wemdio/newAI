import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkMessages() {
  console.log('Checking messages table for real data...\n');

  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    console.log(`✅ Total messages in database: ${count}`);

    if (count > 0) {
      // Get sample messages
      const { data: messages, error } = await supabase
        .from('messages')
        .select('id, text, created_at, channel_id')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      console.log('\n📝 Sample messages (latest 5):');
      messages.forEach((msg, idx) => {
        console.log(`\n${idx + 1}. ID: ${msg.id}`);
        console.log(`   Channel: ${msg.channel_id || 'N/A'}`);
        console.log(`   Date: ${msg.created_at}`);
        console.log(`   Text: ${msg.text?.substring(0, 100)}${msg.text?.length > 100 ? '...' : ''}`);
      });

      // Get date range
      const { data: dateRange } = await supabase
        .from('messages')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

      if (dateRange && dateRange[0]) {
        console.log(`\n📅 Date range: ${dateRange[0].created_at} to ${messages[0].created_at}`);
      }

      console.log('\n✅ Ready to scan real data!');
    } else {
      console.log('\n⚠️ No messages found in database');
      console.log('Please make sure your Telegram scraper is running and collecting messages first.');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkMessages();






