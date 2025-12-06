-- Create message_queue table for manual messages
-- Allows Node.js backend to queue messages for Python worker to send

CREATE TABLE IF NOT EXISTS message_queue (
  id SERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES messaging_campaigns(id), -- Optional, for context
  account_id UUID REFERENCES telegram_accounts(id), -- Which account to send from
  peer_username TEXT NOT NULL, -- Who to send to
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Index for fast polling
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_created ON message_queue(created_at);

-- Comment
COMMENT ON TABLE message_queue IS 'Queue for manual messages to be sent by Python worker';

