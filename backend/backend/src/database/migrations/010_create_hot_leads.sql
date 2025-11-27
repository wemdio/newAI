-- Create hot_leads table
-- Stores identified hot leads with full conversation history

CREATE TABLE IF NOT EXISTS hot_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  lead_id INTEGER NOT NULL,
  conversation_history JSONB[] NOT NULL,
  contact_info JSONB,
  posted_to_channel BOOLEAN DEFAULT false,
  assigned_to_manager TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_hot_leads_campaign FOREIGN KEY (campaign_id) REFERENCES messaging_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_hot_leads_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_hot_leads_lead FOREIGN KEY (lead_id) REFERENCES detected_leads(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_hot_leads_campaign ON hot_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_hot_leads_conversation ON hot_leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_hot_leads_lead ON hot_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_hot_leads_posted ON hot_leads(posted_to_channel);
CREATE INDEX IF NOT EXISTS idx_hot_leads_created ON hot_leads(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE hot_leads IS 'Hot leads identified by AI during conversations';
COMMENT ON COLUMN hot_leads.campaign_id IS 'Campaign that found this hot lead';
COMMENT ON COLUMN hot_leads.conversation_id IS 'Reference to full conversation';
COMMENT ON COLUMN hot_leads.lead_id IS 'Original detected lead';
COMMENT ON COLUMN hot_leads.conversation_history IS 'Full conversation history (snapshot)';
COMMENT ON COLUMN hot_leads.contact_info IS 'Contact information (username, phone, etc)';
COMMENT ON COLUMN hot_leads.posted_to_channel IS 'Whether posted to Telegram notification channel';
COMMENT ON COLUMN hot_leads.assigned_to_manager IS 'Sales manager assigned to this lead';
COMMENT ON COLUMN hot_leads.notes IS 'Additional notes about the lead';



