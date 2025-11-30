-- Add account statistics for smart rotation
-- Migration: 012

-- Add total_messages_sent counter (lifetime)
ALTER TABLE telegram_accounts 
  ADD COLUMN IF NOT EXISTS total_messages_sent INTEGER DEFAULT 0;

-- Add ban/flood wait counter
ALTER TABLE telegram_accounts 
  ADD COLUMN IF NOT EXISTS ban_count INTEGER DEFAULT 0;

-- Add reliability score (0-100, calculated based on performance)
ALTER TABLE telegram_accounts 
  ADD COLUMN IF NOT EXISTS reliability_score INTEGER DEFAULT 50;

-- Add last_ban_at timestamp
ALTER TABLE telegram_accounts 
  ADD COLUMN IF NOT EXISTS last_ban_at TIMESTAMPTZ;

-- Create index for sorting by reliability
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_reliability 
  ON telegram_accounts(reliability_score DESC, total_messages_sent DESC);

-- Add comments
COMMENT ON COLUMN telegram_accounts.total_messages_sent IS 'Total messages sent by this account (lifetime)';
COMMENT ON COLUMN telegram_accounts.ban_count IS 'Number of times account received FloodWait or ban';
COMMENT ON COLUMN telegram_accounts.reliability_score IS 'Reliability score (0-100): higher = more reliable';
COMMENT ON COLUMN telegram_accounts.last_ban_at IS 'Timestamp of last FloodWait/ban';


