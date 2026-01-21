-- Add Telegram posting confidence threshold to user_config

ALTER TABLE user_config
ADD COLUMN IF NOT EXISTS telegram_min_confidence INTEGER DEFAULT 0;

ALTER TABLE user_config
ADD CONSTRAINT check_telegram_min_confidence_range
CHECK (telegram_min_confidence >= 0 AND telegram_min_confidence <= 100);

COMMENT ON COLUMN user_config.telegram_min_confidence IS 'Min confidence score required to post lead to Telegram (0-100)';
