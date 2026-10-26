-- Phase 3: XP, levels, coins, achievements, quests, the daily chest, the shop and streak freezes.
--
-- Everything that earns or spends is computed here, inside the database, from the append-only
-- review_log: the app's code is public, so the browser is never trusted with rewards.
-- Users can read their own state but write none of it directly.

-- ---------- Profile settings used by the server ----------

alter table public.profiles
  add column time_zone text not null default 'UTC',
  add column daily_goal integer not null default 20 check (daily_goal between 10 and 200),
  add column equipped jsonb not null default '{}'::jsonb,
  add column boost_until timestamptz;

grant update (time_zone, daily_goal) on public.profiles to authenticated;

-- An unknown time zone falls back to UTC, so "today" is always computable.
create function private.check_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    new.time_zone := 'UTC';
  end if;
  return new;
end;
$$;

revoke all on function private.check_time_zone() from public, anon, authenticated;

create trigger profiles_check_time_zone before insert or update of time_zone on public.profiles
  for each row execute function private.check_time_zone();

-- ---------- Catalogs (public) ----------

create table public.achievements (
  id text primary key,
  -- answers, correct, learned, words, streak, goal_days, modes, level, notion, night, morning
  metric text not null,
  threshold integer not null,
  reward integer not null default 0,
  icon text not null,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  hidden boolean not null default false,
  sort integer not null default 0
);

create table public.shop_items (
  id text primary key,
  kind text not null check (kind in ('avatar', 'frame', 'banner', 'theme', 'title', 'card_back', 'sound', 'name_color', 'boost')),
  price integer not null check (price >= 0),
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  data jsonb not null default '{}'::jsonb,
  requires_achievement text references public.achievements (id),
  consumable boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0
);

alter table public.achievements enable row level security;
alter table public.shop_items enable row level security;
create policy "Anyone can read achievements" on public.achievements for select to anon, authenticated using (true);
create policy "Anyone can read the shop" on public.shop_items for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.achievements, public.shop_items from anon, authenticated;

-- ---------- Per-user state (read-only for users) ----------

create table public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day date,
  answers_today integer not null default 0,
  xp_today integer not null default 0,
  coins_today integer not null default 0,
  goal_reached_today boolean not null default false,
  answers_total integer not null default 0,
  correct_total integer not null default 0,
  new_words_total integer not null default 0,
  goal_days integer not null default 0,
  modes_used text[] not null default '{}',
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_active_day date,
  last_chest_day date
);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.shop_items (id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 0),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null check (period in ('day', 'week')),
  period_start date not null,
  kind text not null,
  target integer not null check (target > 0),
  reward integer not null check (reward >= 0),
  progress integer not null default 0,
  claimed_at timestamptz,
  unique (user_id, period, period_start, kind)
);

create table public.streak_freezes (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

-- Every coin earned outside plain answers, and every coin spent.
create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at);
create index user_quests_user_idx on public.user_quests (user_id, period_start);

do $$
declare
  t text;
