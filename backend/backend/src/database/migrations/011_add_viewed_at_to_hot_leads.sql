-- Add viewed_at column to hot_leads for tracking notification read status
-- This column tracks when a user viewed/acknowledged the hot lead notification

ALTER TABLE hot_leads 
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for faster queries on unviewed notifications
CREATE INDEX IF NOT EXISTS idx_hot_leads_viewed_at ON hot_leads(viewed_at);

-- Comment for documentation
COMMENT ON COLUMN hot_leads.viewed_at IS 'Timestamp when user viewed this notification, NULL means unread';
