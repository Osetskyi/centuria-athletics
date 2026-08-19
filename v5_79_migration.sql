alter table public.training_player_stats
add column if not exists matches_played integer;

update public.training_player_stats t
set matches_played = d.matches_played
from public.training_days d
where t.training_day_id = d.id
  and t.matches_played is null;

alter table public.training_player_stats
add constraint training_player_stats_matches_played_nonnegative
check (matches_played is null or matches_played >= 0) not valid;
