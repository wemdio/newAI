CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'internal-contact-registry',
  '*/5 * * * *',
  $$SET statement_timeout = '30s'; SELECT contacts_final_v1.advance_live_contacts(1000);$$
);
