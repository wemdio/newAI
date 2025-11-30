-- Create detected_leads table
-- Stores leads found by AI analysis

CREATE TABLE IF NOT EXISTS detected_leads (
  id SERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL,
  user_id UUID NOT NULL,
  confidence_score INT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning TEXT NOT NULL,
  matched_criteria JSONB,
  posted_to_telegram BOOLEAN DEFAULT false,
  is_contacted BOOLEAN DEFAULT false,
  notes TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to messages table
  CONSTRAINT fk_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_detected_leads_user ON detected_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_leads_message ON detected_leads(message_id);
CREATE INDEX IF NOT EXISTS idx_detected_leads_time ON detected_leads(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_detected_leads_confidence ON detected_leads(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_detected_leads_posted ON detected_leads(posted_to_telegram);
CREATE INDEX IF NOT EXISTS idx_detected_leads_contacted ON detected_leads(is_contacted);

-- Create composite index for user + time queries
CREATE INDEX IF NOT EXISTS idx_detected_leads_user_time ON detected_leads(user_id, detected_at DESC);

-- Add comments for documentation
COMMENT ON TABLE detected_leads IS 'Leads detected by AI analysis system';
COMMENT ON COLUMN detected_leads.message_id IS 'Reference to original message in messages table';
COMMENT ON COLUMN detected_leads.user_id IS 'User who owns this lead detection';
COMMENT ON COLUMN detected_leads.confidence_score IS 'AI confidence score (0-100)';
COMMENT ON COLUMN detected_leads.reasoning IS 'AI explanation for why this is a lead';
COMMENT ON COLUMN detected_leads.matched_criteria IS 'JSON array of criteria that matched';
COMMENT ON COLUMN detected_leads.posted_to_telegram IS 'Whether lead has been posted to Telegram';
COMMENT ON COLUMN detected_leads.is_contacted IS 'Whether user has contacted this lead';
COMMENT ON COLUMN detected_leads.notes IS 'User notes about this lead';

