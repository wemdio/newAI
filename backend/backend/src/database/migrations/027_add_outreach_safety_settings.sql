-- Add safety settings for outreach campaigns
ALTER TABLE outreach_campaigns
ADD COLUMN IF NOT EXISTS sleep_periods TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS timezone_offset INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS pre_read_delay_min INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS pre_read_delay_max INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS read_reply_delay_min INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS read_reply_delay_max INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS account_loop_delay_min INTEGER DEFAULT 300,
ADD COLUMN IF NOT EXISTS account_loop_delay_max INTEGER DEFAULT 600,
ADD COLUMN IF NOT EXISTS dialog_wait_window_min INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS dialog_wait_window_max INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS ignore_bot_usernames BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS account_cooldown_hours INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS follow_up_delay_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS follow_up_prompt TEXT,
ADD COLUMN IF NOT EXISTS reply_only_if_previously_wrote BOOLEAN DEFAULT TRUE;

-- Add safety tracking fields for outreach accounts
ALTER TABLE outreach_accounts
ADD COLUMN IF NOT EXISTS messages_sent_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_sent_date DATE,
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Add follow-up tracking fields for outreach chats
ALTER TABLE outreach_chats
ADD COLUMN IF NOT EXISTS last_message_sender TEXT,
ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;
