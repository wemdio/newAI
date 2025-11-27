import 'dotenv/config';
import { initializeDatabase, testConnection } from '../src/config/database.js';

/**
 * Test database connection
 */

async function testDb() {
  console.log('Testing database connection...\n');
  
  try {
    // Initialize
    console.log('1. Initializing Supabase client...');
    await initializeDatabase();
    console.log('✅ Client initialized\n');
    
    // Test connection
    console.log('2. Testing connection...');
    await testConnection();
    console.log('✅ Connection successful\n');
    
    // Check tables
    console.log('3. Checking tables...');
    const { getSupabase } = await import('../src/config/database.js');
    const supabase = getSupabase();
    
    const tables = ['user_config', 'detected_leads', 'api_usage', 'processing_logs', 'messages'];
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('count')
          .limit(1);
        
        if (error) {
          console.log(`   ❌ Table '${table}': ${error.message}`);
        } else {
          console.log(`   ✅ Table '${table}' exists`);
        }
      } catch (e) {
        console.log(`   ❌ Table '${table}': ${e.message}`);
      }
    }
    
    console.log('\n✅ Database test complete');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

testDb();

