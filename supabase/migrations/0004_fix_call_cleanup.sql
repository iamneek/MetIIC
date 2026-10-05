-- 0004_fix_call_cleanup.sql — auto-heal stale calls and allow matchmaking recovery.

create index if not exists calls_status_created_idx on public.calls (status, created_at);

-- Updated matchmake: automatically terminates any dangling active calls for the calling user
-- and reaps stale unmatched/connecting calls so users are never permanently stuck.
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
