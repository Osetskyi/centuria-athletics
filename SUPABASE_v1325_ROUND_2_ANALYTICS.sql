-- Centuria Analytics v13.25 — add Round 2 results
-- Keep Centuria fixtures in calendar_matches; keep UCFL round results in the
-- analytics-only table. Safe to rerun.

ALTER TABLE public.calendar_matches
  ADD COLUMN IF NOT EXISTS round_number smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.calendar_matches'::regclass
      AND conname = 'calendar_matches_round_number_check'
  ) THEN
    ALTER TABLE public.calendar_matches
      ADD CONSTRAINT calendar_matches_round_number_check
      CHECK (round_number IS NULL OR round_number BETWEEN 1 AND 100);
  END IF;
END $$;

ALTER TABLE public.calendar_matches
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'scheduled';

UPDATE public.calendar_matches
SET match_status = 'played'
WHERE match_status = 'scheduled'
  AND home_score IS NOT NULL
  AND away_score IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.calendar_matches'::regclass
      AND conname = 'calendar_matches_match_status_check'
  ) THEN
    ALTER TABLE public.calendar_matches
      ADD CONSTRAINT calendar_matches_match_status_check
      CHECK (match_status = ANY (ARRAY['scheduled'::text, 'played'::text, 'postponed'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.calendar_matches.round_number IS
  'Competition round number, assigned from confirmed match-round data.';
COMMENT ON COLUMN public.calendar_matches.match_status IS
  'Calendar match state: scheduled, played, or postponed.';

CREATE TABLE IF NOT EXISTS public.centuria_analytics_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_date date NOT NULL,
  match_time time without time zone,
  competition_name text NOT NULL,
  home_team_name text NOT NULL,
  home_team_image text,
  away_team_name text NOT NULL,
  away_team_image text,
  home_score integer,
  away_score integer,
  match_kind text NOT NULL DEFAULT 'league',
  round_number smallint,
  match_status text NOT NULL DEFAULT 'scheduled',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT centuria_analytics_matches_round_number_check
    CHECK (round_number IS NULL OR round_number BETWEEN 1 AND 100),
  CONSTRAINT centuria_analytics_matches_status_check
    CHECK (match_status = ANY (ARRAY['scheduled'::text, 'played'::text, 'postponed'::text]))
);

CREATE INDEX IF NOT EXISTS centuria_analytics_matches_comp_round_date_idx
  ON public.centuria_analytics_matches (competition_name, round_number, match_date, match_time);

ALTER TABLE public.centuria_analytics_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.centuria_analytics_matches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.centuria_analytics_matches TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'centuria_analytics_matches'
      AND policyname = 'centuria_analytics_matches_read'
  ) THEN
    CREATE POLICY centuria_analytics_matches_read
      ON public.centuria_analytics_matches
      FOR SELECT TO authenticated
      USING (has_site_access() OR is_admin());
  END IF;
END $$;

COMMENT ON TABLE public.centuria_analytics_matches IS
  'UCFL match results and postponed fixtures shown only in Centuria Analytics.';

-- Move all available UCFL results from the calendar into analytics. The same
-- UUID keeps reruns idempotent and lets the analytics copy retain club crests.
INSERT INTO public.centuria_analytics_matches (
  id, match_date, match_time, competition_name,
  home_team_name, home_team_image, away_team_name, away_team_image,
  home_score, away_score, match_kind, round_number, match_status, created_at
)
SELECT
  id, match_date, match_time, competition_name,
  home_team_name, home_team_image, away_team_name, away_team_image,
  home_score, away_score, match_kind, round_number, match_status, created_at
FROM public.calendar_matches
WHERE competition_name = 'UCFL'
  AND ((home_score IS NOT NULL AND away_score IS NOT NULL) OR match_status = 'postponed')
ON CONFLICT (id) DO UPDATE SET
  match_date = EXCLUDED.match_date,
  match_time = EXCLUDED.match_time,
  competition_name = EXCLUDED.competition_name,
  home_team_name = EXCLUDED.home_team_name,
  home_team_image = EXCLUDED.home_team_image,
  away_team_name = EXCLUDED.away_team_name,
  away_team_image = EXCLUDED.away_team_image,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score,
  match_kind = EXCLUDED.match_kind,
  round_number = EXCLUDED.round_number,
  match_status = EXCLUDED.match_status;

-- The screenshot fixture is postponed and belongs to Round 1, not the calendar.
INSERT INTO public.centuria_analytics_matches (
  match_date, match_time, competition_name,
  home_team_name, home_team_image, away_team_name, away_team_image,
  match_kind, round_number, match_status
)
SELECT
  DATE '2026-10-27', TIME '22:30', 'UCFL',
  home.name, home.logo, away.name, away.logo,
  'league', 1, 'postponed'
FROM public.arena_clubs AS home
CROSS JOIN public.arena_clubs AS away
WHERE home.normalized_name = 'brothers'
  AND away.normalized_name = 'arsenal kyiv'
  AND NOT EXISTS (
    SELECT 1 FROM public.centuria_analytics_matches existing
    WHERE existing.competition_name = 'UCFL'
      AND existing.round_number = 1
      AND lower(btrim(existing.home_team_name)) = 'brothers'
      AND lower(btrim(existing.away_team_name)) = 'arsenal kyiv'
  );

-- Remove only non-Centuria UCFL fixtures from the calendar after copying their
-- played/postponed results above. Other competition calendars are untouched.
DELETE FROM public.calendar_matches
WHERE competition_name = 'UCFL'
  AND lower(btrim(home_team_name)) <> 'centuria athletics'
  AND lower(btrim(away_team_name)) <> 'centuria athletics';


-- Round 2 screenshot import. Dates are 27 October 2026; the screenshot has no
-- kickoff times, so those remain null. The Centuria–KRYVBASS result already
-- present in the Centuria calendar is assigned to Round 2 without duplication.
UPDATE public.centuria_analytics_matches
SET round_number = 2,
    match_date = DATE '2026-10-27',
    match_status = 'played'
WHERE competition_name = 'UCFL'
  AND lower(btrim(home_team_name)) = 'centuria athletics'
  AND lower(btrim(away_team_name)) = 'vfc kryvbass'
  AND home_score = 1
  AND away_score = 1;

WITH fixtures(home_key, away_key, home_score, away_score) AS (
  VALUES
    ('vfc crystall', 'cfc dnipro', 2, 1),
    ('centuria athletics', 'vfc kryvbass', 1, 1),
    ('red ruta', 'vfc ukraine', 2, 1),
    ('illusion', 'horse strife', 3, 0),
    ('fallen angels', 'arsenal kyiv', 1, 2),
    ('cfc d1rty', 'brothers', 0, 1),
    ('sc aurum', 'scythe esports', 0, 0)
)
INSERT INTO public.centuria_analytics_matches (
  match_date, match_time, competition_name,
  home_team_name, home_team_image, away_team_name, away_team_image,
  home_score, away_score, match_kind, round_number, match_status
)
SELECT
  DATE '2026-10-27', NULL, 'UCFL',
  home.name, home.logo, away.name, away.logo,
  fixtures.home_score, fixtures.away_score, 'league', 2, 'played'
FROM fixtures
JOIN public.arena_clubs AS home ON home.normalized_name = fixtures.home_key
JOIN public.arena_clubs AS away ON away.normalized_name = fixtures.away_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.centuria_analytics_matches AS existing
  WHERE existing.competition_name = 'UCFL'
    AND existing.round_number = 2
    AND lower(btrim(existing.home_team_name)) = fixtures.home_key
    AND lower(btrim(existing.away_team_name)) = fixtures.away_key
);
