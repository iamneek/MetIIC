-- 0001_schema.sql — core tables, constraints, indexes, RLS.

-- Enforce the email domain at the database layer, before any signup row exists.
create or replace function public.enforce_allowed_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'iic.edu.np' then
    raise exception 'domain_not_allowed: only @iic.edu.np addresses are permitted';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_domain_on_signup on auth.users;
create trigger enforce_domain_on_signup
  before insert or update of email on auth.users
  for each row execute function public.enforce_allowed_email_domain();

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email_verified boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

-- Mirror signup into profiles, and keep email_verified in sync on confirmation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email_verified)
  values (new.id, new.email_confirmed_at is not null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null or old.email_confirmed_at <> new.email_confirmed_at) then
    update public.profiles set email_verified = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_email_confirmed();

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'matched'
    check (status in ('waiting','matched','connecting','connected','ending','ended','failed')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.call_participants (
  call_id uuid not null references public.calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('initiator','responder')),
  primary key (call_id, user_id)
);

create unique index if not exists call_participants_one_user_per_call
  on public.call_participants (user_id); -- placeholder, replaced below

drop index if exists call_participants_one_user_per_call;

-- A user participates in at most one call at a time: enforced logically by
-- matchmake (checks active calls under a profile row lock). A partial unique
-- index cannot reference calls.status without a join, so we enforce it in the
-- security-definer functions instead and assert it in tests/documentation.

create table if not exists public.match_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists match_queue_created_at_idx on public.match_queue (created_at);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls (id) on delete set null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('harassment','inappropriate','spam','underage','other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists reports_reported_idx on public.reports (reported_id, created_at desc);

create table if not exists public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists action_log_user_action_idx on public.action_log (user_id, action, created_at desc);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.match_queue enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.action_log enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy calls_select_participant on public.calls
  for select to authenticated using (
    exists (
      select 1 from public.call_participants cp
      where cp.call_id = calls.id and cp.user_id = auth.uid()
    )
  );

-- Security-definer helper avoids recursive RLS evaluation on call_participants.
create or replace function public.user_in_call(p_call_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.call_participants
    where call_id = p_call_id and user_id = auth.uid()
  );
$$;

create policy call_participants_select on public.call_participants
  for select to authenticated using (
    user_id = auth.uid() or public.user_in_call(call_id)
  );

create policy match_queue_select_own on public.match_queue
  for select to authenticated using (auth.uid() = user_id);

create policy blocks_select_involving on public.blocks
  for select to authenticated using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy reports_select_own on public.reports
  for select to authenticated using (auth.uid() = reporter_id);

-- action_log: no client access (functions are security definer).
