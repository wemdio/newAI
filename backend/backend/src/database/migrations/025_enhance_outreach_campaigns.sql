-- Enhance outreach_campaigns with AI settings and additional fields
ALTER TABLE outreach_campaigns 
ADD COLUMN IF NOT EXISTS ai_prompt TEXT,
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'google/gemini-2.0-flash-001',
ADD COLUMN IF NOT EXISTS message_delay_min INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS message_delay_max INTEGER DEFAULT 180,
ADD COLUMN IF NOT EXISTS messages_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS messages_replied INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Add assigned_account_id to outreach_targets for tracking which account handles which target
ALTER TABLE outreach_targets
ADD COLUMN IF NOT EXISTS assigned_account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
ADD COLUMN IF NOT EXISTS message_id BIGINT;

-- Create outreach_logs table if not exists (for worker logs)
CREATE TABLE IF NOT EXISTS outreach_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
    level TEXT DEFAULT 'INFO' CHECK (level IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for logs
CREATE INDEX IF NOT EXISTS idx_outreach_logs_user ON outreach_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_campaign ON outreach_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_created ON outreach_logs(created_at DESC);

-- RLS for logs
ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create
DROP POLICY IF EXISTS "Users can view their own logs" ON outreach_logs;
CREATE POLICY "Users can view their own logs"
    ON outreach_logs FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own logs" ON outreach_logs;
CREATE POLICY "Users can insert their own logs"
    ON outreach_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role policy for worker (uses service key, bypasses RLS but let's be explicit)
DROP POLICY IF EXISTS "Service role full access" ON outreach_logs;
CREATE POLICY "Service role full access"
    ON outreach_logs FOR ALL
    USING (true)
    WITH CHECK (true);
