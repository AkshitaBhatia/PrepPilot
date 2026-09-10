-- The synchronised tables.
--
-- These mirror the local SQLite schema so a row can move between the two without
-- translation. The device remains the source of truth (PRD §6); this is the copy
-- that survives a lost phone and follows a student to a second device.
--
-- Conventions, all carried over from the local schema:
--   * ids are client-generated UUIDv7 (D13), so a row created offline is final
--   * deleted_at is a tombstone, never a hard delete (D12)
--   * updated_at drives conflict resolution (D14)
--   * user_id is denormalised onto every table so one RLS predicate covers it

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Sets updated_at server-side rather than trusting the client's clock for the
-- authoritative copy. The client's own value still travels in the payload and is
-- what local conflict resolution compares.
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

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------

create table if not exists public.subjects (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists subjects_user_idx on public.subjects (user_id, deleted_at, position);
-- Pulling changes since a timestamp is the sync layer's hot path.
create index if not exists subjects_user_updated_idx on public.subjects (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------

create table if not exists public.chapters (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists chapters_subject_idx on public.chapters (subject_id, deleted_at, position);
create index if not exists chapters_user_updated_idx on public.chapters (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------

create table if not exists public.topics (
  id                   uuid primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  chapter_id           uuid not null references public.chapters (id) on delete cascade,
  name                 text not null,
  completed            boolean not null default false,
  -- Tracked separately from updated_at so completion resolves independently of a
  -- rename (D14): renaming on one device must not revert a tick made on another.
  completed_changed_at timestamptz,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists topics_chapter_idx on public.topics (chapter_id, deleted_at, position);
create index if not exists topics_user_updated_idx on public.topics (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- study_sessions
-- ---------------------------------------------------------------------------
-- Deliberately no foreign key to subjects, chapters or topics (D16, D37).
-- Deleting a subject must not shrink "total time studied using PrepPilot" — the
-- student really did spend that time — so the ids are plain references and the
-- names are snapshots taken when the session was recorded.

create table if not exists public.study_sessions (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  subject_id       uuid,
  chapter_id       uuid,
  topic_id         uuid,
  subject_name     text,
  chapter_name     text,
  topic_name       text,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  timer_mode       text not null,
  status           text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint study_sessions_duration_non_negative check (duration_seconds >= 0),
  constraint study_sessions_timer_mode_known check (timer_mode in ('stopwatch', 'pomodoro', 'custom')),
  constraint study_sessions_status_known check (status in ('running', 'paused', 'completed', 'abandoned'))
);

create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, deleted_at, started_at desc);
create index if not exists study_sessions_user_updated_idx
  on public.study_sessions (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
-- notification_id is deliberately absent: it identifies a scheduled notification
-- on one device and is meaningless anywhere else (D45).

create table if not exists public.reminders (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  scheduled_at timestamptz not null,
  repeat_rule  text not null default 'none',
  subject_id   uuid,
  chapter_id   uuid,
  topic_id     uuid,
  related_name text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint reminders_repeat_rule_known check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly'))
);

create index if not exists reminders_user_time_idx on public.reminders (user_id, deleted_at, scheduled_at);
create index if not exists reminders_user_updated_idx on public.reminders (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- PRD §8 requires each student reach only their own records. RLS is the only
-- enforcement point a modified client cannot bypass, so every table gets it and
-- every policy is scoped to auth.uid().
--
-- `force row level security` applies the policies to the table owner too,
-- closing the hole where a privileged role bypasses them by default.

do $$
declare
  target text;
begin
  foreach target in array array['subjects', 'chapters', 'topics', 'study_sessions', 'reminders']
  loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);

    -- Privileges come first: RLS filters rows *after* the privilege check, so a
    -- table with policies but no grant rejects every request outright rather
    -- than returning an empty set. Delete is deliberately withheld — rows are
    -- tombstoned, never removed (D12).
    execute format('grant select, insert, update on public.%I to authenticated', target);

    execute format($f$
      create policy "Users read their own %1$s"
        on public.%1$I for select to authenticated
        using ((select auth.uid()) = user_id)
    $f$, target);

    execute format($f$
      create policy "Users insert their own %1$s"
        on public.%1$I for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $f$, target);

    execute format($f$
      create policy "Users update their own %1$s"
        on public.%1$I for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $f$, target);

    -- Deliberately no delete policy anywhere: rows are tombstoned via
    -- deleted_at (D12), and a real delete would resurrect the row on the next
    -- pull from a device that has not seen the removal.

    execute format(
      'create trigger %1$s_touch_updated_at before update on public.%1$I
         for each row execute function public.touch_updated_at()',
      target
    );
  end loop;
end;
$$;
