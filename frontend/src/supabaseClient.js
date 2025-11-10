import { createClient } from '@supabase/supabase-js';

// Single Supabase client instance - used across the entire app
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://liavhyhyzqadilfmicba.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0OTYzNTIsImV4cCI6MjA0NzA3MjM1Mn0.9PYLZGoraFE-APYPC7Fhok23TH8WBD0bxSLnb7L_gHM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;

