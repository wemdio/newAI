import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://liavhyhyzqadilfmicba.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM';

console.log('🔌 Initializing Supabase:', { 
  url: supabaseUrl ? supabaseUrl.substring(0, 15) + '...' : 'MISSING',
  hasKey: !!supabaseKey
});

// Initialize Supabase client with fallback values for production
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export default supabase;

