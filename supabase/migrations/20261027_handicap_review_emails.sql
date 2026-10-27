-- Snapshot the completed review in its transaction. No emails are sent by SQL.
create table public.handicap_email_batches (
  id uuid primary key references public.league_handicap_reviews(id),
  season_id uuid not null references public.league_seasons(id),
  completed_at timestamptz not null,
  payload jsonb not null,
  prepared_at timestamptz
);
create table public.handicap_email_outbox (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.handicap_email_batches(id),
  kind text not null check (kind in ('player', 'captain')),
  subject_id uuid not null,
  player_id uuid not null references public.players(id),
  team_id uuid references public.league_teams(id),
  payload jsonb not null,
  expected_handicaps jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','skipped','attention')),
  first_attempt_at timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  recipient text,
  recipient_user_id uuid,
  error text,
  unique (batch_id, kind, subject_id, player_id)
);
alter table public.handicap_email_batches enable row level security;
alter table public.handicap_email_outbox enable row level security;
revoke all on public.handicap_email_batches, public.handicap_email_outbox from anon, authenticated;
grant all on public.handicap_email_batches, public.handicap_email_outbox to service_role;

create function public.snapshot_handicap_review_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare previous_time timestamptz; next_week integer; snapshot jsonb;
begin
  -- The review routine inserts its marker first and updates it after all changes.
  select max(completed_at) into previous_time from public.league_handicap_reviews
    where season_id = new.season_id and id <> new.id and completed_at < new.completed_at;
  next_week := case when new.week_no < 4 then new.week_no + 1 else new.week_no + 4 end;
  select jsonb_build_object(
    'id', new.id, 'seasonId', new.season_id, 'season', s.name,
    'week', new.week_no, 'completedAt', new.completed_at, 'previousAt', previous_time,
    'nextWeek', next_week,
    'nextDate', (select max(fixture_date) from public.league_fixtures where season_id = new.season_id and week_no = next_week),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', coalesce(p.display_name, p.full_name, 'Player'),
      'rating', p.rating_snooker, 'handicap', p.snooker_handicap
    )) from public.players p where exists(select 1 from public.league_team_members m where m.season_id=new.season_id and m.player_id=p.id)), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('playerId',m.player_id,'teamId',m.team_id,'captain',m.is_captain,'team',t.name))
      from public.league_team_members m join public.league_teams t on t.id=m.team_id where m.season_id=new.season_id), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('playerId',h.player_id,'before',h.previous_handicap,'after',h.new_handicap,'reason',h.reason))
      from public.league_handicap_history h where h.season_id=new.season_id and h.fixture_id=new.trigger_fixture_id
      and h.reason like 'Automatic Proposal 2 handicap review after Premier League fixture week ' || new.week_no || ' %'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'key', e.source_app || ':' || e.source_result_id || ':' || e.player_id,
      'playerId',e.player_id,'before',e.rating_before,'after',e.rating_after,'delta',e.rating_delta,
      'result',e.event_type,'recordedAt',e.created_at,'source',e.source_app,
      'type',coalesce(r.metadata->>'slot_type','Rated frame'),
      'opponent',coalesce((select string_agg(coalesce(op.display_name,op.full_name,'Player'), ' & ')
        from public.players op where op.id::text in (select jsonb_array_elements_text(
          case when coalesce(r.metadata->'side_a_ids','[]'::jsonb) ? e.player_id::text
          then coalesce(r.metadata->'side_b_ids','[]'::jsonb) else coalesce(r.metadata->'side_a_ids','[]'::jsonb) end))),
        (select coalesce(op.display_name,op.full_name) from public.players op where op.id=e.opponent_player_id),'Opponent unavailable'),
      'date',(select fixture_date from public.league_fixtures where id::text=r.metadata->>'fixture_id')
    ) order by e.created_at,e.id) from public.rating_events e
      left join public.rating_result_receipts r on r.source_app=e.source_app and r.source_result_id=e.source_result_id
      where exists(select 1 from public.league_team_members m where m.season_id=new.season_id and m.player_id=e.player_id)), '[]'::jsonb)
  ) into snapshot from public.league_seasons s where s.id=new.season_id;
  insert into public.handicap_email_batches(id,season_id,completed_at,payload) values(new.id,new.season_id,new.completed_at,snapshot) on conflict(id) do nothing;
  return new;
end $$;
create trigger snapshot_handicap_review_email after update on public.league_handicap_reviews
for each row execute function public.snapshot_handicap_review_email();
revoke all on function public.snapshot_handicap_review_email() from public,anon,authenticated;

-- A lease prevents overlapping workers; provider idempotency covers a crash after send.
-- After 23 hours an ambiguous attempt requires human reconciliation (provider keys expire).
create function public.claim_handicap_email() returns setof public.handicap_email_outbox
language plpgsql security definer set search_path=public as $$
begin
  update public.handicap_email_outbox set status='attention',error='Delivery needs reconciliation before retrying: idempotency window expired.'
    where status in ('pending','sending') and first_attempt_at < now()-interval '23 hours';
  return query update public.handicap_email_outbox o set status='sending',attempted_at=now(),first_attempt_at=coalesce(o.first_attempt_at,now())
    where o.id=(select q.id from public.handicap_email_outbox q
      where q.status='pending' or (q.status='sending' and q.attempted_at < now()-interval '5 minutes')
      order by q.id for update skip locked limit 1) returning o.*;
end $$;
revoke all on function public.claim_handicap_email() from public,anon,authenticated;
grant execute on function public.claim_handicap_email() to service_role;
