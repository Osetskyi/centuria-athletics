-- Only admins can create, edit, or delete Analytics Center records.
-- Authenticated site members retain read access; anonymous access is removed.

ALTER TABLE public.centuria_analytics_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centuria_analytics_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centuria_analytics_match_statistics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.centuria_analytics_leagues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.centuria_analytics_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.centuria_analytics_match_statistics FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.centuria_analytics_leagues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.centuria_analytics_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.centuria_analytics_match_statistics TO authenticated;

DROP POLICY IF EXISTS centuria_analytics_leagues_read ON public.centuria_analytics_leagues;
DROP POLICY IF EXISTS centuria_analytics_leagues_admin_insert ON public.centuria_analytics_leagues;
DROP POLICY IF EXISTS centuria_analytics_leagues_admin_update ON public.centuria_analytics_leagues;
DROP POLICY IF EXISTS centuria_analytics_leagues_admin_delete ON public.centuria_analytics_leagues;

CREATE POLICY centuria_analytics_leagues_read
  ON public.centuria_analytics_leagues
  FOR SELECT TO authenticated
  USING (public.has_site_access() OR public.is_admin());
CREATE POLICY centuria_analytics_leagues_admin_insert
  ON public.centuria_analytics_leagues
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND created_by = auth.uid());
CREATE POLICY centuria_analytics_leagues_admin_update
  ON public.centuria_analytics_leagues
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_leagues_admin_delete
  ON public.centuria_analytics_leagues
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS centuria_analytics_matches_read ON public.centuria_analytics_matches;
DROP POLICY IF EXISTS centuria_analytics_matches_admin_insert ON public.centuria_analytics_matches;
DROP POLICY IF EXISTS centuria_analytics_matches_admin_update ON public.centuria_analytics_matches;
DROP POLICY IF EXISTS centuria_analytics_matches_admin_delete ON public.centuria_analytics_matches;

CREATE POLICY centuria_analytics_matches_read
  ON public.centuria_analytics_matches
  FOR SELECT TO authenticated
  USING (public.has_site_access() OR public.is_admin());
CREATE POLICY centuria_analytics_matches_admin_insert
  ON public.centuria_analytics_matches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_matches_admin_update
  ON public.centuria_analytics_matches
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_matches_admin_delete
  ON public.centuria_analytics_matches
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS centuria_analytics_match_statistics_read
  ON public.centuria_analytics_match_statistics;
DROP POLICY IF EXISTS centuria_analytics_match_statistics_admin_insert
  ON public.centuria_analytics_match_statistics;
DROP POLICY IF EXISTS centuria_analytics_match_statistics_admin_update
  ON public.centuria_analytics_match_statistics;
DROP POLICY IF EXISTS centuria_analytics_match_statistics_admin_delete
  ON public.centuria_analytics_match_statistics;

CREATE POLICY centuria_analytics_match_statistics_read
  ON public.centuria_analytics_match_statistics
  FOR SELECT TO authenticated
  USING (public.has_site_access() OR public.is_admin());
CREATE POLICY centuria_analytics_match_statistics_admin_insert
  ON public.centuria_analytics_match_statistics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_match_statistics_admin_update
  ON public.centuria_analytics_match_statistics
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY centuria_analytics_match_statistics_admin_delete
  ON public.centuria_analytics_match_statistics
  FOR DELETE TO authenticated
  USING (public.is_admin());