begin
  foreach t in array array['user_stats', 'user_achievements', 'inventory', 'user_quests', 'streak_freezes', 'coin_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Users read their own %s" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ---------- Helpers ----------

-- Same curve as the app: going from level L to L+1 takes 100 + 50 * (L - 1) XP.
create function private.level_for(total integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  level integer := 1;
  remaining integer := greatest(coalesce(total, 0), 0);
begin
  while remaining >= 100 + (level - 1) * 50 loop
    remaining := remaining - (100 + (level - 1) * 50);
    level := level + 1;
  end loop;
  return level;
end;
$$;

-- Consecutive days with an answer or a used streak freeze, ending today.
create function private.compute_streak(p_user uuid, p_time_zone text, p_today date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  streak integer := 0;
  d date := p_today;
begin
  loop
    if d = p_today
      or exists (
        select 1 from public.review_log r
        where r.user_id = p_user
          and r.reviewed_at >= (d::timestamp at time zone p_time_zone)
          and r.reviewed_at < ((d + 1)::timestamp at time zone p_time_zone)
      )
      or exists (select 1 from public.streak_freezes f where f.user_id = p_user and f.day = d) then
      streak := streak + 1;
      d := d - 1;
    else
      exit;
    end if;
    exit when streak > 3650;
  end loop;
  return streak;
end;
$$;

create function private.award_achievements(
  p_user uuid,
  p_answers integer,
  p_correct integer,
  p_best_streak integer,
  p_goal_days integer,
  p_modes integer,
  p_level integer,
  p_hour integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  learned integer;
  word_count integer;
  has_notion boolean;
  achievement public.achievements;
  metric_value integer;
  gained integer := 0;
begin
  select count(*) into learned from public.word_progress where user_id = p_user and state = 2;
  select count(*) into word_count from public.words where user_id = p_user and deleted_at is null;
  has_notion := exists (select 1 from public.notion_connections where user_id = p_user);

  for achievement in
    select a.* from public.achievements a
    where not exists (select 1 from public.user_achievements u where u.user_id = p_user and u.achievement_id = a.id)
  loop
    metric_value := case achievement.metric
      when 'answers' then p_answers
      when 'correct' then p_correct
      when 'streak' then p_best_streak
      when 'goal_days' then p_goal_days
      when 'modes' then p_modes
      when 'level' then p_level
      when 'learned' then learned
      when 'words' then word_count
      when 'notion' then has_notion::integer
      when 'night' then (p_hour < 5)::integer
      when 'morning' then (p_hour between 5 and 6)::integer
      else 0
    end;
    if metric_value >= achievement.threshold then
      insert into public.user_achievements (user_id, achievement_id) values (p_user, achievement.id) on conflict do nothing;
      gained := gained + achievement.reward;
    end if;
  end loop;

  if gained > 0 then
    update public.profiles set coins = coins + gained where id = p_user;
    insert into public.coin_ledger (user_id, amount, reason) values (p_user, gained, 'achievements');
  end if;
end;
$$;

-- ---------- Rewards for every answer ----------

create function private.on_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.profiles;
  stats public.user_stats;
  today date;
  week_start date;
  local_hour integer;
  first_today boolean;
  is_new_word boolean := false;
  xp_gain integer;
  coin_gain integer := 0;
  bonus integer := 0;
  goal_hit boolean := false;
  old_level integer;
  new_level integer;
begin
  select * into profile from public.profiles where id = new.user_id for update;
  if not found then
    return new;
  end if;

  today := (now() at time zone profile.time_zone)::date;
  week_start := date_trunc('week', today)::date;
  local_hour := extract(hour from now() at time zone profile.time_zone)::integer;

  insert into public.user_stats (user_id, day) values (new.user_id, today) on conflict (user_id) do nothing;
  select * into stats from public.user_stats where user_id = new.user_id for update;
  if stats.day is distinct from today then
    stats.day := today;
    stats.answers_today := 0;
    stats.xp_today := 0;
    stats.coins_today := 0;
    stats.goal_reached_today := false;
  end if;
  first_today := stats.answers_today = 0;

  if new.word_id is not null then
    select p.reps = 1 into is_new_word from public.word_progress p where p.user_id = new.user_id and p.word_id = new.word_id;
    is_new_word := coalesce(is_new_word, false);
  end if;

  -- XP: 10 for a good answer, 12 for easy, 6 for hard, 2 for trying. Double while a boost runs.
  xp_gain := case when not new.correct then 2 when new.rating = 4 then 12 when new.rating = 3 then 10 else 6 end;
  if profile.boost_until is not null and profile.boost_until > now() then
    xp_gain := xp_gain * 2;
  end if;
  -- Daily caps keep scripted farming pointless.
  xp_gain := least(xp_gain, greatest(0, 3000 - stats.xp_today));
  if new.correct and stats.coins_today < 150 then
    coin_gain := 1;
  end if;

  stats.answers_today := stats.answers_today + 1;
  stats.answers_total := stats.answers_total + 1;
  if new.correct then
    stats.correct_total := stats.correct_total + 1;
  end if;
  if not (new.mode = any (stats.modes_used)) then
    stats.modes_used := array_append(stats.modes_used, new.mode);
  end if;
  if is_new_word then
    stats.new_words_total := stats.new_words_total + 1;
  end if;
  stats.last_active_day := today;

  if not stats.goal_reached_today and stats.answers_today >= profile.daily_goal then
    stats.goal_reached_today := true;
    stats.goal_days := stats.goal_days + 1;
    goal_hit := true;
    bonus := bonus + 20;
    xp_gain := xp_gain + 50;
    insert into public.coin_ledger (user_id, amount, reason) values (new.user_id, 20, 'daily_goal');
  end if;

  if first_today then
    stats.current_streak := private.compute_streak(new.user_id, profile.time_zone, today);
    stats.best_streak := greatest(stats.best_streak, stats.current_streak);
  end if;

  stats.xp_today := stats.xp_today + xp_gain;
  stats.coins_today := stats.coins_today + coin_gain;

  old_level := private.level_for(profile.xp);
  new_level := private.level_for(profile.xp + xp_gain);
  if new_level > old_level then
    bonus := bonus + 50 * (new_level - old_level);
    insert into public.coin_ledger (user_id, amount, reason) values (new.user_id, 50 * (new_level - old_level), 'level_up');
  end if;

  update public.profiles set xp = xp + xp_gain, coins = coins + coin_gain + bonus where id = new.user_id;

  update public.user_stats set
    day = stats.day,
    answers_today = stats.answers_today,
    xp_today = stats.xp_today,
    coins_today = stats.coins_today,
    goal_reached_today = stats.goal_reached_today,
    answers_total = stats.answers_total,
    correct_total = stats.correct_total,
    new_words_total = stats.new_words_total,
    goal_days = stats.goal_days,
    modes_used = stats.modes_used,
    current_streak = stats.current_streak,
    best_streak = stats.best_streak,
    last_active_day = stats.last_active_day
  where user_id = new.user_id;

  update public.user_quests q
  set progress = least(q.target, q.progress + 1)
  where q.user_id = new.user_id
    and q.claimed_at is null
    and q.progress < q.target
    and ((q.period = 'day' and q.period_start = today) or (q.period = 'week' and q.period_start = week_start))
    and (
      q.kind = 'answers'
      or (q.kind = 'correct' and new.correct)
      or q.kind = 'mode:' || new.mode
      or (q.kind = 'new_words' and is_new_word)
      or (q.kind in ('goal', 'goal_days') and goal_hit)
    );

  perform private.award_achievements(
    new.user_id,
    stats.answers_total,
    stats.correct_total,
    stats.best_streak,
    stats.goal_days,
    coalesce(array_length(stats.modes_used, 1), 0),
    new_level,
    local_hour
  );

  return new;
end;
$$;

revoke all on function private.level_for(integer) from public, anon;
grant execute on function private.level_for(integer) to authenticated;
revoke all on function private.compute_streak(uuid, text, date) from public, anon, authenticated;
revoke all on function private.award_achievements(uuid, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.on_review() from public, anon, authenticated;

create trigger review_log_rewards after insert on public.review_log
  for each row execute function private.on_review();

-- ---------- Actions (callable by the signed-in user, for themselves only) ----------

create function private.user_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select time_zone from public.profiles where id = p_user), 'UTC'))::date;
$$;

revoke all on function private.user_today(uuid) from public, anon, authenticated;

create function public.ensure_quests()
returns setof public.user_quests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date;
  week_start date;
begin
  if uid is null then
    raise exception 'sign in first';
  end if;
  today := private.user_today(uid);
  week_start := date_trunc('week', today)::date;

  delete from public.user_quests where user_id = uid and period_start < today - 30;

  -- Three daily quests from different families, chosen the same way all day.
  if not exists (select 1 from public.user_quests where user_id = uid and period = 'day' and period_start = today) then
    insert into public.user_quests (user_id, period, period_start, kind, target, reward)
    select uid, 'day', today, kind, target, reward
    from (
      select distinct on (family) family, kind, target, reward
      from (values
        ('answers', 'answers', 20, 15),
        ('answers', 'answers', 40, 25),
        ('correct', 'correct', 15, 15),
        ('correct', 'correct', 30, 25),
        ('goal', 'goal', 1, 25),
        ('mode', 'mode:cards', 15, 15),
        ('mode', 'mode:choice', 10, 20),
        ('mode', 'mode:typing', 10, 20),
        ('new', 'new_words', 5, 20)
      ) as pool (family, kind, target, reward)
      order by family, md5(uid::text || today::text || kind || target::text)
    ) picks
    order by md5(uid::text || today::text || family)
    limit 3;
  end if;

  if not exists (select 1 from public.user_quests where user_id = uid and period = 'week' and period_start = week_start) then
    insert into public.user_quests (user_id, period, period_start, kind, target, reward)
    select uid, 'week', week_start, kind, target, reward
    from (values
      ('answers', 250, 120),
      ('correct', 200, 120),
      ('goal_days', 5, 150),
      ('new_words', 30, 120)
    ) as pool (kind, target, reward)
    order by md5(uid::text || week_start::text || kind)
    limit 2;
  end if;

  return query
    select * from public.user_quests q
    where q.user_id = uid
      and ((q.period = 'day' and q.period_start = today) or (q.period = 'week' and q.period_start = week_start))
    order by q.period, q.kind;
end;
$$;

create function public.claim_quest(p_quest uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  quest public.user_quests;
begin
  select * into quest from public.user_quests where id = p_quest and user_id = uid for update;
  if not found then
    raise exception 'no such quest';
  end if;
  if quest.claimed_at is not null then
    raise exception 'already claimed';
  end if;
  if quest.progress < quest.target then
    raise exception 'quest not finished';
  end if;

  update public.user_quests set claimed_at = now() where id = p_quest;
  update public.profiles set coins = coins + quest.reward where id = uid;
  insert into public.coin_ledger (user_id, amount, reason) values (uid, quest.reward, 'quest:' || quest.kind);
  return quest.reward;
end;
$$;

-- Once a day: 10–30 coins most days, sometimes more, rarely a streak freeze.
create function public.open_daily_chest()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date;
  roll double precision := random();
  reward integer;
  got_freeze boolean := false;
begin
  if uid is null then
    raise exception 'sign in first';
  end if;
  today := private.user_today(uid);

  insert into public.user_stats (user_id, day) values (uid, today) on conflict (user_id) do nothing;
  perform 1 from public.user_stats where user_id = uid for update;
  if exists (select 1 from public.user_stats where user_id = uid and last_chest_day = today) then
    raise exception 'chest already opened today';
  end if;

  reward := case when roll < 0.7 then 10 + floor(random() * 21)::integer else 40 + floor(random() * 41)::integer end;
  got_freeze := random() < 0.05;

  update public.user_stats set last_chest_day = today where user_id = uid;
  update public.profiles set coins = coins + reward where id = uid;
  insert into public.coin_ledger (user_id, amount, reason) values (uid, reward, 'daily_chest');
  if got_freeze then
    insert into public.inventory (user_id, item_id, quantity) values (uid, 'streak_freeze', 1)
    on conflict (user_id, item_id) do update set quantity = public.inventory.quantity + 1;
  end if;
  return jsonb_build_object('coins', reward, 'streak_freeze', got_freeze);
end;
$$;

create function public.buy_item(p_item text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  item public.shop_items;
  balance integer;
begin
  if uid is null then
    raise exception 'sign in first';
  end if;
  select * into item from public.shop_items where id = p_item and active;
  if not found then
    raise exception 'no such item';
  end if;
  if item.requires_achievement is not null and not exists (
    select 1 from public.user_achievements where user_id = uid and achievement_id = item.requires_achievement
  ) then
    raise exception 'locked';
  end if;
  if not item.consumable and exists (select 1 from public.inventory where user_id = uid and item_id = p_item) then
    raise exception 'already owned';
  end if;

  select coins into balance from public.profiles where id = uid for update;
  if balance < item.price then
    raise exception 'not enough coins';
  end if;

  update public.profiles set coins = coins - item.price where id = uid;
  insert into public.inventory (user_id, item_id, quantity) values (uid, p_item, 1)
  on conflict (user_id, item_id) do update set quantity = public.inventory.quantity + 1;
  if item.price > 0 then
    insert into public.coin_ledger (user_id, amount, reason) values (uid, -item.price, 'buy:' || p_item);
  end if;
  return balance - item.price;
end;
$$;

-- Puts an owned cosmetic on (or, with p_item null, takes the slot off).
create function public.equip_item(p_slot text, p_item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  item public.shop_items;
  result jsonb;
begin
  if uid is null then
    raise exception 'sign in first';
  end if;
  if p_slot not in ('avatar', 'frame', 'banner', 'title', 'card_back', 'sound', 'name_color') then
    raise exception 'bad slot';
  end if;

  if p_item is null then
    update public.profiles set equipped = equipped - p_slot where id = uid returning equipped into result;
    return result;
  end if;

  select * into item from public.shop_items where id = p_item;
  if not found or item.kind <> p_slot then
    raise exception 'item does not fit this slot';
  end if;
  -- Free achievement items too must be claimed (buy_item checks the achievement) before use.
  if not exists (select 1 from public.inventory where user_id = uid and item_id = p_item) then
    raise exception 'not owned';
  end if;

  update public.profiles set equipped = equipped || jsonb_build_object(p_slot, p_item) where id = uid returning equipped into result;
  return result;
end;
$$;

-- Starts a 15-minute double-XP boost from the inventory.
create function public.use_boost()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  boost_end timestamptz;
begin
  update public.inventory set quantity = quantity - 1
  where user_id = uid and item_id = 'double_xp' and quantity > 0;
  if not found then
    raise exception 'no boost left';
  end if;
  update public.profiles
  set boost_until = greatest(coalesce(boost_until, now()), now()) + interval '15 minutes'
  where id = uid
  returning boost_until into boost_end;
  return boost_end;
end;
$$;

-- Missed exactly yesterday? A streak freeze from the inventory covers the day.
create function public.apply_streak_freeze()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date;
  last_day date;
begin
  if uid is null then
    return false;
  end if;
  today := private.user_today(uid);
  select last_active_day into last_day from public.user_stats where user_id = uid;
  if last_day is null or last_day <> today - 2 then
    return false;
  end if;
  if exists (select 1 from public.streak_freezes where user_id = uid and day = today - 1) then
    return false;
  end if;

  update public.inventory set quantity = quantity - 1
  where user_id = uid and item_id = 'streak_freeze' and quantity > 0;
  if not found then
    return false;
  end if;
  insert into public.streak_freezes (user_id, day) values (uid, today - 1);
  return true;
end;
$$;

revoke all on function public.ensure_quests() from public, anon;
revoke all on function public.claim_quest(uuid) from public, anon;
revoke all on function public.open_daily_chest() from public, anon;
revoke all on function public.buy_item(text) from public, anon;
revoke all on function public.equip_item(text, text) from public, anon;
revoke all on function public.use_boost() from public, anon;
revoke all on function public.apply_streak_freeze() from public, anon;
grant execute on function public.ensure_quests() to authenticated;
grant execute on function public.claim_quest(uuid) to authenticated;
grant execute on function public.open_daily_chest() to authenticated;
grant execute on function public.buy_item(text) to authenticated;
grant execute on function public.equip_item(text, text) to authenticated;
grant execute on function public.use_boost() to authenticated;
grant execute on function public.apply_streak_freeze() to authenticated;

-- ---------- Learning summary now counts streak freezes and daily activity ----------

create or replace function public.study_summary(p_time_zone text default 'UTC')
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
    today as (select (now() at time zone (select name from tz))::date as day),
    active_days as (
      select local_at::date as d from logs
      union
      select f.day from public.streak_freezes f where f.user_id = (select auth.uid())
    )
  select jsonb_build_object(
    'today', (select count(*) from logs where local_at::date = (select day from today)),
    'today_correct', (select count(*) from logs where local_at::date = (select day from today) and correct),
    'days', (select coalesce(jsonb_agg(d order by d desc), '[]') from (select distinct d from active_days) t),
    'activity', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]')
      from (
        select local_at::date as d, count(*) as n from logs
        where local_at > (select day from today) - 182
        group by 1
      ) t
    ),
    'accuracy_30d', jsonb_build_object(
      'correct', (select count(*) from logs where correct and local_at > (select day from today) - 30),
      'total', (select count(*) from logs where local_at > (select day from today) - 30)
    ),
    'learned', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()) and p.state = 2),
    'due', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()) and p.due <= now()),
    'started', (select count(*) from public.word_progress p where p.user_id = (select auth.uid()))
  );
