SET LOCAL lock_timeout = '2s';

CREATE TABLE public.internal_contact_registry (
  telegram_user_id bigint PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{1,64}$'),
  company text NOT NULL,
  position_title text NOT NULL,
  leadership boolean NOT NULL,
  manually_reviewed boolean NOT NULL,
  evidence_kind text NOT NULL,
  source_message_id bigint NOT NULL,
  source_observed_at timestamptz NOT NULL,
  excerpt text NOT NULL,
  profile_last_observed_at timestamptz NOT NULL,
  requires_refresh boolean NOT NULL,
  search_text text GENERATED ALWAYS AS (username || ' ' || company || ' ' || position_title) STORED
);

CREATE TABLE public.internal_contact_registry_status (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_checked_at timestamptz,
  processed_messages bigint NOT NULL DEFAULT 0
);

CREATE TABLE contacts_final_v1.live_inbox (
  message_id bigint PRIMARY KEY
);

CREATE TABLE contacts_final_v1.live_profiles (
  telegram_user_id bigint PRIMARY KEY,
  message_id bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  username text,
  has_bio boolean NOT NULL
);

CREATE TABLE contacts_final_v1.live_handles (LIKE contacts_final_v1.handles INCLUDING ALL);
CREATE TABLE contacts_final_v1.live_evidence (LIKE contacts_final_v1.affiliation_evidence INCLUDING ALL);

ALTER TABLE public.internal_contact_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_contact_registry_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_final_v1.live_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_final_v1.live_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_final_v1.live_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_final_v1.live_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.internal_contact_registry, public.internal_contact_registry_status,
  contacts_final_v1.live_inbox, contacts_final_v1.live_profiles,
  contacts_final_v1.live_handles, contacts_final_v1.live_evidence
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.internal_contact_registry, public.internal_contact_registry_status TO service_role;

INSERT INTO public.internal_contact_registry_status DEFAULT VALUES;

CREATE FUNCTION contacts_final_v1.live_affiliations(p_body text, p_kind text)
RETURNS TABLE (company text, company_key text, position_title text, leadership boolean, excerpt text)
LANGUAGE sql STABLE STRICT SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  WITH input AS (
    SELECT p_body AS body
    UNION ALL
    SELECT segment
    FROM regexp_split_to_table(p_body, ',[[:space:]]+') WITH ORDINALITY AS s(segment, n)
    WHERE p_kind = 'bio' AND n > 1
      AND segment ~* '^(?:со[- ]?основател|основател|учредител|соучредител|владел|founder|co-founder|CEO|СЕО|директор)'
  )
  SELECT DISTINCT e.company,e.company_key,e.position_title,e.leadership,e.excerpt
  FROM input i CROSS JOIN LATERAL contacts_final_v1.detect_affiliations(i.body,p_kind) e
  WHERE e.strength = 3
    AND strpos(contacts_rebuild_v1.safe_review_excerpt(p_body),e.excerpt) > 0
    AND p_body !~* '(?:^|[|,;])[[:space:]]*(?:ищу работу|ищем|вакансия|резюме|пример визитки|шаблон)'
    AND e.company !~* '^(?:ООО |АО |ПАО |ИП )?(?:компани[яию]|студи[яию]|проект|онлайн[- ]школа|агентство|команда|бизнес)$'
$function$;

