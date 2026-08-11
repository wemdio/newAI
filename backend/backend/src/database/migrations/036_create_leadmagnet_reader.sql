CREATE OR REPLACE VIEW leadbot.delivered_leads_export
WITH (security_barrier = true)
AS
SELECT
    l.lead_id,
    c.code AS category_code,
    c.title AS category,
    c.full_title AS category_full_title,
    l.text AS lead_text,
    l.contact,
    l.source,
    l.created_at::timestamptz AS lead_created_at,
    MIN(sl.sent_at::timestamptz) AS first_delivered_at,
    MAX(sl.sent_at::timestamptz) AS last_delivered_at,
    COUNT(*)::integer AS delivery_count
FROM leadbot.leads AS l
JOIN leadbot.categories AS c
  ON c.id = l.category_id
JOIN leadbot.sent_leads AS sl
  ON sl.lead_id = l.lead_id
GROUP BY
    l.lead_id,
    c.code,
    c.title,
    c.full_title;
REVOKE ALL ON leadbot.delivered_leads_export FROM PUBLIC;

COMMENT ON VIEW leadbot.delivered_leads_export IS
    'Leads delivered by @leadscannertgbot, without subscriber identifiers';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leadmagnet_reader') THEN
        CREATE ROLE leadmagnet_reader NOLOGIN NOINHERIT;
    END IF;
END
$$;

ALTER ROLE leadmagnet_reader NOLOGIN NOINHERIT;
ALTER ROLE leadmagnet_reader SET default_transaction_read_only = on;
ALTER ROLE leadmagnet_reader SET statement_timeout = '30s';

REVOKE ALL ON ALL TABLES IN SCHEMA leadbot FROM leadmagnet_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA leadbot FROM leadmagnet_reader;
GRANT USAGE ON SCHEMA leadbot TO leadmagnet_reader;
GRANT SELECT ON leadbot.delivered_leads_export TO leadmagnet_reader;

DO $$
BEGIN
    EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO leadmagnet_reader',
        current_database()
    );
END
$$;
