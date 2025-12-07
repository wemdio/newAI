-- Update status check constraint to include 'pending_conversion'
ALTER TABLE outreach_accounts DROP CONSTRAINT IF EXISTS outreach_accounts_status_check;

ALTER TABLE outreach_accounts ADD CONSTRAINT outreach_accounts_status_check 
CHECK (status IN ('active', 'paused', 'error', 'pending_conversion', 'failed'));

