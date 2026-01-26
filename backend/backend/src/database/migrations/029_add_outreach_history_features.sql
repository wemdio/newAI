-- Add outreach proxies table
CREATE TABLE IF NOT EXISTS outreach_proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_proxies_user_url
    ON outreach_proxies(user_id, url);
CREATE INDEX IF NOT EXISTS idx_outreach_proxies_user
    ON outreach_proxies(user_id);

ALTER TABLE outreach_accounts
ADD COLUMN IF NOT EXISTS proxy_id UUID REFERENCES outreach_proxies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_accounts_proxy_id
    ON outreach_accounts(proxy_id);

-- Add processed clients table
CREATE TABLE IF NOT EXISTS outreach_processed_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    target_username TEXT NOT NULL,
    target_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (campaign_id, target_username)
);

CREATE INDEX IF NOT EXISTS idx_outreach_processed_clients_user
    ON outreach_processed_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_processed_clients_campaign
    ON outreach_processed_clients(campaign_id);

-- Add manual messages queue table
CREATE TABLE IF NOT EXISTS outreach_manual_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    chat_id UUID REFERENCES outreach_chats(id) ON DELETE CASCADE,
    account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
    target_username TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_manual_messages_user
    ON outreach_manual_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_manual_messages_status
    ON outreach_manual_messages(status);

-- RLS policies
ALTER TABLE outreach_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_processed_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_manual_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their outreach proxies"
    ON outreach_proxies FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their processed clients"
    ON outreach_processed_clients FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their manual outreach messages"
    ON outreach_manual_messages FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
