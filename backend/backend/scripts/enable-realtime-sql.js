import 'dotenv/config';
import { getSupabase } from '../src/config/database.js';

/**
 * Enable Realtime via SQL directly
 */

async function enableRealtimeSQL() {
  console.log('⚡ Enabling Realtime for messages table via SQL...\n');

  try {
    const supabase = getSupabase();

    // Try to enable realtime publication
    console.log('1️⃣ Adding messages table to Realtime publication...');
    
    const { error: sqlError } = await supabase.rpc('enable_realtime_for_table', {
      table_name: 'messages'
    });

    if (sqlError) {
      console.log('⚠️  RPC method not available, trying direct SQL...\n');
      
      // Alternative: try via raw SQL (requires service_role key)
      const { error } = await supabase.from('messages').select('id').limit(1);
      
      if (error) {
        throw new Error(`Cannot access messages table: ${error.message}`);
      }

      console.log('📝 Manual SQL command needed:\n');
      console.log('ALTER PUBLICATION supabase_realtime ADD TABLE messages;');
      console.log('\nℹ️  This requires SUPERUSER or service_role access.\n');
      console.log('════════════════════════════════════════════════');
      console.log('Please use one of these methods:');
      console.log('════════════════════════════════════════════════\n');
      console.log('METHOD 1 (Recommended): Supabase Dashboard');
      console.log('1. Open: https://supabase.com/dashboard');
      console.log('2. Go to: Database → Replication');
      console.log('3. Find table "messages"');
      console.log('4. Toggle ON Realtime');
      console.log('5. Click Save\n');
      
      console.log('METHOD 2: SQL Editor in Dashboard');
      console.log('1. Open: https://supabase.com/dashboard');
      console.log('2. Go to: SQL Editor');
      console.log('3. Run this command:');
      console.log('\n   ALTER PUBLICATION supabase_realtime ADD TABLE messages;\n');
      
      console.log('METHOD 3: Check if Realtime is enabled globally');
      console.log('1. Go to: Settings → API');
      console.log('2. Check if "Realtime" is enabled');
      console.log('3. If not, enable it and try again\n');
      
      return;
    }

    console.log('✅ Realtime enabled successfully!\n');
    
    // Verify
    console.log('2️⃣ Verifying...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let verified = false;
    const channel = supabase
      .channel('verify-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages'
      }, () => {})
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          verified = true;
          console.log('✅ Realtime verified and working!\n');
        }
      });

    await new Promise(resolve => setTimeout(resolve, 3000));
    await supabase.removeChannel(channel);

    if (verified) {
      console.log('════════════════════════════════════════════════');
      console.log('✅ SUCCESS! Realtime is enabled!');
      console.log('════════════════════════════════════════════════');
      console.log('\n📝 Next steps:');
      console.log('1. Add to backend/.env: SCAN_MODE=realtime');
      console.log('2. Restart backend: npm start');
      console.log('3. Watch logs for: "✅ Realtime scanner subscribed successfully"\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📌 Please enable manually via Dashboard');
    process.exit(1);
  }
}

enableRealtimeSQL();



