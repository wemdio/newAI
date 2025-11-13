-- Create messaging_campaigns table
-- Stores AI outreach campaigns configuration

CREATE TABLE IF NOT EXISTS messaging_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  communication_prompt TEXT NOT NULL,
  hot_lead_criteria TEXT NOT NULL,
  target_channel_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'stopped')),
  leads_contacted INTEGER DEFAULT 0,
  hot_leads_found INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to user_config
  CONSTRAINT fk_messaging_campaigns_user FOREIGN KEY (user_id) REFERENCES user_config(user_id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messaging_campaigns_user ON messaging_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_campaigns_status ON messaging_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_messaging_campaigns_started ON messaging_campaigns(started_at DESC);

-- Add comments for documentation
COMMENT ON TABLE messaging_campaigns IS 'AI-powered outreach campaigns';
COMMENT ON COLUMN messaging_campaigns.user_id IS 'Owner of this campaign';
COMMENT ON COLUMN messaging_campaigns.name IS 'Campaign name for identification';
COMMENT ON COLUMN messaging_campaigns.communication_prompt IS 'AI prompt for conversation style';
COMMENT ON COLUMN messaging_campaigns.hot_lead_criteria IS 'Criteria for identifying hot leads';
COMMENT ON COLUMN messaging_campaigns.target_channel_id IS 'Telegram channel ID to post hot leads';
COMMENT ON COLUMN messaging_campaigns.status IS 'Campaign status: draft, running, paused, stopped';
COMMENT ON COLUMN messaging_campaigns.leads_contacted IS 'Total leads contacted in this campaign';
COMMENT ON COLUMN messaging_campaigns.hot_leads_found IS 'Total hot leads identified';



