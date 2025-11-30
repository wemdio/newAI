-- Add deduplication fields for lead detection
-- Prevents duplicate leads from same sender

-- Add message_hash to detected_leads table
ALTER TABLE detected_leads 
ADD COLUMN IF NOT EXISTS message_hash TEXT,
ADD COLUMN IF NOT EXISTS sender_id TEXT;

-- Create index for fast duplicate checks
CREATE INDEX IF NOT EXISTS idx_detected_leads_sender_hash 
  ON detected_leads(user_id, sender_id, detected_at DESC);

-- Create index for message hash lookups
CREATE INDEX IF NOT EXISTS idx_detected_leads_hash 
  ON detected_leads(message_hash);

-- Add comments for documentation
COMMENT ON COLUMN detected_leads.message_hash IS 'SHA256 hash of message text for deduplication';
COMMENT ON COLUMN detected_leads.sender_id IS 'Telegram sender ID for deduplication';

