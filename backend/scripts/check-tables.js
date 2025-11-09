import 'dotenv/config';
import { getSupabase } from '../src/config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Check if all required tables exist
 */

const REQUIRED_TABLES = [
  'user_config',
  'detected_leads',
  'api_usage',
  'processing_logs'
];

async function checkTables() {
  console.log('🔍 Checking database tables...\n');

  try {
    const supabase = getSupabase();

    // Check each table
    const results = {};
    
    for (const tableName of REQUIRED_TABLES) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          if (error.code === '42P01') {
            // Table doesn't exist
            results[tableName] = false;
            console.log(`❌ ${tableName} - NOT FOUND`);
          } else {
            throw error;
          }
        } else {
          results[tableName] = true;
          console.log(`✅ ${tableName} - EXISTS`);
        }
      } catch (err) {
        results[tableName] = false;
        console.log(`❌ ${tableName} - ERROR: ${err.message}`);
      }
    }

    console.log('\n════════════════════════════════════════════════');

    const missingTables = Object.entries(results)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);

    if (missingTables.length === 0) {
      console.log('✅ ALL TABLES EXIST!');
      console.log('════════════════════════════════════════════════\n');
      console.log('Your database is ready! 🎉\n');
      return true;
    } else {
      console.log('⚠️  MISSING TABLES:', missingTables.join(', '));
      console.log('════════════════════════════════════════════════\n');
      
      console.log('📝 To create missing tables:\n');
      console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
      console.log('2. Go to: SQL Editor');
      console.log('3. Run these migration files IN ORDER:\n');
      
      const migrations = {
        'user_config': '001_create_user_config.sql',
        'detected_leads': '002_create_detected_leads.sql',
        'api_usage': '003_create_api_usage.sql',
        'processing_logs': '004_create_processing_logs.sql'
      };

      missingTables.forEach(table => {
        if (migrations[table]) {
          console.log(`   - backend/src/database/migrations/${migrations[table]}`);
        }
      });

      console.log('\nOR copy SQL from migration files and run in SQL Editor.\n');
      
      return false;
    }

  } catch (error) {
    console.error('❌ Error checking tables:', error.message);
    return false;
  }
}

checkTables();



