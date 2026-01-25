ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS industry_category TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_industry_category
  ON contacts (industry_category);

COMMENT ON COLUMN contacts.industry_category IS 'Normalized industry category key (marketing, ved, legal, manufacturing, wholesale, etc.)';
