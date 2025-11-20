import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with fallback values for production
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://liavhyhyzqadilfmicba.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM'
);

export default supabase;

