-- Create user_config table
-- Stores user configurations for lead detection

CREATE TABLE IF NOT EXISTS user_config (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  openrouter_api_key TEXT,
  lead_prompt TEXT NOT NULL,
  telegram_channel_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_config_user_id ON user_config(user_id);

-- Create index on is_active for filtering active users
CREATE INDEX IF NOT EXISTS idx_user_config_active ON user_config(is_active);

-- Add comments for documentation
COMMENT ON TABLE user_config IS 'User configurations for lead detection system';
COMMENT ON COLUMN user_config.user_id IS 'Reference to auth.users - unique identifier for user';
COMMENT ON COLUMN user_config.openrouter_api_key IS 'Encrypted OpenRouter API key for AI analysis';
COMMENT ON COLUMN user_config.lead_prompt IS 'User-defined criteria for lead detection';
COMMENT ON COLUMN user_config.telegram_channel_id IS 'Telegram channel ID where leads are posted';
COMMENT ON COLUMN user_config.is_active IS 'Whether lead detection is active for this user';

