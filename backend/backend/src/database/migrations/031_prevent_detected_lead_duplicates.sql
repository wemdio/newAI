-- Remove exact duplicate detected leads caused by overlapping scanner cycles.
-- Keep a single row per (user_id, message_id), preferring rows that were
-- already posted/contacted so we preserve the most useful state.

WITH ranked AS (
  SELECT
    id,
    user_id,
    message_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, message_id
      ORDER BY
        posted_to_telegram DESC,
        is_contacted DESC,
        CASE WHEN notes IS NOT NULL AND BTRIM(notes) <> '' THEN 1 ELSE 0 END DESC,
        detected_at ASC,
        id ASC
    ) AS rn,
    BOOL_OR(posted_to_telegram) OVER (PARTITION BY user_id, message_id) AS any_posted,
    BOOL_OR(is_contacted) OVER (PARTITION BY user_id, message_id) AS any_contacted
  FROM detected_leads
),
keepers AS (
  SELECT id, any_posted, any_contacted
  FROM ranked
  WHERE rn = 1
)
UPDATE detected_leads dl
SET
  posted_to_telegram = k.any_posted,
  is_contacted = k.any_contacted
FROM keepers k
WHERE dl.id = k.id
  AND (
    dl.posted_to_telegram IS DISTINCT FROM k.any_posted
    OR dl.is_contacted IS DISTINCT FROM k.any_contacted
  );

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, message_id
      ORDER BY
        posted_to_telegram DESC,
        is_contacted DESC,
        CASE WHEN notes IS NOT NULL AND BTRIM(notes) <> '' THEN 1 ELSE 0 END DESC,
        detected_at ASC,
        id ASC
    ) AS rn
  FROM detected_leads
)
DELETE FROM detected_leads dl
USING ranked r
WHERE dl.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'detected_leads_user_message_unique'
  ) THEN
    ALTER TABLE detected_leads
      ADD CONSTRAINT detected_leads_user_message_unique UNIQUE (user_id, message_id);
  END IF;
END $$;
