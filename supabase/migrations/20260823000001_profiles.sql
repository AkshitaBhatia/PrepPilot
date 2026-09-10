-- Profiles: the application-owned record for each authenticated user.
--
-- auth.users is managed by Supabase and should not be extended directly, so
-- application fields live here, keyed by the same id.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email        text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each auth user. One row per user, id matches auth.users.id.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- PRD §8 requires that each user reach only their own records. RLS is the only
-- enforcement point that a compromised or modified client cannot bypass, so it
-- is enabled here rather than relying on correct queries in the app.

alter table public.profiles enable row level security;

-- Also applies the policies to the table owner, closing the hole where a
-- privileged role bypasses RLS by default.
alter table public.profiles force row level security;

-- RLS filters rows only after the privilege check passes, so without an explicit
-- grant every request is rejected before a policy is ever consulted. Delete is
-- withheld: profiles go away with the cascade from auth.users (D28).
grant select, insert, update on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Insert is handled by the trigger below, which runs as definer. A user-facing
-- insert policy exists only so a profile can be recreated if one is ever missing;
-- it still cannot create a row for anybody else.
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Deliberately no delete policy: profiles are removed by the cascade from
-- auth.users when the account itself is deleted (DECISIONS.md, D28).

-- ---------------------------------------------------------------------------
-- Keep profiles in step with auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- An empty search_path forces every reference below to be schema-qualified,
-- so a table planted on a mutable search_path cannot hijack this definer function.
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    new.email,
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Set server-side rather than trusting a client-supplied timestamp, because
-- sync conflict resolution depends on it (DECISIONS.md, D14).

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