CREATE FUNCTION contacts_final_v1.refresh_internal_contact_registry()
RETURNS void
LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  WITH archive AS MATERIALIZED (
    SELECT * FROM contacts_final_v1.final_contacts
  ), live AS MATERIALIZED (
    SELECT p.*, a.latest_username AS archived_username,
      (a.telegram_user_id IS NULL OR (p.observed_at,p.message_id) > (a.last_observed_at,a.latest_message_id)) AS is_newer
    FROM contacts_final_v1.live_profiles p
    LEFT JOIN contacts_final_v1.authors a USING (telegram_user_id)
  ), eligible_evidence AS MATERIALIZED (
    SELECT e.* FROM contacts_final_v1.live_evidence e
    JOIN live p USING (telegram_user_id)
    WHERE (e.evidence_kind = 'message' OR (p.is_newer AND p.has_bio AND e.source_message_id = p.message_id))
      AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=e.source_message_id AND m.user_id=e.telegram_user_id)
  ), strong AS (
    SELECT telegram_user_id,min(company_key) AS company_key
    FROM eligible_evidence GROUP BY telegram_user_id HAVING count(DISTINCT company_key)=1
  ), fresh AS (
    SELECT DISTINCT ON (e.telegram_user_id) e.*
    FROM eligible_evidence e JOIN strong s USING (telegram_user_id,company_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM contacts_final_v1.affiliation_evidence a
      WHERE a.telegram_user_id=e.telegram_user_id AND a.company_key<>e.company_key
        AND a.strength>=2 AND a.evidence_kind<>'historical_bio'
    )
    ORDER BY e.telegram_user_id,e.source_observed_at DESC,e.source_message_id DESC,e.position_title,e.company
  ), combined AS (
    SELECT a.telegram_user_id,
      CASE WHEN p.is_newer THEN p.username ELSE a.username END AS username,
      a.company,a.position_title,a.leadership,a.manually_reviewed,
      a.evidence_kind,a.source_message_id,a.source_observed_at,a.excerpt,
      greatest(a.profile_last_observed_at,p.observed_at) AS profile_last_observed_at,
      (a.evidence_kind='historical_bio' OR a.freshness='needs_refresh' OR EXISTS (
        SELECT 1 FROM eligible_evidence e WHERE e.telegram_user_id=a.telegram_user_id
          AND e.company_key<>regexp_replace(lower(a.company),'[^[:alnum:]]+','','g')
          AND e.source_observed_at>a.source_observed_at
      )) AS requires_refresh
    FROM archive a LEFT JOIN live p USING (telegram_user_id)
    UNION ALL
    SELECT e.telegram_user_id,CASE WHEN p.is_newer THEN p.username ELSE p.archived_username END,
      e.company,e.position_title,e.leadership,false,e.evidence_kind,e.source_message_id,
      e.source_observed_at,e.excerpt,p.observed_at,false
    FROM fresh e JOIN live p USING (telegram_user_id)
    WHERE NOT EXISTS (SELECT 1 FROM archive a WHERE a.telegram_user_id=e.telegram_user_id)
  ), visible AS MATERIALIZED (
    SELECT c.* FROM combined c
    WHERE c.username ~ '^[a-z0-9_]{1,64}$' AND c.username !~ '(bot|бот)$|_bot_'
      AND NOT EXISTS (
        SELECT 1 FROM contacts_final_v1.handles h WHERE h.username=c.username AND h.telegram_user_id<>c.telegram_user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM contacts_final_v1.live_handles h WHERE h.username=c.username AND h.telegram_user_id<>c.telegram_user_id
      )
  ), removed AS (
    DELETE FROM public.internal_contact_registry r
    WHERE NOT EXISTS (SELECT 1 FROM visible v WHERE v.telegram_user_id=r.telegram_user_id)
  )
  INSERT INTO public.internal_contact_registry AS r (
    telegram_user_id,username,company,position_title,leadership,manually_reviewed,evidence_kind,source_message_id,
    source_observed_at,excerpt,profile_last_observed_at,requires_refresh
  )
  SELECT * FROM visible
  ON CONFLICT (telegram_user_id) DO UPDATE SET
    username=excluded.username,company=excluded.company,position_title=excluded.position_title,
    leadership=excluded.leadership,manually_reviewed=excluded.manually_reviewed,
    evidence_kind=excluded.evidence_kind,source_message_id=excluded.source_message_id,
    source_observed_at=excluded.source_observed_at,excerpt=excluded.excerpt,
    profile_last_observed_at=excluded.profile_last_observed_at,requires_refresh=excluded.requires_refresh
  WHERE (r.username,r.company,r.position_title,r.leadership,r.manually_reviewed,r.evidence_kind,
    r.source_message_id,r.source_observed_at,r.excerpt,r.profile_last_observed_at,r.requires_refresh)
    IS DISTINCT FROM (excluded.username,excluded.company,excluded.position_title,excluded.leadership,
    excluded.manually_reviewed,excluded.evidence_kind,excluded.source_message_id,excluded.source_observed_at,
    excluded.excerpt,excluded.profile_last_observed_at,excluded.requires_refresh);
$function$;

