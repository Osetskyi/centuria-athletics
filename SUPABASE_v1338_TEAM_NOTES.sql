-- Centuria Analytics v13.38: team notes opened from club emblems.
-- Approved site users may read notes; only admins and editors may write.

create table if not exists public.centuria_analytics_team_notes (
  team_key text primary key check (char_length(team_key) between 1 and 180),
  team_name text not null check (char_length(team_name) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id)
);

alter table public.centuria_analytics_team_notes enable row level security;

revoke all on table public.centuria_analytics_team_notes from public, anon, authenticated;
grant select, insert, update on table public.centuria_analytics_team_notes to authenticated;

drop policy if exists "Approved users can read analytics team notes" on public.centuria_analytics_team_notes;
create policy "Approved users can read analytics team notes"
  on public.centuria_analytics_team_notes
  for select
  to authenticated
  using (public.has_site_access());

drop policy if exists "Editors can add analytics team notes" on public.centuria_analytics_team_notes;
create policy "Editors can add analytics team notes"
  on public.centuria_analytics_team_notes
  for insert
  to authenticated
  with check (public.can_edit() and updated_by = (select auth.uid()));

drop policy if exists "Editors can update analytics team notes" on public.centuria_analytics_team_notes;
create policy "Editors can update analytics team notes"
  on public.centuria_analytics_team_notes
  for update
  to authenticated
  using (public.can_edit())
  with check (public.can_edit() and updated_by = (select auth.uid()));
