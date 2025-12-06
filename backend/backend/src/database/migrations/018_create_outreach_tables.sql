-- Create table for Outreach Accounts (separate from scanner accounts)
CREATE TABLE IF NOT EXISTS outreach_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    api_id TEXT,
    api_hash TEXT,
    session_string TEXT, -- Telethon session string
    proxy_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'banned', 'paused', 'error')),
    last_active_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for Outreach Campaigns
CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    message_template TEXT NOT NULL, -- The initial message to send
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    account_ids UUID[] DEFAULT '{}', -- Array of outreach_accounts IDs used in this campaign
    daily_limit INTEGER DEFAULT 20, -- Max messages per day per account in this campaign
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for Outreach Targets (the people to contact)
CREATE TABLE IF NOT EXISTS outreach_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    username TEXT, -- @username
    phone TEXT, -- OR phone number
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'replied')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT target_identifier_check CHECK (username IS NOT NULL OR phone IS NOT NULL)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_outreach_accounts_user ON outreach_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_user ON outreach_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_targets_campaign ON outreach_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_targets_status ON outreach_targets(status);

-- Enable RLS
ALTER TABLE outreach_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_targets ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Users can only see their own data)

-- Outreach Accounts
CREATE POLICY "Users can view their own outreach accounts" 
    ON outreach_accounts FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own outreach accounts" 
    ON outreach_accounts FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own outreach accounts" 
    ON outreach_accounts FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own outreach accounts" 
    ON outreach_accounts FOR DELETE 
    USING (auth.uid() = user_id);

-- Outreach Campaigns
CREATE POLICY "Users can view their own campaigns" 
    ON outreach_campaigns FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns" 
    ON outreach_campaigns FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns" 
    ON outreach_campaigns FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns" 
    ON outreach_campaigns FOR DELETE 
    USING (auth.uid() = user_id);

-- Outreach Targets
-- Targets are linked to campaigns, which are linked to users.
-- We can use a join or simple check if we trust the insertion logic, but better to check campaign ownership.
CREATE POLICY "Users can view targets of their campaigns" 
    ON outreach_targets FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM outreach_campaigns 
        WHERE outreach_campaigns.id = outreach_targets.campaign_id 
        AND outreach_campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert targets to their campaigns" 
    ON outreach_targets FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM outreach_campaigns 
        WHERE outreach_campaigns.id = outreach_targets.campaign_id 
        AND outreach_campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can update targets of their campaigns" 
    ON outreach_targets FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM outreach_campaigns 
        WHERE outreach_campaigns.id = outreach_targets.campaign_id 
        AND outreach_campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete targets of their campaigns" 
    ON outreach_targets FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM outreach_campaigns 
        WHERE outreach_campaigns.id = outreach_targets.campaign_id 
        AND outreach_campaigns.user_id = auth.uid()
    ));

