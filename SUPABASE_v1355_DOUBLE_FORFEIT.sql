alter table public.centuria_analytics_matches drop constraint if exists centuria_analytics_matches_status_check;
alter table public.centuria_analytics_matches add constraint centuria_analytics_matches_status_check check (match_status = any (array['scheduled'::text, 'played'::text, 'postponed'::text, 'double_forfeit'::text]));
