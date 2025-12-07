-- Add support for importing session files
ALTER TABLE outreach_accounts 
ADD COLUMN IF NOT EXISTS session_file_data TEXT, -- Base64 encoded .session file content
ADD COLUMN IF NOT EXISTS import_status TEXT DEFAULT 'completed'; -- 'pending_conversion', 'completed', 'failed'

COMMENT ON COLUMN outreach_accounts.session_file_data IS 'Temporary storage for .session file content during import';

