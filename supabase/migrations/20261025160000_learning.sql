-- Learning: FSRS scheduling state per word and an append-only log of every answer.
--
-- The scheduler runs in the app (ts-fsrs), so progress rows are written by their owner.
-- The review log is insert-only: later phases compute XP and coins from it on the server,
-- with caps, so editing history must not be possible.

create table public.word_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id uuid not null references public.words (id) on delete cascade,
  due timestamptz not null,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  -- 0 new, 1 learning, 2 review, 3 relearning (ts-fsrs State)
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

create index word_progress_due_idx on public.word_progress (user_id, due);

alter table public.word_progress enable row level security;

create policy "Users manage their own progress"
  on public.word_progress for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.word_progress from anon;
revoke truncate on public.word_progress from authenticated;

create trigger word_progress_touch_updated_at
  before update on public.word_progress
  for each row execute function public.touch_updated_at();

create table public.review_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id uuid references public.words (id) on delete set null,
  rule_id uuid references public.rules (id) on delete set null,
  mode text not null check (
    mode in ('cards', 'choice', 'typing', 'cloze', 'builder', 'listening', 'dictation', 'speaking', 'sorting', 'rules')
  ),
  -- 1 again, 2 hard, 3 good, 4 easy
  rating smallint not null check (rating between 1 and 4),
  correct boolean not null,
  duration_ms integer check (duration_ms between 0 and 600000),
  reviewed_at timestamptz not null default now()
);

create index review_log_user_time_idx on public.review_log (user_id, reviewed_at);

alter table public.review_log enable row level security;

create policy "Users read their own reviews"
  on public.review_log for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users log their own reviews"
  on public.review_log for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.review_log from anon, authenticated;
grant select on public.review_log to authenticated;
grant insert (word_id, rule_id, mode, rating, correct, duration_ms) on public.review_log to authenticated;

-- Rows may only point at the user's own words and rules.
create function private.check_learning_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.word_id is not null
    and not exists (select 1 from public.words w where w.id = new.word_id and w.user_id = new.user_id) then
    raise exception 'word does not belong to this user';
  end if;
  if tg_table_name = 'review_log' and new.rule_id is not null
    and not exists (select 1 from public.rules r where r.id = new.rule_id and r.user_id = new.user_id) then
    raise exception 'rule does not belong to this user';
  end if;
  return new;
end;
$$;

-- An honest learner answers a few times a minute at most; anything far beyond is a script.
create function private.throttle_reviews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.review_log
      where user_id = new.user_id and reviewed_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many answers, slow down';
  end if;
  return new;
end;
$$;

revoke all on function private.check_learning_refs() from public, anon, authenticated;
revoke all on function private.throttle_reviews() from public, anon, authenticated;

create trigger word_progress_check_refs before insert or update of word_id on public.word_progress
  for each row execute function private.check_learning_refs();
create trigger review_log_check_refs before insert on public.review_log
  for each row execute function private.check_learning_refs();
create trigger review_log_throttle before insert on public.review_log
  for each row execute function private.throttle_reviews();

-- Today's count, active days, accuracy and progress for the signed-in user, in their time zone.
-- SECURITY INVOKER: it reads through the caller's own row-level security.
create function public.study_summary(p_time_zone text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
    tz as (
      select coalesce((select name from pg_catalog.pg_timezone_names where name = p_time_zone limit 1), 'UTC') as name
    ),
    logs as (
      select (r.reviewed_at at time zone (select name from tz)) as local_at, r.correct
      from public.review_log r
      where r.user_id = (select auth.uid())
        and r.reviewed_at > now() - interval '400 days'
    ),
    today as (select (now() at time zone (select name from tz))::date as day)
  select jsonb_build_object(
    'today', (select count(*) from logs where local_at::date = (select day from today)),
    'today_correct', (select count(*) from logs where local_at::date = (select day from today) and correct),
    'days', (select coalesce(jsonb_agg(d order by d desc), '[]') from (select distinct local_at::date as d from logs) t),
    'accuracy_30d', jsonb_build_object(
      'correct', (select count(*) from logs where correct and local_at > (select day from today) - 30),
      'total', (select count(*) from logs where local_at > (select day from today) - 30)
    ),
    'learned', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()) and p.state = 2),
    'due', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()) and p.due <= now()),
    'started', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()))
  );
$$;

revoke all on function public.study_summary(text) from public, anon;
grant execute on function public.study_summary(text) to authenticated;
