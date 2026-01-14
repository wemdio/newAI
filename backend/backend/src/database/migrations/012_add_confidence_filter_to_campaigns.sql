-- Add confidence filter settings to messaging_campaigns
-- Allows filtering which leads AI contacts based on confidence score

-- Enable/disable confidence-based filtering
ALTER TABLE messaging_campaigns 
ADD COLUMN IF NOT EXISTS filter_by_confidence BOOLEAN DEFAULT false;

-- Maximum confidence score for AI to contact (leads above this go to managers)
ALTER TABLE messaging_campaigns 
ADD COLUMN IF NOT EXISTS max_confidence_for_ai INTEGER DEFAULT 90;

-- Add constraint to ensure valid confidence range
ALTER TABLE messaging_campaigns 
ADD CONSTRAINT check_max_confidence_range 
CHECK (max_confidence_for_ai >= 50 AND max_confidence_for_ai <= 100);

-- Comments for documentation
COMMENT ON COLUMN messaging_campaigns.filter_by_confidence IS 'When true, AI only contacts leads below max_confidence_for_ai threshold';
COMMENT ON COLUMN messaging_campaigns.max_confidence_for_ai IS 'Max confidence score for AI contact. Higher confidence leads left for manual handling';
