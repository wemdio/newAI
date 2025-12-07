-- 1. Remove existing duplicates, keeping the most recently updated/created one
DELETE FROM outreach_accounts a USING outreach_accounts b 
WHERE a.id < b.id 
AND a.phone_number = b.phone_number 
AND a.user_id = b.user_id;

-- 2. Add unique constraint to prevent future duplicates
ALTER TABLE outreach_accounts 
ADD CONSTRAINT outreach_accounts_phone_user_unique UNIQUE (user_id, phone_number);



