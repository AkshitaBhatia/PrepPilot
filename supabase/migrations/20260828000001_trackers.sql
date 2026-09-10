-- Multiple courses on one account.
--
-- A student preparing for two exams keeps two syllabuses, two sets of notes and
-- two decks; without a tracker to hang them from, both would interleave into one
-- unusable list. Everything a student owns belongs to exactly one tracker.
--
-- Columns are added nullable on purpose. Rows written before this migration have
-- no tracker, and the client claims them into a default one on next launch
-- (`adoptOrphans`). Making the column NOT NULL here would reject those rows on
-- their first sync — a student's syllabus would fail to upload with no way back.

-- ---------------------------------------------------------------------------
-- trackers
-- ---------------------------------------------------------------------------

create table if not exists public.trackers (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  -- Which bundled template this came from, if any. Kept so the app can offer a
  -- refreshed syllabus when a template is updated, and null for a course the
  -- student built themselves.
  template_id text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint trackers_name_not_blank check (length(btrim(name)) > 0)
);

create index if not exists trackers_user_updated_idx
  on public.trackers (user_id, updated_at);

do $$
begin
  execute 'alter table public.trackers enable row level security';
  execute 'alter table public.trackers force row level security';
  execute 'grant select, insert, update on public.trackers to authenticated';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trackers'
      and policyname = 'Users read their own trackers'
  ) then
    execute $p$
      create policy "Users read their own trackers"
        on public.trackers for select to authenticated
        using ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trackers'
      and policyname = 'Users insert their own trackers'
  ) then
    execute $p$
      create policy "Users insert their own trackers"
        on public.trackers for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trackers'
      and policyname = 'Users update their own trackers'
  ) then
    execute $p$
      create policy "Users update their own trackers"
        on public.trackers for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trackers_touch_updated_at'
  ) then
    execute 'create trigger trackers_touch_updated_at before update on public.trackers
               for each row execute function public.touch_updated_at()';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- tracker_id on everything a tracker owns
-- ---------------------------------------------------------------------------
--
-- No foreign key to public.trackers. Rows arrive in whatever order sync manages,
-- and a subject that lands before its tracker would be rejected outright rather
-- than waiting — losing work that the client already considers saved. The client
-- orders trackers first (SYNCED_TABLES) so this is belt-and-braces, and RLS
-- already confines every row to its owner.

alter table public.subjects       add column if not exists tracker_id uuid;
alter table public.study_sessions add column if not exists tracker_id uuid;
alter table public.reminders      add column if not exists tracker_id uuid;
alter table public.flashcards     add column if not exists tracker_id uuid;

create index if not exists subjects_user_tracker_idx
  on public.subjects (user_id, tracker_id, deleted_at);
create index if not exists study_sessions_user_tracker_idx
  on public.study_sessions (user_id, tracker_id, deleted_at);
create index if not exists reminders_user_tracker_idx
  on public.reminders (user_id, tracker_id, deleted_at);
create index if not exists flashcards_user_tracker_idx
  on public.flashcards (user_id, tracker_id, deleted_at);