$$;

-- Accuracy by category, the hardest words and the review forecast. Invoker: own rows only.
create function public.study_insights()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', category, 'correct', correct, 'total', total) order by total desc), '[]')
      from (
        select coalesce(nullif(w.category, ''), '—') as category,
               count(*) filter (where r.correct) as correct,
               count(*) as total
        from public.review_log r
        join public.words w on w.id = r.word_id
        where r.user_id = (select auth.uid()) and r.reviewed_at > now() - interval '90 days'
        group by 1
        order by count(*) desc
        limit 12
      ) t
    ),
    'hardest', (
      select coalesce(jsonb_agg(jsonb_build_object('word', word, 'translation', translation, 'lapses', lapses) order by lapses desc, difficulty desc), '[]')
      from (
        select w.word, w.translation, p.lapses, p.difficulty
        from public.word_progress p
        join public.words w on w.id = p.word_id
        where p.user_id = (select auth.uid()) and p.lapses > 0
        order by p.lapses desc, p.difficulty desc
        limit 8
      ) t
    ),
    'forecast', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]')
      from (
        select gs::date as d,
               (select count(*) from public.word_progress p
                where p.user_id = (select auth.uid())
                  and p.due::date = gs::date) as n
        from generate_series(current_date, current_date + 6, interval '1 day') gs
      ) t
    )
  );
