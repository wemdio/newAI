import { createClient } from '@supabase/supabase-js';

// Single Supabase client instance - used across the entire app
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;

