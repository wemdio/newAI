-- Create outreach_chats table
CREATE TABLE IF NOT EXISTS outreach_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    account_id UUID REFERENCES outreach_accounts(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
    target_username TEXT NOT NULL,
    target_name TEXT,
    status TEXT DEFAULT 'active', -- active, manual, replied, closed
    unread_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(account_id, target_username)
);

-- Create outreach_messages table
CREATE TABLE IF NOT EXISTS outreach_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES outreach_chats(id) ON DELETE CASCADE NOT NULL,
    sender TEXT NOT NULL, -- 'me', 'them'
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

-- Add auto_reply_enabled to campaigns
ALTER TABLE outreach_campaigns 
ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT FALSE;

-- RLS Policies
ALTER TABLE outreach_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own chats"
    ON outreach_chats FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage messages in their chats"
    ON outreach_messages FOR ALL
    USING (
        chat_id IN (
            SELECT id FROM outreach_chats WHERE user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_chats_user_id ON outreach_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_chats_account_id ON outreach_chats(account_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_chat_id ON outreach_messages(chat_id);


