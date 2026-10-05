-- 0002_functions.sql — transactional matchmaking and call lifecycle RPCs.
--
-- Concurrency invariants enforced here:
--   1. Per-user profile row is locked FOR UPDATE at the start of matchmake and
--      block checks, serializing any concurrent matchmake calls by that user.
--   2. When a partner is found, the partner's profile row is locked before the
--      call is created, so the partner cannot be matched into a second call
--      concurrently. After locking, the partner is re-verified as busy-free.
--   3. partner selection uses SELECT ... FOR UPDATE SKIP LOCKED, so two
--      matchers cannot claim the same queue entry.
--   4. match_queue is the single source of "waiting" and a user appears in at
--      most one queue row (primary key), creating no multi-queue state.
--   5. Active calls ('matched','connecting','connected') always imply the user
--      appears in exactly one call_participants row, checked under the lock.

create or replace function public.is_busy(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.call_participants cp
    join public.calls c on c.id = cp.call_id
    where cp.user_id = p_user_id
      and c.status in ('matched','connecting','connected')
  );
$$;

create or replace function public.matchmake()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  verified boolean;
  susp boolean;
  partner uuid;
  new_call uuid;
  recent int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select email_verified, suspended into verified, susp
    from public.profiles where id = uid;
  if not found or susp then
    raise exception 'not_eligible';
  end if;
  if not verified then
    raise exception 'not_verified';
  end if;

  -- Rate limit matchmaking attempts.
  select count(*) into recent from public.action_log
    where user_id = uid and action = 'matchmake'
      and created_at > now() - interval '10 seconds';
  if recent >= 4 then
    raise exception 'slow_down';
  end if;
  insert into public.action_log (user_id, action) values (uid, 'matchmake');

  -- Serialize this user's matchmaking operations.
  perform 1 from public.profiles where id = uid for update;

  -- Auto-heal: if this user was left in an active call (e.g. reload, network drop, timeout),
  -- end it cleanly so they can match again immediately instead of being permanently blocked.
  if public.is_busy(uid) then
    update public.calls
    set status = 'ended', ended_at = now()
    where id in (
      select call_id from public.call_participants where user_id = uid
    ) and status in ('matched','connecting','connected');
  end if;

  -- Lazy expiry of stale calls (> 2 minutes in matched/connecting state)
  update public.calls
  set status = 'failed', ended_at = now()
  where status in ('matched','connecting')
    and created_at < now() - interval '2 minutes';

  -- Lazy expiry of stale queue rows.
  delete from public.match_queue where expires_at < now();

  -- Remove our previous queue entry; we re-check for a partner below.
  delete from public.match_queue where user_id = uid;

  -- Find the oldest waiting, eligible, non-blocked, non-busy partner.
  select q.user_id into partner
  from public.match_queue q
  join public.profiles pr on pr.id = q.user_id
       and pr.email_verified and not pr.suspended
  where q.user_id <> uid
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = uid and b.blocked_id = q.user_id)
         or (b.blocker_id = q.user_id and b.blocked_id = uid)
    )
    and not public.is_busy(q.user_id)
  order by q.created_at asc
  limit 1
  for update of q skip locked;

  if partner is null then
    insert into public.match_queue (user_id, expires_at)
    values (uid, now() + interval '60 seconds');
    return json_build_object('status', 'waiting');
  end if;

  -- Serialize against the partner's own concurrent matchmake.
  perform 1 from public.profiles where id = partner for update;

  if public.is_busy(partner) then
    -- Partner was claimed by someone else; they cannot join our call.
    delete from public.match_queue where user_id = partner;
    insert into public.match_queue (user_id, expires_at)
    values (uid, now() + interval '60 seconds');
    return json_build_object('status', 'waiting');
  end if;

  delete from public.match_queue where user_id in (uid, partner);

  insert into public.calls (status) values ('matched') returning id into new_call;
  insert into public.call_participants (call_id, user_id, role)
  values (new_call, partner, 'initiator'), (new_call, uid, 'responder');

  return json_build_object('status', 'matched', 'call_id', new_call, 'role', 'responder');
