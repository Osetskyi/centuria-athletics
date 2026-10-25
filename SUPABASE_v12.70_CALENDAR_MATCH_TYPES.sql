-- v12.69: persistent image marks for shared club leagues.
alter table public.arena_club_leagues
  add column if not exists image_url text;
comment on column public.arena_club_leagues.image_url is
  'Public image URL for the league mark shown in the club database and calendar.';

-- v12.70: distinguish cup and league calendar matches. Existing matches remain leagues.
alter table public.calendar_matches
  add column if not exists match_kind text not null default 'league';
alter table public.calendar_matches
  drop constraint if exists calendar_matches_match_kind_check;
alter table public.calendar_matches
  add constraint calendar_matches_match_kind_check
  check (match_kind in ('league','cup'));
