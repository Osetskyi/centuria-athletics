-- Centuria Arena v12.90: participant requested match rescheduling.

create or replace function public.centuria_arena_reschedule_action_v1290(
  p_action text,
  p_competition_id text,
  p_match_id text,
  p_target_round integer default null
)
returns public.arena_global_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_player text;
  isadmin boolean;
  playerok boolean;
  rowstate public.arena_global_state;
  comp jsonb;
  rounds jsonb;
  rnd jsonb;
  m jsonb;
  prop jsonb;
  mp text[];
  ri integer;
  mi integer;
  kind text;
  cid text;
  effective_round integer;
  original_round integer;
  max_round integer;
  participant_count integer;
  match_finished boolean;
begin
  if uid is null then raise exception 'Увійди в акаунт'; end if;

  select p.role, pl.name
    into v_role, v_player
  from public.profiles p
  left join public.players pl on pl.id = p.player_id
  where p.user_id = uid
    and (p.access_status = 'approved' or p.role = 'admin')
  limit 1;

  if not found then raise exception 'Акаунт не підтверджено'; end if;
  isadmin := v_role = 'admin';

  if p_action not in ('propose','confirm','reject') then
    raise exception 'Невідома дія перенесення';
  end if;

  select * into rowstate
  from public.arena_global_state
  where state_key = 'global'
  for update;

  if not found then raise exception 'Стан Арени не знайдено'; end if;

  comp := rowstate.active_competition;
  kind := comp->>'kind';
  cid := comp->>'id';

  if kind not in ('cup','league') or cid is distinct from p_competition_id then
    raise exception 'Турнір змінився. Онови сторінку';
  end if;

  rounds := coalesce(comp->'rounds','[]'::jsonb);
  m := null;

  for ri in select generate_series(0,jsonb_array_length(rounds)-1) loop
    rnd := rounds->ri;
    for mi in select generate_series(0,jsonb_array_length(coalesce(rnd->'matches','[]'::jsonb))-1) loop
      if rnd->'matches'->mi->>'id' = p_match_id then
        m := rnd->'matches'->mi;
        mp := array['rounds',ri::text,'matches',mi::text];
        exit;
      end if;
    end loop;
    exit when m is not null;
  end loop;

  if m is null then raise exception 'Матч не знайдено. Онови сторінку'; end if;

  playerok := v_player is not null and (
    lower(trim(v_player)) = lower(trim(m->>'home')) or
    lower(trim(v_player)) = lower(trim(m->>'away'))
  );

  if not (isadmin or playerok) then
    raise exception 'Перенести можна лише свій матч';
  end if;

  match_finished := case
    when kind = 'cup' and coalesce(comp->>'matchLegs','1') = '2'
      then m->>'homeScore' is not null and m->>'awayScore' is not null
       and m->>'leg2HomeScore' is not null and m->>'leg2AwayScore' is not null
    else m->>'homeScore' is not null and m->>'awayScore' is not null
  end;

  if match_finished then raise exception 'Завершений матч переносити не можна'; end if;

  original_round := coalesce((m->>'originalRound')::integer,(m->>'round')::integer,1);
  effective_round := coalesce((m->>'scheduledRound')::integer,(m->>'round')::integer,1);
  prop := m->'rescheduleProposal';

  if p_action = 'propose' then
    if prop is not null and jsonb_typeof(prop) = 'object' and prop->>'status' = 'pending' then
      raise exception 'Перенесення вже очікує підтвердження';
    end if;

    if kind = 'league' then
      if comp->>'leagueFormat' = 'swiss' then
        max_round := greatest(jsonb_array_length(rounds),coalesce((comp->>'swissRounds')::integer,1));
      else
        select max((x.value->>'round')::integer) into max_round
        from jsonb_array_elements(rounds) x(value)
        where coalesce(x.value->>'playoff','') = '';
      end if;
    else
      participant_count := greatest(2,jsonb_array_length(coalesce(comp->'participants','[]'::jsonb)));
      max_round := 0;
      while participant_count > 1 loop
        participant_count := (participant_count + 1) / 2;
        max_round := max_round + 1;
      end loop;
      max_round := greatest(max_round,effective_round);
    end if;

    if p_target_round is null or p_target_round < 1 or p_target_round = effective_round or p_target_round > coalesce(max_round,effective_round) then
      raise exception 'Обери інший доступний тур';
    end if;

    if isadmin then
      m := (m-'rescheduleProposal'-'rescheduleRejectedAt') || jsonb_build_object(
        'originalRound',original_round,
        'scheduledRound',p_target_round,
        'rescheduleStatus','confirmed',
        'rescheduledAt',clock_timestamp(),
        'rescheduledBy',uid::text
      );
    else
      m := (m-'rescheduleStatus'-'rescheduleRejectedAt') || jsonb_build_object(
        'rescheduleProposal',jsonb_build_object(
          'status','pending',
          'targetRound',p_target_round,
          'proposedBy',uid::text,
          'proposedByName',coalesce(v_player,'ADMIN'),
          'createdAt',clock_timestamp()
        )
      );
    end if;
  else
    if prop is null or jsonb_typeof(prop) <> 'object' or prop->>'status' <> 'pending' then
      raise exception 'Немає перенесення на підтвердженні';
    end if;

    if not (isadmin or (playerok and prop->>'proposedBy' <> uid::text)) then
      raise exception 'Підтвердити може суперник або ADMIN';
    end if;

    if p_action = 'reject' then
      m := (m-'rescheduleProposal') || jsonb_build_object(
        'rescheduleStatus','rejected',
        'rescheduleRejectedAt',clock_timestamp()
      );
    else
      p_target_round := (prop->>'targetRound')::integer;
      m := (m-'rescheduleProposal'-'rescheduleRejectedAt') || jsonb_build_object(
        'originalRound',original_round,
        'scheduledRound',p_target_round,
        'rescheduleStatus','confirmed',
        'rescheduledAt',clock_timestamp(),
        'rescheduledBy',uid::text
      );
    end if;
  end if;

  comp := jsonb_set(comp,mp,m,true);

  update public.arena_global_state
  set active_competition = comp,
      updated_by = uid,
      updated_at = now()
  where state_key = 'global'
  returning * into rowstate;

  return rowstate;
