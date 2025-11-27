import 'dotenv/config';
import { getSupabase } from '../src/config/database.js';

/**
 * Test analytics queries directly
 */

async function testAnalytics() {
  console.log('🧪 Testing analytics queries...\n');

  try {
    const supabase = getSupabase();
    const userId = '00000000-0000-0000-0000-000000000001';

    // Test 1: api_usage
    console.log('1️⃣ Testing api_usage table...');
    const { data: usage, error: usageError } = await supabase
      .from('api_usage')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    if (usageError) {
      console.log(`❌ Error: ${usageError.message}`);
    } else {
      console.log(`✅ Success! Found ${usage.length} records`);
    }

    // Test 2: processing_logs
    console.log('\n2️⃣ Testing processing_logs table...');
    const { data: logs, error: logsError } = await supabase
      .from('processing_logs')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    if (logsError) {
      console.log(`❌ Error: ${logsError.message}`);
    } else {
      console.log(`✅ Success! Found ${logs.length} records`);
    }

    // Test 3: detected_leads
    console.log('\n3️⃣ Testing detected_leads table...');
    const { data: leads, error: leadsError } = await supabase
      .from('detected_leads')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    if (leadsError) {
      console.log(`❌ Error: ${leadsError.message}`);
    } else {
      console.log(`✅ Success! Found ${leads.length} records`);
    }

    // Test 4: messages table
    console.log('\n4️⃣ Testing messages table...');
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .limit(5);

    if (messagesError) {
      console.log(`❌ Error: ${messagesError.message}`);
    } else {
      console.log(`✅ Success! Found ${messages.length} records`);
    }

    console.log('\n════════════════════════════════════════════════');
    console.log('✅ All direct queries completed');
    console.log('════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAnalytics();



