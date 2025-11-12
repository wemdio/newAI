-- Create ai_conversations table
-- Stores ongoing conversations with leads

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  account_id UUID NOT NULL,
  lead_id INTEGER NOT NULL,
  peer_user_id BIGINT NOT NULL,
  peer_username TEXT,
  conversation_history JSONB[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'hot_lead', 'stopped', 'completed')),
  last_message_at TIMESTAMPTZ,
  messages_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_ai_conversations_campaign FOREIGN KEY (campaign_id) REFERENCES messaging_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_conversations_account FOREIGN KEY (account_id) REFERENCES telegram_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_conversations_lead FOREIGN KEY (lead_id) REFERENCES detected_leads(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_conversations_campaign ON ai_conversations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_account ON ai_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_lead ON ai_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON ai_conversations(status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_peer ON ai_conversations(peer_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_last_message ON ai_conversations(last_message_at DESC);

-- Add comments for documentation
COMMENT ON TABLE ai_conversations IS 'Active AI conversations with leads';
COMMENT ON COLUMN ai_conversations.campaign_id IS 'Campaign this conversation belongs to';
COMMENT ON COLUMN ai_conversations.account_id IS 'Telegram account conducting this conversation';
COMMENT ON COLUMN ai_conversations.lead_id IS 'Reference to detected lead';
COMMENT ON COLUMN ai_conversations.peer_user_id IS 'Telegram user ID of the lead';
COMMENT ON COLUMN ai_conversations.peer_username IS 'Telegram username of the lead';
COMMENT ON COLUMN ai_conversations.conversation_history IS 'Array of messages (JSONB: {role, content, timestamp})';
COMMENT ON COLUMN ai_conversations.status IS 'Conversation status: active, waiting, hot_lead, stopped, completed';
COMMENT ON COLUMN ai_conversations.messages_count IS 'Total messages exchanged';

