-- Add message_prompt field to user_config table
-- This field stores the user's prompt for generating sales message suggestions

ALTER TABLE user_config
ADD COLUMN IF NOT EXISTS message_prompt TEXT;

COMMENT ON COLUMN user_config.message_prompt IS 'User prompt for generating sales message suggestions for leads';