CREATE FUNCTION contacts_final_v1.advance_live_contacts(p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_ids bigint[];
  v_size integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3000 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 3000';
  END IF;
  IF NOT pg_try_advisory_xact_lock(3469771205) THEN RETURN 0; END IF;

  SELECT array_agg(message_id) INTO v_ids
  FROM (SELECT message_id FROM contacts_final_v1.live_inbox ORDER BY message_id LIMIT p_limit) batch;
  v_size := coalesce(cardinality(v_ids),0);

  IF v_size > 0 THEN
    WITH seen AS MATERIALIZED (
      SELECT id,user_id,coalesce(message_time,created_at) AS observed_at,
        CASE WHEN lower(btrim(username)) ~ '^[a-z0-9_]{1,64}$' THEN lower(btrim(username)) END AS username,
        nullif(btrim(bio),'') IS NOT NULL AS has_bio
      FROM public.messages WHERE id=ANY(v_ids) AND user_id>0 AND coalesce(message_time,created_at) IS NOT NULL
    ), newest AS (
      SELECT DISTINCT ON (user_id) * FROM seen ORDER BY user_id,observed_at DESC,id DESC
    ), saved_handles AS (
      INSERT INTO contacts_final_v1.live_handles AS h
      SELECT user_id,username,min(observed_at),max(observed_at) FROM seen
      WHERE username IS NOT NULL GROUP BY user_id,username
      ON CONFLICT (telegram_user_id,username) DO UPDATE SET
        first_observed_at=least(h.first_observed_at,excluded.first_observed_at),
        last_observed_at=greatest(h.last_observed_at,excluded.last_observed_at)
    )
    INSERT INTO contacts_final_v1.live_profiles AS p (telegram_user_id,message_id,observed_at,username,has_bio)
    SELECT user_id,id,observed_at,username,has_bio FROM newest
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      message_id=excluded.message_id,observed_at=excluded.observed_at,username=excluded.username,has_bio=excluded.has_bio
    WHERE (excluded.observed_at,excluded.message_id) > (p.observed_at,p.message_id);

    WITH source AS MATERIALIZED (
      SELECT id,user_id,coalesce(message_time,created_at) AS observed_at,bio,message
      FROM public.messages WHERE id=ANY(v_ids) AND user_id>0 AND coalesce(message_time,created_at) IS NOT NULL
    ), inputs AS (
      SELECT s.id,s.user_id,s.observed_at,s.bio AS body,'bio'::text AS kind FROM source s
      JOIN contacts_final_v1.live_profiles p ON p.telegram_user_id=s.user_id AND p.message_id=s.id AND p.has_bio
      UNION ALL
      SELECT s.id,s.user_id,s.observed_at,s.message,'message'::text FROM source s
      WHERE s.message ~* '\m(?:я|работаю|являюсь|меня зовут|i am|i.m)\M'
    ), hits AS (
      SELECT i.*,e.* FROM inputs i CROSS JOIN LATERAL contacts_final_v1.live_affiliations(i.body,i.kind) e
    ), best AS (
      SELECT DISTINCT ON (user_id,company_key,kind) * FROM hits
      ORDER BY user_id,company_key,kind,observed_at DESC,id DESC,position_title,company
    )
    INSERT INTO contacts_final_v1.live_evidence AS e (
      telegram_user_id,company_key,company,position_title,leadership,strength,evidence_kind,source_message_id,source_observed_at,excerpt
    )
    SELECT user_id,company_key,company,position_title,leadership,3,kind,id,observed_at,excerpt FROM best
    ON CONFLICT (telegram_user_id,company_key,evidence_kind) DO UPDATE SET
      company=excluded.company,position_title=excluded.position_title,leadership=excluded.leadership,
      source_message_id=excluded.source_message_id,source_observed_at=excluded.source_observed_at,excerpt=excluded.excerpt
    WHERE (excluded.source_observed_at,excluded.source_message_id) > (e.source_observed_at,e.source_message_id);

    PERFORM contacts_final_v1.refresh_internal_contact_registry();
    DELETE FROM contacts_final_v1.live_inbox WHERE message_id=ANY(v_ids);
  END IF;
  UPDATE public.internal_contact_registry_status
  SET last_checked_at=clock_timestamp(),processed_messages=processed_messages+v_size WHERE singleton;
  RETURN v_size;
END
$function$;

CREATE FUNCTION contacts_final_v1.capture_live_contact_messages()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  INSERT INTO contacts_final_v1.live_inbox (message_id)
  SELECT id FROM inserted_messages ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION contacts_final_v1.live_affiliations(text,text),
  contacts_final_v1.refresh_internal_contact_registry(), contacts_final_v1.advance_live_contacts(integer),
  contacts_final_v1.capture_live_contact_messages()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT contacts_final_v1.refresh_internal_contact_registry();

-- Take the insert lock only at the end; rows committed before the trigger are caught by the index scan.
CREATE TRIGGER capture_live_contact_messages
AFTER INSERT ON public.messages REFERENCING NEW TABLE AS inserted_messages
FOR EACH STATEMENT EXECUTE FUNCTION contacts_final_v1.capture_live_contact_messages();

INSERT INTO contacts_final_v1.live_inbox (message_id)
SELECT m.id FROM contacts_final_v1.progress p JOIN public.messages m ON m.id > p.cutoff_message_id
WHERE p.singleton AND p.finished_at IS NOT NULL
ON CONFLICT DO NOTHING;
