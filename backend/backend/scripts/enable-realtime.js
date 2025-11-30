import 'dotenv/config';
import { getSupabase } from '../src/config/database.js';

/**
 * Enable Realtime for messages table via SQL
 */

async function enableRealtime() {
  console.log('🔄 Enabling Realtime for messages table...\n');

  try {
    const supabase = getSupabase();

    // Check if we have access
    console.log('1️⃣ Checking database connection...');
    const { error: connectionError } = await supabase
      .from('messages')
      .select('count')
      .limit(1);

    if (connectionError) {
      throw new Error(`Connection failed: ${connectionError.message}`);
    }
    console.log('✅ Database connected\n');

    // Enable realtime publication for messages table
    console.log('2️⃣ Enabling Realtime publication...');
    
    // Note: This requires service_role key to work via SQL
    // With anon key, we can only check if realtime is enabled
    
    console.log('ℹ️  Checking Realtime status...');
    
    // Try to subscribe to test if realtime is enabled
    let realtimeEnabled = false;
    
    const channel = supabase
      .channel('test-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages'
      }, () => {
        console.log('Realtime event received');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeEnabled = true;
          console.log('✅ Realtime is already enabled for messages table!\n');
        } else if (status === 'CHANNEL_ERROR') {
          console.log('❌ Realtime is NOT enabled or connection error\n');
        }
      });

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Cleanup
    await supabase.removeChannel(channel);

    if (realtimeEnabled) {
      console.log('════════════════════════════════════════════════');
      console.log('✅ SUCCESS: Realtime is enabled!');
      console.log('════════════════════════════════════════════════');
      console.log('\n📝 Next steps:');
      console.log('1. Add to backend/.env: SCAN_MODE=realtime');
      console.log('2. Restart backend: npm start');
      console.log('3. You\'re ready to go! ⚡\n');
    } else {
      console.log('════════════════════════════════════════════════');
      console.log('⚠️  Realtime is NOT enabled');
      console.log('════════════════════════════════════════════════');
      console.log('\n📝 To enable Realtime:');
      console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
      console.log('2. Go to: Database → Replication');
      console.log('3. Find "messages" table');
      console.log('4. Toggle ON the Realtime switch');
      console.log('5. Click Save\n');
      console.log('OR use Service Role key (not recommended for security):\n');
      console.log('   ALTER PUBLICATION supabase_realtime ADD TABLE messages;');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Manual steps:');
    console.log('1. Open: https://supabase.com/dashboard');
    console.log('2. Database → Replication');
    console.log('3. Enable Realtime for "messages" table');
    process.exit(1);
  }
}

enableRealtime();



