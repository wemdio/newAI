-- Fix RLS for api_usage table
-- This allows anon key to read data

-- Disable RLS temporarily (for development)
ALTER TABLE api_usage DISABLE ROW LEVEL SECURITY;

-- OR if you want to keep RLS enabled, create a policy:
-- ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow anon read access"
-- ON api_usage FOR SELECT
-- USING (true);

-- CREATE POLICY "Allow anon insert"
-- ON api_usage FOR INSERT
-- WITH CHECK (true);



