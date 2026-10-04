-- 0003_realtime.sql — authorize private broadcast channels per call.
-- Clients publish/subscribe to `call:<call_id>` with private: true.
-- Only current participants of a live call may read or write those messages.

revoke execute on function public.is_busy(uuid) from public, anon, authenticated;

create or replace function public.is_call_topic_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.call_participants cp
    join public.calls c on c.id = cp.call_id
    where cp.user_id = auth.uid()
      and ('call:' || c.id::text) = p_topic
      and c.status in ('matched','connecting','connected')
  );
$$;

drop policy if exists realtime_messages_select on realtime.messages;
create policy realtime_messages_select on realtime.messages
  for select to authenticated
  using (topic like 'call:%' and public.is_call_topic_member(topic));

drop policy if exists realtime_messages_insert on realtime.messages;
create policy realtime_messages_insert on realtime.messages
  for insert to authenticated
  with check (topic like 'call:%' and public.is_call_topic_member(topic));