end;
$$;

revoke all on function public.centuria_arena_reschedule_action_v1290(text,text,text,integer) from public, anon;
grant execute on function public.centuria_arena_reschedule_action_v1290(text,text,text,integer) to authenticated;

create or replace function public.centuria_arena_match_action_v1290(
  p_action text,
  p_competition_id text,
  p_match_id text,
  p_leg integer default 1,
  p_home_score integer default null,
  p_away_score integer default null,
  p_tiebreak_winner text default null
)
returns public.arena_global_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_state public.arena_global_state;
  comp jsonb;
  rounds jsonb;
  rnd jsonb;
  m jsonb;
  mp text[];
  ri integer;
  mi integer;
  match_finished boolean;
begin
  result_state := public.centuria_arena_match_action_v1246(
    p_action,p_competition_id,p_match_id,p_leg,p_home_score,p_away_score,p_tiebreak_winner
  );

  if p_action not in ('confirm','admin_set') then return result_state; end if;

  comp := result_state.active_competition;
  rounds := coalesce(comp->'rounds','[]'::jsonb);
  m := null;

  for ri in select generate_series(0,jsonb_array_length(rounds)-1) loop
    rnd := rounds->ri;
    for mi in select generate_series(0,jsonb_array_length(coalesce(rnd->'matches','[]'::jsonb))-1) loop
      if rnd->'matches'->mi->>'id' = p_match_id then
        m := rnd->'matches'->mi;
        mp := array['rounds',ri::text,'matches',mi::text];
        exit;
      end if;
    end loop;
    exit when m is not null;
  end loop;

  match_finished := case
    when comp->>'kind' = 'cup' and coalesce(comp->>'matchLegs','1') = '2'
      then m->>'homeScore' is not null and m->>'awayScore' is not null
       and m->>'leg2HomeScore' is not null and m->>'leg2AwayScore' is not null
    else m->>'homeScore' is not null and m->>'awayScore' is not null
  end;

  if m is not null and match_finished and m ? 'rescheduleProposal' then
    m := (m-'rescheduleProposal'-'rescheduleRejectedAt') || jsonb_build_object(
      'rescheduleStatus','cancelled_by_result'
    );
    comp := jsonb_set(comp,mp,m,true);
    update public.arena_global_state
    set active_competition = comp,
        updated_by = auth.uid(),
        updated_at = now()
    where state_key = 'global'
    returning * into result_state;
  end if;

  return result_state;
end;
$$;

revoke all on function public.centuria_arena_match_action_v1290(text,text,text,integer,integer,integer,text) from public, anon;
grant execute on function public.centuria_arena_match_action_v1290(text,text,text,integer,integer,integer,text) to authenticated;
