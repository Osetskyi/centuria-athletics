-- Per-match EA FC statistics for the Centuria Analytics history.
-- Statistics are stored separately so the original fixture/results remain unchanged.

CREATE TABLE IF NOT EXISTS public.centuria_analytics_match_statistics (
  match_id uuid PRIMARY KEY
    REFERENCES public.centuria_analytics_matches(id) ON DELETE CASCADE,
  home_stats jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(home_stats) = 'object'),
  away_stats jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(away_stats) = 'object'),
  events jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(events) = 'array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.centuria_analytics_match_statistics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.centuria_analytics_match_statistics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.centuria_analytics_match_statistics TO authenticated;

DROP POLICY IF EXISTS centuria_analytics_match_statistics_read
  ON public.centuria_analytics_match_statistics;
CREATE POLICY centuria_analytics_match_statistics_read
  ON public.centuria_analytics_match_statistics
  FOR SELECT TO authenticated
  USING (public.has_site_access() OR public.is_admin());

DROP POLICY IF EXISTS centuria_analytics_match_statistics_admin_insert
  ON public.centuria_analytics_match_statistics;
CREATE POLICY centuria_analytics_match_statistics_admin_insert
  ON public.centuria_analytics_match_statistics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS centuria_analytics_match_statistics_admin_update
  ON public.centuria_analytics_match_statistics;
CREATE POLICY centuria_analytics_match_statistics_admin_update
  ON public.centuria_analytics_match_statistics
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.centuria_analytics_match_statistics IS
  'Per-match EA FC statistics shown from Centuria Analytics match history.';
COMMENT ON COLUMN public.centuria_analytics_match_statistics.home_stats IS
  'Home-side numeric match statistics keyed by the analytics UI field names.';
COMMENT ON COLUMN public.centuria_analytics_match_statistics.away_stats IS
  'Away-side numeric match statistics keyed by the analytics UI field names.';
COMMENT ON COLUMN public.centuria_analytics_match_statistics.events IS
  'Free-text match events, one display string per array element.';

-- Seed the Round 1 match shown in the supplied screenshot. Do not overwrite
-- statistics that an admin has already edited.
INSERT INTO public.centuria_analytics_match_statistics
  (match_id, home_stats, away_stats, events)
SELECT
  match.id,
  '{"dribble_success_pct":91,"shot_accuracy_pct":50,"pass_accuracy_pct":85,"possession_pct":54,"recovery_seconds":6,"shots":10,"expected_goals":3.69,"passes":193,"tackles":19,"successful_tackles":3,"interceptions":31,"saves":1,"fouls":0,"offsides":1,"corners":4,"free_kicks":0,"penalty_shots":0,"yellow_cards":0}'::jsonb,
  '{"dribble_success_pct":93,"shot_accuracy_pct":67,"pass_accuracy_pct":79,"possession_pct":46,"recovery_seconds":6,"shots":3,"expected_goals":0.82,"passes":181,"tackles":31,"successful_tackles":12,"interceptions":21,"saves":1,"fouls":0,"offsides":0,"corners":3,"free_kicks":1,"penalty_shots":0,"yellow_cards":0}'::jsonb,
  '[]'::jsonb
FROM public.centuria_analytics_matches AS match
WHERE match.match_date = DATE '2026-10-26'
  AND match.round_number = 1
  AND lower(btrim(match.home_team_name)) = 'illusion'
  AND lower(btrim(match.away_team_name)) = 'centuria athletics'
  AND match.home_score = 4
  AND match.away_score = 1
ON CONFLICT (match_id) DO NOTHING;
