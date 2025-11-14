-- Migration: Add session_string column to store hex-encoded session
-- Description: Store session data in DB so Python Worker can recreate session files
-- Created: 2025-11-14

-- Add session_string column (nullable for backward compatibility)
ALTER TABLE telegram_accounts 
ADD COLUMN IF NOT EXISTS session_string TEXT;

COMMENT ON COLUMN telegram_accounts.session_string IS 'Hex-encoded Telethon session data (optional, for worker recreation)';