$$;

revoke all on function public.study_insights() from public, anon;
grant execute on function public.study_insights() to authenticated;

-- ---------- Test accounts get the whole shop ----------

create or replace function private.grant_role(target_email text, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  previous public.app_role;
begin
  select id into target from auth.users where lower(email) = lower(target_email);
  if target is null then
    raise exception 'No account with email %', target_email;
  end if;
  select role into previous from public.profiles where id = target;

  update public.profiles
  set role = new_role,
      hidden_from_stats = (new_role = 'tester'),
      coins = case when new_role = 'tester' then greatest(coins, 1000000) else coins end,
      xp = case when new_role = 'tester' then greatest(xp, 250000) else xp end
  where id = target;

  if new_role = 'tester' then
    insert into public.inventory (user_id, item_id, quantity)
    select target, id, case when consumable then 99 else 1 end from public.shop_items
    on conflict (user_id, item_id) do nothing;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values (null, 'grant_role (sql)', target, jsonb_build_object('from', previous, 'to', new_role));
end;
$$;

revoke all on function private.grant_role(text, public.app_role) from public, anon, authenticated;

-- ---------- Catalog contents ----------

insert into public.achievements (id, metric, threshold, reward, icon, rarity, hidden, sort) values
  ('first_answer', 'answers', 1, 10, '🌱', 'common', false, 10),
  ('answers_100', 'answers', 100, 30, '💯', 'common', false, 11),
  ('answers_1000', 'answers', 1000, 100, '🔥', 'rare', false, 12),
  ('answers_5000', 'answers', 5000, 300, '🏆', 'epic', false, 13),
  ('correct_50', 'correct', 50, 20, '🎯', 'common', false, 20),
  ('correct_500', 'correct', 500, 80, '🏹', 'rare', false, 21),
  ('correct_2500', 'correct', 2500, 200, '🎖️', 'epic', false, 22),
  ('learned_10', 'learned', 10, 20, '📗', 'common', false, 30),
  ('learned_100', 'learned', 100, 100, '📚', 'rare', false, 31),
  ('learned_500', 'learned', 500, 300, '🧠', 'epic', false, 32),
  ('learned_1000', 'learned', 1000, 500, '🏛️', 'legendary', false, 33),
  ('streak_3', 'streak', 3, 15, '🔥', 'common', false, 40),
  ('streak_7', 'streak', 7, 40, '⚡', 'common', false, 41),
  ('streak_30', 'streak', 30, 150, '🌋', 'rare', false, 42),
  ('streak_100', 'streak', 100, 500, '☄️', 'epic', false, 43),
  ('streak_365', 'streak', 365, 2000, '👑', 'legendary', false, 44),
  ('goal_1', 'goal_days', 1, 10, '🥇', 'common', false, 50),
  ('goal_10', 'goal_days', 10, 50, '🗓️', 'common', false, 51),
  ('goal_50', 'goal_days', 50, 200, '🏅', 'rare', false, 52),
  ('modes_5', 'modes', 5, 30, '🧭', 'common', false, 60),
  ('modes_all', 'modes', 10, 100, '🌈', 'rare', false, 61),
  ('words_50', 'words', 50, 20, '✍️', 'common', false, 70),
  ('words_500', 'words', 500, 100, '🗂️', 'rare', false, 71),
  ('notion', 'notion', 1, 30, '🔗', 'common', false, 72),
  ('level_5', 'level', 5, 25, '⭐', 'common', false, 80),
  ('level_10', 'level', 10, 75, '🌟', 'rare', false, 81),
  ('level_25', 'level', 25, 200, '💫', 'epic', false, 82),
  ('level_50', 'level', 50, 500, '🌠', 'legendary', false, 83),
  ('night_owl', 'night', 1, 20, '🦉', 'rare', true, 90),
  ('early_bird', 'morning', 1, 20, '🐦', 'rare', true, 91);

insert into public.shop_items (id, kind, price, rarity, data, requires_achievement, consumable, sort) values
  -- Animated avatars
  ('avatar_fox', 'avatar', 150, 'common', '{"emoji": "🦊", "from": "#fb923c", "to": "#f43f5e", "motion": "bob"}', null, false, 10),
  ('avatar_panda', 'avatar', 150, 'common', '{"emoji": "🐼", "from": "#a3e635", "to": "#22c55e", "motion": "bob"}', null, false, 11),
  ('avatar_cat', 'avatar', 150, 'common', '{"emoji": "🐱", "from": "#fbbf24", "to": "#fb7185", "motion": "tilt"}', null, false, 12),
  ('avatar_penguin', 'avatar', 150, 'common', '{"emoji": "🐧", "from": "#38bdf8", "to": "#6366f1", "motion": "tilt"}', null, false, 13),
  ('avatar_owl', 'avatar', 300, 'rare', '{"emoji": "🦉", "from": "#8b5cf6", "to": "#0ea5e9", "motion": "tilt"}', null, false, 14),
  ('avatar_octopus', 'avatar', 300, 'rare', '{"emoji": "🐙", "from": "#f472b6", "to": "#a855f7", "motion": "wave"}', null, false, 15),
  ('avatar_lion', 'avatar', 300, 'rare', '{"emoji": "🦁", "from": "#f59e0b", "to": "#ef4444", "motion": "bob"}', null, false, 16),
  ('avatar_robot', 'avatar', 600, 'epic', '{"emoji": "🤖", "from": "#22d3ee", "to": "#6366f1", "motion": "glitch"}', null, false, 17),
  ('avatar_alien', 'avatar', 600, 'epic', '{"emoji": "👾", "from": "#a3e635", "to": "#8b5cf6", "motion": "glitch"}', null, false, 18),
  ('avatar_unicorn', 'avatar', 800, 'epic', '{"emoji": "🦄", "from": "#f0abfc", "to": "#818cf8", "motion": "wave"}', null, false, 19),
  ('avatar_dragon', 'avatar', 1500, 'legendary', '{"emoji": "🐲", "from": "#f97316", "to": "#7c3aed", "motion": "flame"}', null, false, 20),
  ('avatar_crown', 'avatar', 0, 'legendary', '{"emoji": "👑", "from": "#fde047", "to": "#f59e0b", "motion": "flame"}', 'streak_100', false, 21),
  -- Frames
  ('frame_gradient', 'frame', 100, 'common', '{"style": "gradient"}', null, false, 30),
  ('frame_sakura', 'frame', 300, 'rare', '{"style": "sakura"}', null, false, 31),
  ('frame_neon', 'frame', 250, 'rare', '{"style": "neon"}', null, false, 32),
  ('frame_gold', 'frame', 500, 'epic', '{"style": "gold"}', null, false, 33),
  ('frame_fire', 'frame', 600, 'epic', '{"style": "fire"}', null, false, 34),
  ('frame_rainbow', 'frame', 1200, 'legendary', '{"style": "rainbow"}', null, false, 35),
  -- Profile banners
  ('banner_sunset', 'banner', 150, 'common', '{"style": "sunset"}', null, false, 40),
  ('banner_aurora', 'banner', 120, 'common', '{"style": "aurora"}', null, false, 41),
  ('banner_ocean', 'banner', 250, 'rare', '{"style": "ocean"}', null, false, 42),
  ('banner_stars', 'banner', 300, 'rare', '{"style": "stars"}', null, false, 43),
  ('banner_matrix', 'banner', 500, 'epic', '{"style": "matrix"}', null, false, 44),
  ('banner_lava', 'banner', 550, 'epic', '{"style": "lava"}', null, false, 45),
  -- Premium themes
  ('theme_sakura', 'theme', 450, 'rare', '{"theme": "sakura"}', null, false, 50),
  ('theme_terminal', 'theme', 450, 'rare', '{"theme": "terminal"}', null, false, 51),
  ('theme_neon', 'theme', 700, 'epic', '{"theme": "neon"}', null, false, 52),
  ('theme_cosmos', 'theme', 700, 'epic', '{"theme": "cosmos"}', null, false, 53),
  -- Titles
  ('title_rookie', 'title', 100, 'common', '{}', null, false, 60),
  ('title_bookworm', 'title', 200, 'common', '{}', null, false, 61),
  ('title_wizard', 'title', 400, 'rare', '{}', null, false, 62),
  ('title_night_owl', 'title', 0, 'rare', '{}', 'night_owl', false, 63),
  ('title_unstoppable', 'title', 0, 'epic', '{}', 'streak_30', false, 64),
  ('title_all_rounder', 'title', 0, 'epic', '{}', 'modes_all', false, 65),
  ('title_dictionary', 'title', 0, 'epic', '{}', 'learned_500', false, 66),
  ('title_legend', 'title', 0, 'legendary', '{}', 'level_50', false, 67),
  -- Flashcard backs
  ('card_dots', 'card_back', 100, 'common', '{"style": "dots"}', null, false, 70),
  ('card_grid', 'card_back', 100, 'common', '{"style": "grid"}', null, false, 71),
  ('card_waves', 'card_back', 200, 'rare', '{"style": "waves"}', null, false, 72),
  ('card_confetti', 'card_back', 300, 'rare', '{"style": "confetti"}', null, false, 73),
  -- Answer sounds
  ('sound_soft', 'sound', 200, 'common', '{"pack": "soft"}', null, false, 80),
  ('sound_arcade', 'sound', 200, 'rare', '{"pack": "arcade"}', null, false, 81),
  ('sound_xylophone', 'sound', 300, 'rare', '{"pack": "xylophone"}', null, false, 82),
  -- Name colours (shown on the profile now, in chat later)
  ('color_violet', 'name_color', 150, 'common', '{"color": "#a78bfa"}', null, false, 90),
  ('color_cyan', 'name_color', 150, 'common', '{"color": "#22d3ee"}', null, false, 91),
  ('color_gold', 'name_color', 400, 'rare', '{"color": "#fbbf24"}', null, false, 92),
  ('color_gradient', 'name_color', 600, 'epic', '{"color": "gradient"}', null, false, 93),
  -- Boosts
  ('streak_freeze', 'boost', 200, 'rare', '{}', null, true, 100),
  ('double_xp', 'boost', 150, 'rare', '{"minutes": 15}', null, true, 101);
