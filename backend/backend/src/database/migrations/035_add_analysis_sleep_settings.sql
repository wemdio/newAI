-- Add per-user sleep window settings for AI analysis (token-saving night mode)
-- Default: enabled, 01:00-08:00 MSK (UTC+3)
--
-- Format mirrors outreach_campaigns.sleep_periods (TEXT[] of "HH:MM-HH:MM" strings)
-- so users see one consistent UX across analysis and outreach.
--
-- During the configured window, realtimeScanner advances each user's
-- lastProcessedId WITHOUT calling the AI, dropping incoming messages
-- (typically nighttime spam) and saving OpenRouter tokens.

ALTER TABLE user_config
  ADD COLUMN IF NOT EXISTS analysis_sleep_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS analysis_sleep_periods TEXT[] DEFAULT ARRAY['01:00-08:00']::TEXT[],
  ADD COLUMN IF NOT EXISTS analysis_timezone_offset INTEGER DEFAULT 3;

COMMENT ON COLUMN user_config.analysis_sleep_enabled
  IS 'When TRUE, AI analysis is skipped during analysis_sleep_periods (messages are dropped, not queued)';
COMMENT ON COLUMN user_config.analysis_sleep_periods
  IS 'Array of "HH:MM-HH:MM" windows in local time. Overnight windows (start>end) wrap midnight. Boundaries inclusive.';
COMMENT ON COLUMN user_config.analysis_timezone_offset
  IS 'Hours offset from UTC for interpreting analysis_sleep_periods (e.g. 3 for MSK)';