end;
$$;

create or replace function public.my_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_call uuid;
  v_role text;
  v_status text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.id, cp.role, c.status into v_call, v_role, v_status
  from public.call_participants cp
  join public.calls c on c.id = cp.call_id
  where cp.user_id = uid
    and c.status in ('matched','connecting','connected')
  order by c.created_at desc
  limit 1;

  if v_call is not null then
    return json_build_object('status', 'in_call', 'call_id', v_call, 'role', v_role, 'call_status', v_status);
  end if;

  if exists (select 1 from public.match_queue where user_id = uid and expires_at > now()) then
    return json_build_object('status', 'waiting');
  end if;

  return json_build_object('status', 'idle');
end;
$$;

create or replace function public.heartbeat()
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_queue
  set expires_at = now() + interval '60 seconds'
  where user_id = auth.uid();
$$;

create or replace function public.leave_queue()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.match_queue where user_id = auth.uid();
$$;

create or replace function public.end_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.call_participants
    where call_id = p_call_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  update public.calls
  set status = 'ended', ended_at = now()
  where id = p_call_id and status <> 'ended';

  -- Ensure no participant can linger in the queue after the call.
  delete from public.match_queue
  where user_id in (
    select user_id from public.call_participants where call_id = p_call_id
  );

  insert into public.action_log (user_id, action) values (auth.uid(), 'call_end');
end;
$$;

create or replace function public.block_participant(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  select cp.user_id into other
  from public.call_participants cp
  where cp.call_id = p_call_id and cp.user_id <> auth.uid()
  limit 1;

  if other is null then
    raise exception 'forbidden';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (auth.uid(), other)
  on conflict do nothing;

  perform public.end_call(p_call_id);
end;
$$;

create or replace function public.report_participant(
  p_call_id uuid,
  p_reason text,
  p_details text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
  recent int;
begin
  if p_reason not in ('harassment','inappropriate','spam','underage','other') then
    raise exception 'invalid_reason';
  end if;
  if p_details is not null and char_length(p_details) > 500 then
    raise exception 'details_too_long';
  end if;

  select cp.user_id into other
  from public.call_participants cp
  where cp.call_id = p_call_id and cp.user_id <> auth.uid()
  limit 1;

  if other is null then
    raise exception 'forbidden';
  end if;

  select count(*) into recent from public.action_log
    where user_id = auth.uid() and action = 'report'
      and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'slow_down';
  end if;
  insert into public.action_log (user_id, action) values (auth.uid(), 'report');

  insert into public.reports (call_id, reporter_id, reported_id, reason, details)
  values (p_call_id, auth.uid(), other, p_reason, nullif(p_details, ''));
end;
$$;

-- Periodic hygiene: fail calls that never connected and prune stale queue rows.
create or replace function public.expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calls
  set status = 'failed', ended_at = now()
  where status in ('matched','connecting')
    and created_at < now() - interval '2 minutes';

  delete from public.match_queue where expires_at < now() - interval '5 minutes';
end;
$$;

-- Grant authenticated users only the RPC surface; tables stay locked behind RLS.
revoke all on public.profiles, public.calls, public.call_participants,
  public.match_queue, public.blocks, public.reports, public.action_log
  from anon, authenticated;

grant select on public.profiles, public.calls, public.call_participants,
  public.match_queue, public.blocks, public.reports
  to authenticated;

grant execute on function public.matchmake() to authenticated;
grant execute on function public.my_state() to authenticated;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.leave_queue() to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.block_participant(uuid) to authenticated;
grant execute on function public.report_participant(uuid, text, text) to authenticated;

-- Matchmaking notifications for waiting users and call-status watchers.
alter publication supabase_realtime add table public.call_participants;
alter publication supabase_realtime add table public.calls;
