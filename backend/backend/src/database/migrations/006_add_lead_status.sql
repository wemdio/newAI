-- Add lead_status column to detected_leads table
-- Allows marking leads as: lead (default), not_lead, or sale

ALTER TABLE detected_leads
ADD COLUMN IF NOT EXISTS lead_status VARCHAR(20) DEFAULT 'lead' CHECK (lead_status IN ('lead', 'not_lead', 'sale'));

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_detected_leads_status ON detected_leads(lead_status);

-- Add comment
COMMENT ON COLUMN detected_leads.lead_status IS 'Lead classification: lead (default), not_lead (false positive), sale (converted)';

