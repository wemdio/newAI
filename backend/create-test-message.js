import dotenv from 'dotenv';
import { getSupabase } from './src/config/database.js';

dotenv.config();

async function createTestMessage() {
  try {
    const supabase = getSupabase();
    
    console.log('\n=== CREATING TEST MESSAGE ===\n');
    
    const testMessage = {
      message: `ТЕСТ ${Date.now()}: Ищу специалиста по лидогенерации в России. Нужна помощь.`,
      chat_name: 'Test Chat',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      bio: null,
      message_time: new Date().toISOString(),
      user_id: 123456789,
      profile_link: 'test'
    };
    
    const { data, error } = await supabase
      .from('messages')
      .insert(testMessage)
      .select()
      .single();
    
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    
    console.log(`✅ Test message created! ID: ${data.id}`);
    console.log(`   Text: ${data.message}`);
    console.log(`\n⏳ Scanner should process it in 5 seconds...`);
    console.log(`\n📊 CHECK IN 15 SECONDS:`);
    console.log(`   1. Check Telegram channel: -1002988109791`);
    console.log(`   2. Lead should arrive automatically!`);
    
    console.log(`\n⏰ Waiting 15 seconds...\n`);
    await new Promise(r => setTimeout(r, 15000));
    
    // Check if lead was created AND posted
    const { data: lead } = await supabase
      .from('detected_leads')
      .select('*')
      .eq('message_id', data.id)
      .single();
    
    if (lead) {
      console.log(`✅ LEAD CREATED!`);
      console.log(`   Lead ID: ${lead.id}`);
      console.log(`   Confidence: ${lead.confidence_score}%`);
      console.log(`   Posted: ${lead.posted_to_telegram ? '✅ YES!' : '❌ NO'}`);
      
      if (lead.posted_to_telegram) {
        console.log(`\n🎉 SUCCESS! AUTO-POSTING WORKS!`);
        console.log(`Check your Telegram: -1002988109791`);
      } else {
        console.log(`\n❌ LEAD NOT POSTED - Still a problem!`);
      }
    } else {
      console.log(`❌ NO LEAD CREATED - Scanner didnt process message`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

createTestMessage();

