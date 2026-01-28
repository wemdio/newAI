-- Add per-account daily limit for AI messaging
ALTER TABLE telegram_accounts
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 3;

COMMENT ON COLUMN telegram_accounts.daily_limit IS 'Max messages per day for this account';
