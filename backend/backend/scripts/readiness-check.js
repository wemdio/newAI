import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function readinessCheck() {
  console.log('🔍 TELEGRAM LEAD SCANNER - READINESS CHECK\n');
  console.log('===========================================\n');

  let allGood = true;

  // 1. Database Connection
  console.log('1️⃣ Database Connection');
  try {
    const { data, error } = await supabase.from('messages').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log('   ✅ Database connected\n');
  } catch (error) {
    console.log('   ❌ Database connection failed:', error.message, '\n');
    allGood = false;
  }

  // 2. Required Tables
  console.log('2️⃣ Database Tables');
  const requiredTables = ['messages', 'user_config', 'detected_leads', 'api_usage', 'processing_logs'];
  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      console.log(`   ✅ Table '${table}' exists`);
    } catch (error) {
      console.log(`   ❌ Table '${table}' missing or inaccessible`);
      allGood = false;
    }
  }
  console.log('');

  // 3. Messages Data
  console.log('3️⃣ Messages Data');
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    
    if (count > 0) {
      console.log(`   ✅ ${count} messages available for scanning`);
      
      // Get latest message date
      const { data: latest } = await supabase
        .from('messages')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (latest && latest[0]) {
        const date = new Date(latest[0].created_at);
        const hoursAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
        console.log(`   📅 Latest message: ${hoursAgo} hours ago`);
      }
    } else {
      console.log('   ⚠️ No messages in database');
      console.log('   ℹ️ You need to run your Telegram scraper first to collect messages');
      allGood = false;
    }
  } catch (error) {
    console.log('   ❌ Error checking messages:', error.message);
    allGood = false;
  }
  console.log('');

  // 4. Environment Variables
  console.log('4️⃣ Environment Variables');
  const requiredEnvs = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'TELEGRAM_BOT_TOKEN'
  ];
  
  for (const env of requiredEnvs) {
    if (process.env[env]) {
      console.log(`   ✅ ${env} configured`);
    } else {
      console.log(`   ❌ ${env} missing`);
      allGood = false;
    }
  }
  console.log('');

  // 5. User Configuration
  console.log('5️⃣ User Configuration (via UI)');
  const userId = '00000000-0000-0000-0000-000000000001';
  try {
    const { data: config, error } = await supabase
      .from('user_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (config) {
      console.log('   ✅ Configuration exists');
      console.log(`   ${config.is_active ? '✅' : '⚠️'} Scanner ${config.is_active ? 'ACTIVE' : 'PAUSED'}`);
      console.log(`   ${config.openrouter_api_key ? '✅' : '❌'} OpenRouter API key ${config.openrouter_api_key ? 'set' : 'missing'}`);
      console.log(`   ${config.telegram_channel_id ? '✅' : '❌'} Telegram channel ${config.telegram_channel_id ? 'set' : 'missing'}`);
      console.log(`   ${config.lead_prompt ? '✅' : '❌'} Lead criteria ${config.lead_prompt ? 'defined' : 'missing'}`);
      
      if (!config.openrouter_api_key || !config.telegram_channel_id || !config.lead_prompt) {
        console.log('   ℹ️ Complete setup in the Configuration page');
        allGood = false;
      }
    } else {
      console.log('   ⚠️ No configuration found');
      console.log('   ℹ️ Please configure the system in the Configuration page');
      allGood = false;
    }
  } catch (error) {
    console.log('   ⚠️ No configuration found (first time setup)');
    console.log('   ℹ️ Please configure the system in the Configuration page');
    allGood = false;
  }
  console.log('');

  // Summary
  console.log('===========================================');
  if (allGood) {
    console.log('✅ SYSTEM READY TO SCAN!\n');
    console.log('The hourly scanner will run automatically.');
    console.log('You can also test manually: npm run test-scan');
  } else {
    console.log('⚠️ SETUP INCOMPLETE\n');
    console.log('Next steps:');
    console.log('1. Ensure your Telegram scraper is collecting messages');
    console.log('2. Open http://localhost:5173 in your browser');
    console.log('3. Go to Configuration page and complete setup');
    console.log('4. Run this check again: npm run readiness-check');
  }
  console.log('===========================================');
}

readinessCheck().catch(console.error);






