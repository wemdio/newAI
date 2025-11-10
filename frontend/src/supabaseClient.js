import { createClient } from '@supabase/supabase-js';

// Single Supabase client instance - used across the entire app
const supabase = createClient(
  'https://liavhyhyzqadilfmicba.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0OTYzNTIsImV4cCI6MjA0NzA3MjM1Mn0.K2fqJZaO1B8kpXKbOBXL_4OMJH8sdxqaBNDMxw1bLDM'
);

export default supabase;

