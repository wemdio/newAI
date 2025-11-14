-- Migration: Fix is_available for existing active accounts
-- Description: Set is_available=true for all active accounts that don't have it set
-- Created: 2025-11-14

-- Update all active accounts to be available if not explicitly set to false
UPDATE telegram_accounts 
SET is_available = true
WHERE status = 'active' 
  AND (is_available IS NULL OR is_available = false);

-- Add comment to column for clarity
COMMENT ON COLUMN telegram_accounts.is_available IS 'Whether account is available for use by Python Worker (not banned, not in cooldown)';

