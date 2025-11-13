-- Make api_id and api_hash nullable for session string imports
-- Session strings from account shops may not include API credentials initially

ALTER TABLE telegram_accounts 
  ALTER COLUMN api_id DROP NOT NULL,
  ALTER COLUMN api_hash DROP NOT NULL;

-- Update comments
COMMENT ON COLUMN telegram_accounts.api_id IS 'Telegram API ID (optional for session imports, can be extracted later)';
COMMENT ON COLUMN telegram_accounts.api_hash IS 'Telegram API Hash (optional for session imports, can be extracted later)';

