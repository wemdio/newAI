-- Create telegram_accounts table
-- Stores Telegram accounts used for outreach campaigns

CREATE TABLE IF NOT EXISTS telegram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  session_file TEXT NOT NULL,
  phone_number TEXT,
  api_id INTEGER NOT NULL,
  api_hash TEXT NOT NULL,
  proxy_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'banned', 'error')),
  last_used_at TIMESTAMPTZ,
  messages_sent_today INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key to user_config
  CONSTRAINT fk_telegram_accounts_user FOREIGN KEY (user_id) REFERENCES user_config(user_id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user ON telegram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_status ON telegram_accounts(status);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_available ON telegram_accounts(is_available);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_last_used ON telegram_accounts(last_used_at);

-- Add comments for documentation
COMMENT ON TABLE telegram_accounts IS 'Telegram accounts for AI outreach campaigns';
COMMENT ON COLUMN telegram_accounts.user_id IS 'Owner of this account (company/user)';
COMMENT ON COLUMN telegram_accounts.account_name IS 'Display name for the account';
COMMENT ON COLUMN telegram_accounts.session_file IS 'Path to Telethon session file';
COMMENT ON COLUMN telegram_accounts.api_id IS 'Telegram API ID';
COMMENT ON COLUMN telegram_accounts.api_hash IS 'Telegram API Hash';
COMMENT ON COLUMN telegram_accounts.proxy_url IS 'Proxy URL for this account (format: protocol://user:pass@host:port)';
COMMENT ON COLUMN telegram_accounts.status IS 'Current status: active, paused, banned, error';
COMMENT ON COLUMN telegram_accounts.messages_sent_today IS 'Counter for daily message limit';
COMMENT ON COLUMN telegram_accounts.is_available IS 'Whether account is available for rotation';

