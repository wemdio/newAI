ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS spam_score INTEGER DEFAULT 0;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS spam_reasons TEXT[] DEFAULT '{}';

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_low_quality BOOLEAN DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_contacts_spam_score_range'
  ) THEN
    ALTER TABLE contacts
    ADD CONSTRAINT check_contacts_spam_score_range
    CHECK (spam_score >= 0 AND spam_score <= 100);
  END IF;
END $$;

COMMENT ON COLUMN contacts.is_spam IS 'Detected spam/bot account';
COMMENT ON COLUMN contacts.spam_score IS 'Spam score (0-100)';
COMMENT ON COLUMN contacts.spam_reasons IS 'Spam detection reasons';
COMMENT ON COLUMN contacts.is_low_quality IS 'Low-quality account (empty profile, low activity)';
