-- Store shootout scores separately from regular-time goals for UCFL Cup matches.
ALTER TABLE public.centuria_analytics_matches
  ADD COLUMN IF NOT EXISTS home_penalty_score integer,
  ADD COLUMN IF NOT EXISTS away_penalty_score integer;

ALTER TABLE public.centuria_analytics_matches
  DROP CONSTRAINT IF EXISTS centuria_analytics_matches_home_penalty_score_check,
  DROP CONSTRAINT IF EXISTS centuria_analytics_matches_away_penalty_score_check;

ALTER TABLE public.centuria_analytics_matches
  ADD CONSTRAINT centuria_analytics_matches_home_penalty_score_check
    CHECK (home_penalty_score IS NULL OR home_penalty_score >= 0),
  ADD CONSTRAINT centuria_analytics_matches_away_penalty_score_check
    CHECK (away_penalty_score IS NULL OR away_penalty_score >= 0);
