-- Sub-topics, and notes on topics.
--
-- Sub-topics are the optional fourth level of the syllabus: Subject -> Chapter
-- -> Topic -> Sub-topic. A student adds them themselves, exactly as they add the
-- other three; nothing creates them automatically, and a topic without any stays
-- an ordinary checkable topic.
--
-- Conventions are carried over unchanged from the other synced tables: client
-- generated UUIDv7 ids (D13), tombstones rather than deletes (D12), updated_at
-- driving conflict resolution (D14), and user_id denormalised so a single RLS
-- predicate covers the table.

-- ---------------------------------------------------------------------------
-- topics.note
-- ---------------------------------------------------------------------------
-- Null and empty both mean "no note"; the client stores null so there is one
-- representation rather than two.

alter table public.topics add column if not exists note text;

-- ---------------------------------------------------------------------------
-- subtopics
-- ---------------------------------------------------------------------------

create table if not exists public.subtopics (
  id                   uuid primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  topic_id             uuid not null references public.topics (id) on delete cascade,
  name                 text not null,
  completed            boolean not null default false,
  -- Tracked separately from updated_at so completion resolves independently of
  -- a rename (D14), exactly as it does for topics.
  completed_changed_at timestamptz,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists subtopics_topic_idx
  on public.subtopics (topic_id, deleted_at, position);
create index if not exists subtopics_user_updated_idx
  on public.subtopics (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Identical in shape to the other synced tables: enable, force, grant, then one
-- policy per operation scoped to auth.uid(). Delete is withheld everywhere —
-- rows are tombstoned, and a real delete would resurrect the row on the next
-- pull from a device that has not seen the removal (D12).
--
-- Written idempotently so re-running the migration against a database that has
-- already had it applied does not fail on an existing policy.

do $$
begin
  execute 'alter table public.subtopics enable row level security';
  execute 'alter table public.subtopics force row level security';
  execute 'grant select, insert, update on public.subtopics to authenticated';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subtopics'
      and policyname = 'Users read their own subtopics'
  ) then
    execute $p$
      create policy "Users read their own subtopics"
        on public.subtopics for select to authenticated
        using ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subtopics'
      and policyname = 'Users insert their own subtopics'
  ) then
    execute $p$
      create policy "Users insert their own subtopics"
        on public.subtopics for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subtopics'
      and policyname = 'Users update their own subtopics'
  ) then
    execute $p$
      create policy "Users update their own subtopics"
        on public.subtopics for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'subtopics_touch_updated_at'
  ) then
    execute 'create trigger subtopics_touch_updated_at before update on public.subtopics
               for each row execute function public.touch_updated_at()';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- flashcards
-- ---------------------------------------------------------------------------
-- Reviewed on an SM-2 schedule; @preppilot/shared owns the algorithm and this
-- only stores what it decided.
--
-- `topic_id` deliberately carries no foreign key and the topic's name is
-- snapshotted, exactly as study_sessions does (D16): deleting a topic must not
-- destroy the cards written for it or the review history behind them.

create table if not exists public.flashcards (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  topic_id         uuid,
  topic_name       text,
  front            text not null,
  back             text not null,
  ease_factor      double precision not null default 2.5,
  interval_days    integer not null default 0,
  repetitions      integer not null default 0,
  lapses           integer not null default 0,
  due_at           timestamptz not null,
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint flashcards_ease_sane check (ease_factor >= 1.3),
  constraint flashcards_counts_non_negative
    check (interval_days >= 0 and repetitions >= 0 and lapses >= 0)
);

create index if not exists flashcards_user_due_idx
  on public.flashcards (user_id, deleted_at, due_at);
create index if not exists flashcards_user_updated_idx
  on public.flashcards (user_id, updated_at);

do $$
begin
  execute 'alter table public.flashcards enable row level security';
  execute 'alter table public.flashcards force row level security';
  execute 'grant select, insert, update on public.flashcards to authenticated';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flashcards'
      and policyname = 'Users read their own flashcards'
  ) then
    execute $p$
      create policy "Users read their own flashcards"
        on public.flashcards for select to authenticated
        using ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flashcards'
      and policyname = 'Users insert their own flashcards'
  ) then
    execute $p$
      create policy "Users insert their own flashcards"
        on public.flashcards for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flashcards'
      and policyname = 'Users update their own flashcards'
  ) then
    execute $p$
      create policy "Users update their own flashcards"
        on public.flashcards for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'flashcards_touch_updated_at'
  ) then
    execute 'create trigger flashcards_touch_updated_at before update on public.flashcards
               for each row execute function public.touch_updated_at()';
  end if;
end;
$$;
