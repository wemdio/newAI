-- Make telegram_channel_id optional
ALTER TABLE user_config ALTER COLUMN telegram_channel_id DROP NOT NULL;

