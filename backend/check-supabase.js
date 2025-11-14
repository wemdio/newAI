import 'dotenv/config';

console.log('🔍 Checking Supabase Configuration...\n');

console.log('Environment Variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL || '❌ NOT SET');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ SET (hidden)' : '❌ NOT SET');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ SET' : '❌ NOT SET');
console.log('\n');

// Try to import and test Supabase connection
try {
  const { initializeDatabase, testConnection } = await import('./src/config/database.js');
  
  console.log('🔄 Initializing Supabase client...');
  await initializeDatabase();
  console.log('✅ Client initialized\n');
  
  console.log('🔄 Testing connection...');
  await testConnection();
  console.log('✅ Connection successful!\n');
  
  console.log('🎉 Supabase is ready to use!');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n📝 Please set Supabase credentials in backend/.env file:');
  console.log('   SUPABASE_URL=https://your-project.supabase.co');
  console.log('   SUPABASE_ANON_KEY=your-anon-key');
  process.exit(1);
}






















