BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enrichment_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.contact_messages,
  public.contact_enrichment_logs
FROM PUBLIC, anon, authenticated;

COMMIT;
