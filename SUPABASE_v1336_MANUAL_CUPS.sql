-- Manual cup tracking for real-world Centuria matches.
-- No player signup, poll, or Arena tournament state is used.

CREATE TABLE IF NOT EXISTS public.centuria_analytics_cups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  CONSTRAINT centuria_analytics_cups_teams_array_check
    CHECK (jsonb_typeof(teams) = 'array' AND jsonb_array_length(teams) >= 2)
);

ALTER TABLE public.centuria_analytics_cups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.centuria_analytics_cups FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.centuria_analytics_cups TO authenticated;

DROP POLICY IF EXISTS centuria_analytics_cups_read ON public.centuria_analytics_cups;
DROP POLICY IF EXISTS centuria_analytics_cups_admin_insert ON public.centuria_analytics_cups;
DROP POLICY IF EXISTS centuria_analytics_cups_admin_update ON public.centuria_analytics_cups;
DROP POLICY IF EXISTS centuria_analytics_cups_admin_delete ON public.centuria_analytics_cups;

CREATE POLICY centuria_analytics_cups_read
  ON public.centuria_analytics_cups
  FOR SELECT TO authenticated
  USING (public.has_site_access() OR public.is_admin());
CREATE POLICY centuria_analytics_cups_admin_insert
  ON public.centuria_analytics_cups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND created_by = auth.uid());
CREATE POLICY centuria_analytics_cups_admin_update
  ON public.centuria_analytics_cups
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_cups_admin_delete
  ON public.centuria_analytics_cups
  FOR DELETE TO authenticated
  USING (public.is_admin());

ALTER TABLE public.centuria_analytics_matches
  ADD COLUMN IF NOT EXISTS cup_id uuid REFERENCES public.centuria_analytics_cups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS centuria_analytics_matches_cup_round_idx
  ON public.centuria_analytics_matches (cup_id, round_number, match_date)
  WHERE cup_id IS NOT NULL;

COMMENT ON TABLE public.centuria_analytics_cups IS
  'Analytics-only real-world cup records with club selections; no Arena signup or poll.';
COMMENT ON COLUMN public.centuria_analytics_matches.cup_id IS
  'Optional analytics cup owner for manually entered cup fixtures and results.';
