-- Phase 5: live 1-on-1 duels, an ELO rating, coin stakes between friends and weekly tournaments.
--
-- Questions come from the starter decks, so both players face the same fair pool whatever is in
-- their own lists. The right answers never leave the server: the app gets four options, sends a
-- choice, and the server says whether it was right, timing every answer with its own clock.
-- Stakes are taken when a duel starts and paid out when it is settled, all inside the database.

-- ---------- Ratings and stats ----------

create table public.duel_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rating integer not null default 1000,
  best_rating integer not null default 1000,
  ranked_games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  tournament_wins integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.duel_stats enable row level security;
create policy "Signed-in users see duel stats" on public.duel_stats for select to authenticated using (true);
revoke all on public.duel_stats from anon, authenticated;
grant select on public.duel_stats to authenticated;

-- ---------- Duels ----------

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ranked', 'friendly', 'bot', 'tournament')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled', 'declined', 'expired')),
  level text not null default 'mix' check (level in ('a1', 'a2', 'b1', 'b2', 'mix')),
  -- The challenger, or whoever waited longer in the queue.
  player_a uuid not null references auth.users (id) on delete cascade,
  -- Nobody for a duel against the bot.
  player_b uuid references auth.users (id) on delete cascade,
  stake integer not null default 0 check (stake between 0 and 100),
  created_at timestamptz not null default now(),
  -- Live duels share one clock. Tournament duels: each player starts their own run before ends_at.
  starts_at timestamptz,
  ends_at timestamptz,
  a_started_at timestamptz,
  b_started_at timestamptz,
  a_answered smallint not null default 0,
  a_correct smallint not null default 0,
  a_time_ms integer not null default 0,
  b_answered smallint not null default 0,
  b_correct smallint not null default 0,
  b_time_ms integer not null default 0,
  -- The bot's run, decided up front: [{"ms": 3200, "correct": true}, …]
  bot_plan jsonb,
  outcome text check (outcome in ('a', 'b', 'draw')),
  a_rating_change integer,
  b_rating_change integer,
  finished_at timestamptz,
  rematch_of uuid references public.duels (id) on delete set null,
  check (player_b is null or player_b <> player_a),
  check ((kind = 'bot') = (player_b is null))
);

create index duels_a_idx on public.duels (player_a, created_at desc);
create index duels_b_idx on public.duels (player_b, created_at desc);
create index duels_open_idx on public.duels (status, ends_at) where status in ('waiting', 'active');

alter table public.duels enable row level security;
create policy "Players see their own duels" on public.duels for select to authenticated
  using ((select auth.uid()) in (player_a, player_b));
revoke all on public.duels from anon, authenticated;
grant select on public.duels to authenticated;

-- Opponents follow each other's progress live, and invites arrive the moment they're sent.
alter publication supabase_realtime add table public.duels;

-- The questions with their answers, and every answer given. Server only.
create table public.duel_questions (
  duel_id uuid not null references public.duels (id) on delete cascade,
  idx smallint not null check (idx between 0 and 9),
  word_id integer references public.deck_words (id) on delete set null,
  direction text not null check (direction in ('en_uk', 'uk_en')),
  prompt text not null,
  options text[] not null,
  answer smallint not null check (answer between 0 and 3),
  primary key (duel_id, idx)
);

create table public.duel_answers (
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  idx smallint not null,
  choice smallint not null,
  correct boolean not null,
  time_ms integer not null,
  answered_at timestamptz not null default now(),
  primary key (duel_id, user_id, idx)
);

-- People looking for a ranked opponent. The app re-calls duel_find every few seconds while it
-- waits; whoever stops calling drops out of the queue.
create table public.duel_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rating integer not null,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

alter table public.duel_questions enable row level security;
alter table public.duel_answers enable row level security;
alter table public.duel_queue enable row level security;
revoke all on public.duel_questions, public.duel_answers, public.duel_queue from anon, authenticated;

-- ---------- Achievements ----------

insert into public.achievements (id, metric, threshold, reward, icon, rarity, hidden, sort) values
  ('duel_win_1', 'duels', 1, 20, '⚔️', 'common', false, 100),
  ('duel_win_10', 'duels', 10, 60, '🗡️', 'rare', false, 101),
  ('duel_win_50', 'duels', 50, 200, '🛡️', 'epic', false, 102),
  ('rating_1200', 'rating', 1200, 100, '📈', 'rare', false, 103),
  ('tournament_win', 'tournaments', 1, 150, '🏆', 'epic', false, 104);

-- ---------- Helpers ----------

-- Signed in and not banned.
create function private.duel_check_player(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'sign_in_first';
  end if;
  if exists (select 1 from private.restriction(p_user) r where r.kind = 'ban') then
    raise exception 'banned';
  end if;
end;
$$;

-- Sixty new duels an hour is plenty for a person and keeps the tables small.
create function private.duel_rate_limit(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.duels where player_a = p_user and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many_duels';
  end if;
end;
$$;

-- In a live duel (or about to start one) right now.
create function private.duel_busy(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.duels d
    where p_user in (d.player_a, d.player_b) and d.kind <> 'tournament' and d.status = 'active' and d.ends_at > now()
  );
$$;

create function private.duel_pay(p_user uuid, p_amount integer, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set coins = coins + p_amount where id = p_user;
  insert into public.coin_ledger (user_id, amount, reason) values (p_user, p_amount, p_reason);
$$;

create function private.duel_take_stake(p_user uuid, p_stake integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_stake <= 0 then
    return;
  end if;
  update public.profiles set coins = coins - p_stake where id = p_user and coins >= p_stake;
  if not found then
    raise exception '%', p_error;
  end if;
  insert into public.coin_ledger (user_id, amount, reason) values (p_user, -p_stake, 'duel_stake');
end;
$$;

-- Ten questions from the starter decks: the word or its translation, and four options taken from
-- the same deck, so the wrong ones look plausible.
create function private.duel_make_questions(p_duel uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  i integer := 0;
  to_uk boolean;
  right_text text;
  wrong text[];
  pos integer;
begin
  for q in
    select d.id, d.word, d.translation, d.deck
    from public.deck_words d
    where p_level = 'mix' or d.deck = p_level
    order by random()
    limit 10
  loop
    to_uk := random() < 0.5;
    right_text := case when to_uk then q.translation else q.word end;
    select array_agg(x.t) into wrong
    from (
      select y.t from (
        select distinct case when to_uk then d.translation else d.word end as t
        from public.deck_words d
        where d.id <> q.id and d.deck = q.deck
      ) y
      where y.t <> right_text
      order by random()
      limit 3
    ) x;
    pos := floor(random() * 4)::integer;
    insert into public.duel_questions (duel_id, idx, word_id, direction, prompt, options, answer)
    values (
      p_duel, i, q.id, case when to_uk then 'en_uk' else 'uk_en' end,
      case when to_uk then q.word else q.translation end,
      wrong[1:pos] || right_text || wrong[pos + 1:3],
      pos
    );
    i := i + 1;
  end loop;
end;
$$;

-- The bot's answers: a little sharper on easier decks, two to six and a half seconds each.
create function private.duel_bot_plan(p_level text)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
    'ms', 2200 + floor(random() * 4300)::integer,
    'correct', random() < case p_level when 'a1' then 0.85 when 'a2' then 0.78 when 'b1' then 0.7 when 'b2' then 0.62 else 0.72 end
  ))
  from generate_series(1, 10);
$$;

-- Three seconds to get ready, then fifteen seconds a question.
create function private.duel_start_live(p_duel uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.duel_make_questions(p_duel, p_level);
  update public.duels
  set status = 'active', starts_at = now() + interval '3 seconds', ends_at = now() + interval '153 seconds'
  where id = p_duel;
end;
$$;

create function private.duel_award(p_user uuid, p_achievement text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prize integer;
begin
  insert into public.user_achievements (user_id, achievement_id) values (p_user, p_achievement) on conflict do nothing;
  if found then
    select reward into prize from public.achievements where id = p_achievement;
    if coalesce(prize, 0) > 0 then
      perform private.duel_pay(p_user, prize, 'achievements');
    end if;
  end if;
end;
$$;

create function private.duel_check_achievements(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.duel_stats;
begin
  select * into s from public.duel_stats where user_id = p_user;
  if s.user_id is null then
    return;
  end if;
  if s.wins >= 1 then perform private.duel_award(p_user, 'duel_win_1'); end if;
  if s.wins >= 10 then perform private.duel_award(p_user, 'duel_win_10'); end if;
  if s.wins >= 50 then perform private.duel_award(p_user, 'duel_win_50'); end if;
  if s.best_rating >= 1200 then perform private.duel_award(p_user, 'rating_1200'); end if;
  if s.tournament_wins >= 1 then perform private.duel_award(p_user, 'tournament_win'); end if;
end;
$$;

-- Decides a duel and pays out. More right answers wins; a tie goes to the faster player, with
-- every unanswered question counted as fifteen seconds.
create function private.duel_settle(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  b_correct_n integer;
  b_answered_n integer;
  b_time integer;
  a_eff bigint;
  b_eff bigint;
  result text;
  ra integer;
  rb integer;
  ka integer;
  kb integer;
  ea double precision;
  sa double precision;
  change_a integer;
  change_b integer;
  winner uuid;
  wins_today integer;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status <> 'active' then
    return;
  end if;

  if d.kind = 'bot' then
    select count(*) filter (where (e->>'correct')::boolean), coalesce(sum((e->>'ms')::integer), 0)
    into b_correct_n, b_time
    from jsonb_array_elements(d.bot_plan) e;
    b_answered_n := 10;
  else
    b_correct_n := d.b_correct;
    b_answered_n := d.b_answered;
    b_time := d.b_time_ms;
  end if;

  a_eff := d.a_time_ms + (10 - d.a_answered) * 15000;
  b_eff := b_time + (10 - b_answered_n) * 15000;
  result := case
    when d.a_answered = 0 and b_answered_n = 0 then 'draw'
    when d.a_correct > b_correct_n then 'a'
    when d.a_correct < b_correct_n then 'b'
    when a_eff < b_eff then 'a'
    when a_eff > b_eff then 'b'
    else 'draw'
  end;

  update public.duels
  set status = 'finished', outcome = result, finished_at = now(),
    b_answered = b_answered_n, b_correct = b_correct_n, b_time_ms = b_time
  where id = p_duel;

  if d.kind = 'bot' then
    return;
  end if;

  insert into public.duel_stats (user_id) values (d.player_a), (d.player_b) on conflict do nothing;
  update public.duel_stats s
  set
    wins = s.wins + (case when (result = 'a' and s.user_id = d.player_a) or (result = 'b' and s.user_id = d.player_b) then 1 else 0 end),
    losses = s.losses + (case when (result = 'b' and s.user_id = d.player_a) or (result = 'a' and s.user_id = d.player_b) then 1 else 0 end),
    draws = s.draws + (case when result = 'draw' then 1 else 0 end),
    updated_at = now()
  where s.user_id in (d.player_a, d.player_b);

  if d.kind = 'ranked' then
    select rating, case when ranked_games < 10 then 40 else 32 end into ra, ka from public.duel_stats where user_id = d.player_a for update;
    select rating, case when ranked_games < 10 then 40 else 32 end into rb, kb from public.duel_stats where user_id = d.player_b for update;
    ea := 1 / (1 + power(10, (rb - ra) / 400.0));
    sa := case result when 'a' then 1 when 'b' then 0 else 0.5 end;
    change_a := round(ka * (sa - ea));
    change_b := round(kb * (ea - sa));
    update public.duel_stats
    set rating = greatest(100, rating + change_a), best_rating = greatest(best_rating, rating + change_a), ranked_games = ranked_games + 1
    where user_id = d.player_a;
    update public.duel_stats
    set rating = greatest(100, rating + change_b), best_rating = greatest(best_rating, rating + change_b), ranked_games = ranked_games + 1
    where user_id = d.player_b;
    update public.duels set a_rating_change = change_a, b_rating_change = change_b where id = p_duel;

    -- A ranked win pays 10 coins, for up to ten wins a day.
    if result <> 'draw' then
      winner := case when result = 'a' then d.player_a else d.player_b end;
      select count(*) into wins_today from public.coin_ledger
      where user_id = winner and reason = 'duel_win' and created_at > now() - interval '1 day';
      if wins_today < 10 then
        perform private.duel_pay(winner, 10, 'duel_win');
      end if;
    end if;
  elsif d.kind = 'friendly' and d.stake > 0 then
    if result = 'draw' then
      perform private.duel_pay(d.player_a, d.stake, 'duel_refund');
      perform private.duel_pay(d.player_b, d.stake, 'duel_refund');
    else
      perform private.duel_pay(case when result = 'a' then d.player_a else d.player_b end, d.stake * 2, 'duel_pot');
    end if;
  elsif d.kind = 'tournament' then
    perform private.tournament_match_done(p_duel, result);
  end if;

  perform private.duel_check_achievements(d.player_a);
  perform private.duel_check_achievements(d.player_b);
end;
$$;

-- A friendly challenge (or a rematch). It waits two minutes for an answer; coins are taken only
-- when it's accepted.
create function private.duel_invite(p_from uuid, p_to uuid, p_stake integer, p_level text, p_rematch_of uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_stake is null or p_stake < 0 or p_stake > 100 then
    raise exception 'bad_stake';
  end if;
  if p_level not in ('a1', 'a2', 'b1', 'b2', 'mix') then
    raise exception 'bad_level';
  end if;
  if (select coins from public.profiles where id = p_from) < p_stake then
    raise exception 'not_enough_coins';
  end if;
  perform private.duel_rate_limit(p_from);
  -- One open invite per pair: a new one replaces the old.
  update public.duels set status = 'cancelled'
  where kind = 'friendly' and status = 'waiting' and player_a = p_from and player_b = p_to;
  if (select count(*) from public.duels where player_a = p_from and status = 'waiting' and created_at > now() - interval '2 minutes') >= 5 then
    raise exception 'too_many_invites';
  end if;
  insert into public.duels (kind, status, level, player_a, player_b, stake, rematch_of)
  values ('friendly', 'waiting', p_level, p_from, p_to, p_stake, p_rematch_of)
  returning id into new_id;
  return new_id;
end;
$$;

create function private.duel_new_bot(p_user uuid, p_level text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_level not in ('a1', 'a2', 'b1', 'b2', 'mix') then
    raise exception 'bad_level';
  end if;
  if private.duel_busy(p_user) then
    raise exception 'already_in_duel';
  end if;
  perform private.duel_rate_limit(p_user);
  insert into public.duels (kind, status, level, player_a, bot_plan)
  values ('bot', 'waiting', p_level, p_user, private.duel_bot_plan(p_level))
  returning id into new_id;
  perform private.duel_start_live(new_id, p_level);
  return new_id;
end;
$$;

-- ---------- Playing ----------

create function public.duel_challenge(p_user uuid, p_stake integer default 0, p_level text default 'mix')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  perform private.duel_check_player(uid);
  if p_user is null or p_user = uid then
    raise exception 'bad_opponent';
  end if;
  if not private.are_friends(uid, p_user) then
    raise exception 'friends_only';
  end if;
  return private.duel_invite(uid, p_user, p_stake, p_level, null);
end;
$$;

create function public.duel_respond(p_duel uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.duels;
begin
  perform private.duel_check_player(uid);
  select * into d from public.duels where id = p_duel for update;
  if not found or d.player_b is distinct from uid or d.status <> 'waiting' then
    raise exception 'no_such_invite';
  end if;
  if d.created_at < now() - interval '2 minutes' then
    update public.duels set status = 'expired' where id = p_duel;
    raise exception 'invite_expired';
  end if;
  if not p_accept then
    update public.duels set status = 'declined' where id = p_duel;
    return;
  end if;
  if private.duel_busy(uid) or private.duel_busy(d.player_a) then
    raise exception 'already_in_duel';
  end if;
  perform private.duel_take_stake(d.player_a, d.stake, 'opponent_not_enough_coins');
  perform private.duel_take_stake(uid, d.stake, 'not_enough_coins');
  perform private.duel_start_live(p_duel, d.level);
end;
$$;

create function public.duel_cancel(p_duel uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.duels set status = 'cancelled'
  where id = p_duel and player_a = (select auth.uid()) and status = 'waiting';
$$;

-- Ranked matchmaking. Returns the duel once there's an opponent, or null while still waiting.
-- The rating window widens by ten points for every second someone has waited.
create function public.duel_find()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  my_rating integer;
  other uuid;
  found_id uuid;
begin
  perform private.duel_check_player(uid);

  -- Someone from the queue may already have started a duel with us.
  select d.id into found_id from public.duels d
  where d.kind = 'ranked' and d.status = 'active' and uid in (d.player_a, d.player_b) and d.ends_at > now()
  order by d.created_at desc limit 1;
  if found_id is not null then
    delete from public.duel_queue where user_id = uid;
    return found_id;
  end if;
  if private.duel_busy(uid) then
    raise exception 'already_in_duel';
  end if;

  insert into public.duel_stats (user_id) values (uid) on conflict do nothing;
  select rating into my_rating from public.duel_stats where user_id = uid;

  select q.user_id into other from public.duel_queue q
  where q.user_id <> uid
    and q.seen_at > now() - interval '15 seconds'
    and abs(q.rating - my_rating) <= 200 + 10 * extract(epoch from now() - q.joined_at)::integer
    and not private.duel_busy(q.user_id)
  order by q.joined_at
  limit 1
  for update skip locked;

  if other is not null then
    perform private.duel_rate_limit(uid);
    delete from public.duel_queue where user_id in (uid, other);
    insert into public.duels (kind, status, level, player_a, player_b)
    values ('ranked', 'waiting', 'mix', other, uid)
    returning id into found_id;
    perform private.duel_start_live(found_id, 'mix');
    return found_id;
  end if;

  insert into public.duel_queue (user_id, rating) values (uid, my_rating)
  on conflict (user_id) do update set seen_at = now(), rating = excluded.rating;
  return null;
end;
$$;

create function public.duel_leave_queue()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.duel_queue where user_id = (select auth.uid());
$$;

create function public.duel_vs_bot(p_level text default 'mix')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  perform private.duel_check_player(uid);
  return private.duel_new_bot(uid, p_level);
end;
$$;

-- One more round with the same opponent: a new invite for people, a new duel for the bot.
create function public.duel_rematch(p_duel uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.duels;
begin
  perform private.duel_check_player(uid);
  select * into d from public.duels where id = p_duel;
  if not found or uid not in (d.player_a, coalesce(d.player_b, d.player_a)) or d.status <> 'finished' or d.kind = 'tournament' then
    raise exception 'no_such_duel';
  end if;
  if d.kind = 'bot' then
    return private.duel_new_bot(uid, d.level);
  end if;
  return private.duel_invite(
    uid,
    case when uid = d.player_a then d.player_b else d.player_a end,
    case when d.kind = 'friendly' then d.stake else 0 end,
    d.level,
    p_duel
  );
end;
$$;

-- A tournament duel is played whenever each player likes during the round: this starts the
-- caller's own run of 150 seconds.
create function public.duel_begin(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.duels;
begin
  perform private.duel_check_player(uid);
  select * into d from public.duels where id = p_duel for update;
  if not found or d.kind <> 'tournament' or d.status <> 'active' or uid not in (d.player_a, d.player_b) then
    raise exception 'no_such_duel';
  end if;
  if now() >= d.ends_at then
    raise exception 'duel_time_up';
  end if;
  if uid = d.player_a and d.a_started_at is null then
    update public.duels set a_started_at = now() + interval '3 seconds' where id = p_duel;
  elsif uid = d.player_b and d.b_started_at is null then
    update public.duels set b_started_at = now() + interval '3 seconds' where id = p_duel;
  end if;
end;
$$;

create function public.duel_answer(p_duel uuid, p_idx integer, p_choice integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.duels;
  q public.duel_questions;
  side text;
  started timestamptz;
  deadline timestamptz;
  last_at timestamptz;
  done integer;
  spent integer;
  is_right boolean;
begin
  select * into d from public.duels where id = p_duel for update;
  side := case when uid = d.player_a then 'a' when uid = d.player_b then 'b' end;
  if d.id is null or side is null then
    raise exception 'no_such_duel';
  end if;
  if d.status <> 'active' then
    raise exception 'duel_not_active';
  end if;

  if d.kind = 'tournament' then
    started := case side when 'a' then d.a_started_at else d.b_started_at end;
    if started is null then
      raise exception 'duel_not_started';
    end if;
    deadline := least(started + interval '150 seconds', d.ends_at);
  else
    started := d.starts_at;
    deadline := d.ends_at;
  end if;
  if now() < started then
    raise exception 'duel_not_started';
  end if;
  if now() > deadline + interval '2 seconds' then
    raise exception 'duel_time_up';
  end if;

  -- Questions go in order, each once.
  done := case side when 'a' then d.a_answered else d.b_answered end;
  if p_idx is distinct from done then
    raise exception 'wrong_question';
  end if;
  select * into q from public.duel_questions where duel_id = p_duel and idx = p_idx;
  if not found then
    raise exception 'wrong_question';
  end if;

  select max(answered_at) into last_at from public.duel_answers where duel_id = p_duel and user_id = uid;
  spent := least(15000, greatest(0, (extract(epoch from now() - coalesce(last_at, started)) * 1000)::integer));
  is_right := p_choice = q.answer;
  insert into public.duel_answers (duel_id, user_id, idx, choice, correct, time_ms)
  values (p_duel, uid, p_idx, coalesce(p_choice, -1), is_right, spent);

  if side = 'a' then
    update public.duels
    set a_answered = a_answered + 1, a_correct = a_correct + is_right::integer, a_time_ms = a_time_ms + spent
    where id = p_duel
    returning * into d;
  else
    update public.duels
    set b_answered = b_answered + 1, b_correct = b_correct + is_right::integer, b_time_ms = b_time_ms + spent
    where id = p_duel
    returning * into d;
  end if;

  if d.a_answered >= 10 and (d.kind = 'bot' or d.b_answered >= 10) then
    perform private.duel_settle(p_duel);
  end if;
  return jsonb_build_object('correct', is_right, 'answer', q.answer);
end;
$$;

-- Everything the duel screen needs, from the caller's side. Questions appear once the caller's
-- clock has started; right answers only for questions already answered, or after the end.
create function public.duel_state(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d public.duels;
  side text;
  opponent uuid;
  started timestamptz;
  deadline timestamptz;
  questions jsonb;
begin
  select * into d from public.duels where id = p_duel;
  side := case when uid = d.player_a then 'a' when uid = d.player_b then 'b' end;
  if d.id is null or side is null then
    raise exception 'no_such_duel';
  end if;

  -- Past the deadline: decide it now rather than wait for the minute job.
  if d.status = 'active' and now() > d.ends_at + interval '2 seconds' then
    perform private.duel_settle(p_duel);
  end if;
  if d.status = 'waiting' and d.created_at < now() - interval '2 minutes' then
    update public.duels set status = 'expired' where id = p_duel and status = 'waiting';
  end if;
  select * into d from public.duels where id = p_duel;

  opponent := case side when 'a' then d.player_b else d.player_a end;
  if d.kind = 'tournament' then
    started := case side when 'a' then d.a_started_at else d.b_started_at end;
    deadline := case when started is null then d.ends_at else least(started + interval '150 seconds', d.ends_at) end;
  else
    started := d.starts_at;
    deadline := d.ends_at;
  end if;

  if d.status in ('active', 'finished') and started is not null and now() >= started then
    select jsonb_agg(jsonb_build_object(
      'idx', q.idx, 'prompt', q.prompt, 'options', q.options, 'direction', q.direction,
      'answer', case when d.status = 'finished' or a.idx is not null then q.answer end
    ) order by q.idx)
    into questions
    from public.duel_questions q
    left join public.duel_answers a on a.duel_id = q.duel_id and a.user_id = uid and a.idx = q.idx
    where q.duel_id = p_duel;
  end if;

  return jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'status', d.status, 'level', d.level, 'stake', d.stake,
    'side', side, 'now', now(), 'created_at', d.created_at,
    'starts_at', started, 'ends_at', deadline, 'round_ends_at', d.ends_at,
    'outcome', case
      when d.outcome is null then null
      when d.outcome = 'draw' then 'draw'
      when d.outcome = side then 'win'
      else 'loss'
    end,
    'rating_change', case side when 'a' then d.a_rating_change else d.b_rating_change end,
    'me', jsonb_build_object(
      'user', private.public_card(uid),
      'answered', case side when 'a' then d.a_answered else d.b_answered end,
      'correct', case side when 'a' then d.a_correct else d.b_correct end,
      'time_ms', case side when 'a' then d.a_time_ms else d.b_time_ms end,
      'rating', (select rating from public.duel_stats where user_id = uid)
    ),
    'opponent', jsonb_build_object(
      'user', case when opponent is null then null else private.public_card(opponent) end,
      'answered', case side when 'a' then d.b_answered else d.a_answered end,
      'correct', case side when 'a' then d.b_correct else d.a_correct end,
      'time_ms', case side when 'a' then d.b_time_ms else d.a_time_ms end,
      'rating', case when opponent is null then null else (select rating from public.duel_stats where user_id = opponent) end,
      'started', case when d.kind = 'tournament' then (case side when 'a' then d.b_started_at else d.a_started_at end) is not null end
    ),
    'bot_plan', d.bot_plan,
    'questions', questions,
    'my_answers', (
      select coalesce(jsonb_agg(jsonb_build_object('idx', a.idx, 'choice', a.choice, 'correct', a.correct) order by a.idx), '[]')
      from public.duel_answers a where a.duel_id = p_duel and a.user_id = uid
    ),
    'rematch_of', d.rematch_of
  );
end;
$$;

-- ---------- Weekly tournaments ----------
--
-- Monday to Wednesday (UTC): sign up, free, up to 64 players. Wednesday 00:00 the bracket is
-- drawn by rating, with byes for the top seeds. Each round lasts until everyone in it has played
-- or its time is up (the rounds share the five days to Monday); each match is a duel on the same
-- ten questions that both players take whenever they like. A missed match is lost; if neither
-- plays, the higher seed goes through. Prizes: 300, 150 and 75 coins.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'registration' check (status in ('registration', 'running', 'finished')),
  registration_ends_at timestamptz not null,
  ends_at timestamptz not null,
  rounds smallint,
  current_round smallint not null default 0,
  round_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tournament_players (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null,
  seed integer,
  eliminated_round smallint,
  place integer,
  prize integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round smallint not null,
  slot integer not null,
  player_a uuid references auth.users (id) on delete set null,
  player_b uuid references auth.users (id) on delete set null,
  duel_id uuid references public.duels (id) on delete set null,
  winner uuid references auth.users (id) on delete set null,
  unique (tournament_id, round, slot)
);

create index tournament_matches_duel_idx on public.tournament_matches (duel_id);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;
create policy "Signed-in users see tournaments" on public.tournaments for select to authenticated using (true);
revoke all on public.tournaments, public.tournament_players, public.tournament_matches from anon, authenticated;
grant select on public.tournaments to authenticated;

create function private.tournament_ensure()
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  w date := date_trunc('week', now() at time zone 'UTC')::date;
  t public.tournaments;
begin
  insert into public.tournaments (week_start, registration_ends_at, ends_at)
  values (w, (w + 2)::timestamp at time zone 'UTC', (w + 7)::timestamp at time zone 'UTC')
  on conflict (week_start) do nothing;
  select * into t from public.tournaments where week_start = w;
  return t;
end;
$$;

-- Bracket positions for a power-of-two size, so seed 1 and seed 2 can only meet in the final.
create function private.bracket_order(p_size integer)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  result integer[] := array[1, 2];
  next_order integer[];
  s integer;
  n integer := 2;
begin
  while n < p_size loop
    n := n * 2;
    next_order := '{}';
    foreach s in array result loop
      next_order := next_order || s || (n + 1 - s);
    end loop;
    result := next_order;
  end loop;
  return result;
end;
$$;

-- A match between two players: a duel both take in their own time before the round ends. With
-- one player missing it's a bye and they go straight through.
create function private.tournament_open_match(p_tournament uuid, p_round integer, p_slot integer, p_a uuid, p_b uuid, p_round_end timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_duel uuid;
begin
  if p_a is null or p_b is null then
    insert into public.tournament_matches (tournament_id, round, slot, player_a, player_b, winner)
    values (p_tournament, p_round, p_slot, p_a, p_b, coalesce(p_a, p_b));
    return;
  end if;
  insert into public.duels (kind, status, level, player_a, player_b, ends_at)
  values ('tournament', 'active', 'mix', p_a, p_b, p_round_end)
  returning id into new_duel;
  perform private.duel_make_questions(new_duel, 'mix');
  insert into public.tournament_matches (tournament_id, round, slot, player_a, player_b, duel_id)
  values (p_tournament, p_round, p_slot, p_a, p_b, new_duel);
end;
$$;

create function private.tournament_start(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tournaments;
  n integer;
  size integer := 2;
  total_rounds integer := 1;
  positions integer[];
  round_end timestamptz;
  k integer;
  seed_a integer;
  seed_b integer;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if t.status <> 'registration' then
    return;
  end if;

  -- Seeds by rating at sign-up, earlier sign-ups first on a tie.
  update public.tournament_players p set seed = x.seed
  from (
    select user_id, row_number() over (order by rating desc, joined_at) as seed
    from public.tournament_players where tournament_id = p_tournament
  ) x
  where p.tournament_id = p_tournament and p.user_id = x.user_id;
  select count(*) into n from public.tournament_players where tournament_id = p_tournament;

  if n < 2 then
    update public.tournaments set status = 'finished', rounds = 0 where id = p_tournament;
    update public.tournament_players set place = 1 where tournament_id = p_tournament;
    return;
  end if;

  while size < n loop
    size := size * 2;
    total_rounds := total_rounds + 1;
  end loop;
  positions := private.bracket_order(size);
  round_end := least(now() + (t.ends_at - now()) / total_rounds, t.ends_at);

  for k in 0 .. size / 2 - 1 loop
    seed_a := positions[2 * k + 1];
    seed_b := positions[2 * k + 2];
    perform private.tournament_open_match(
      p_tournament, 1, k,
      (select user_id from public.tournament_players where tournament_id = p_tournament and seed = seed_a),
      (select user_id from public.tournament_players where tournament_id = p_tournament and seed = seed_b),
      round_end
    );
  end loop;

  update public.tournaments
  set status = 'running', rounds = total_rounds, current_round = 1, round_ends_at = round_end
  where id = p_tournament;
end;
$$;

-- Called when a tournament duel is decided. A draw goes to the higher seed.
create function private.tournament_match_done(p_duel uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.tournament_matches;
  seed_a integer;
  seed_b integer;
begin
  select * into m from public.tournament_matches where duel_id = p_duel for update;
  if not found or m.winner is not null then
    return;
  end if;
  if p_result = 'draw' then
    select seed into seed_a from public.tournament_players where tournament_id = m.tournament_id and user_id = m.player_a;
    select seed into seed_b from public.tournament_players where tournament_id = m.tournament_id and user_id = m.player_b;
    update public.tournament_matches set winner = case when coalesce(seed_a, 999) <= coalesce(seed_b, 999) then m.player_a else m.player_b end where id = m.id;
  else
    update public.tournament_matches set winner = case when p_result = 'a' then m.player_a else m.player_b end where id = m.id;
  end if;
end;
$$;

-- Closes the current round (deciding any match still open) and opens the next, or ends the
-- tournament and pays the prizes.
create function private.tournament_advance(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tournaments;
  m record;
  winners uuid[];
  final_match public.tournament_matches;
  round_end timestamptz;
  rounds_left integer;
  k integer;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if t.status <> 'running' then
    return;
  end if;

  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament and round = t.current_round and winner is null and duel_id is not null
  loop
    perform private.duel_settle(m.duel_id);
  end loop;

  -- The losers of this round are out.
  update public.tournament_players p
  set eliminated_round = t.current_round
  from public.tournament_matches tm
  where tm.tournament_id = p_tournament and tm.round = t.current_round and tm.winner is not null
    and p.tournament_id = p_tournament and p.user_id in (tm.player_a, tm.player_b) and p.user_id <> tm.winner;

  select array_agg(winner order by slot) into winners
  from public.tournament_matches where tournament_id = p_tournament and round = t.current_round;

  if coalesce(array_length(winners, 1), 0) <= 1 then
    select * into final_match from public.tournament_matches
    where tournament_id = p_tournament and round = t.current_round order by slot limit 1;
    -- Places: 1 the champion, 2 the finalist, 3 both semi-finalists.
    update public.tournament_players set place = 1, prize = 300 where tournament_id = p_tournament and user_id = final_match.winner;
    update public.tournament_players set place = 2, prize = 150
    where tournament_id = p_tournament and eliminated_round = t.current_round;
    if t.current_round >= 2 then
      update public.tournament_players set place = 3, prize = 75
      where tournament_id = p_tournament and eliminated_round = t.current_round - 1;
    end if;
    for m in select user_id, prize from public.tournament_players where tournament_id = p_tournament and prize > 0 loop
      perform private.duel_pay(m.user_id, m.prize, 'tournament');
    end loop;
    if final_match.winner is not null then
      insert into public.duel_stats (user_id) values (final_match.winner) on conflict do nothing;
      update public.duel_stats set tournament_wins = tournament_wins + 1 where user_id = final_match.winner;
      perform private.duel_check_achievements(final_match.winner);
    end if;
    update public.tournaments set status = 'finished', round_ends_at = now() where id = p_tournament;
    return;
  end if;

  rounds_left := greatest(1, t.rounds - t.current_round);
  round_end := least(now() + (t.ends_at - now()) / rounds_left, t.ends_at);
  for k in 0 .. array_length(winners, 1) / 2 - 1 loop
    perform private.tournament_open_match(p_tournament, t.current_round + 1, k, winners[2 * k + 1], winners[2 * k + 2], round_end);
  end loop;
  update public.tournaments set current_round = current_round + 1, round_ends_at = round_end where id = p_tournament;
end;
$$;

create function private.tournament_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tournaments;
begin
  perform private.tournament_ensure();
  for t in select * from public.tournaments where status in ('registration', 'running') loop
    if t.status = 'registration' and now() >= t.registration_ends_at then
      perform private.tournament_start(t.id);
    elsif t.status = 'running' and (
      now() >= t.round_ends_at
      or not exists (
        select 1 from public.tournament_matches
        where tournament_id = t.id and round = t.current_round and winner is null
      )
    ) then
      perform private.tournament_advance(t.id);
    end if;
  end loop;
end;
$$;

create function public.tournament_join()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.tournaments;
begin
  perform private.duel_check_player(uid);
  t := private.tournament_ensure();
  if t.status <> 'registration' or now() >= t.registration_ends_at then
    raise exception 'registration_closed';
  end if;
  perform pg_advisory_xact_lock(hashtext('tournament:' || t.id::text));
  if (select count(*) from public.tournament_players where tournament_id = t.id) >= 64 then
    raise exception 'tournament_full';
  end if;
  insert into public.duel_stats (user_id) values (uid) on conflict do nothing;
  insert into public.tournament_players (tournament_id, user_id, rating)
  values (t.id, uid, (select rating from public.duel_stats where user_id = uid))
  on conflict do nothing;
end;
$$;

create function public.tournament_leave()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tournaments;
begin
  t := private.tournament_ensure();
  if t.status <> 'registration' then
    raise exception 'registration_closed';
  end if;
  delete from public.tournament_players where tournament_id = t.id and user_id = (select auth.uid());
end;
$$;

-- The current tournament (or the one that just ended), with everyone's cards and the bracket.
create function public.tournament_bracket()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.tournaments;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  t := private.tournament_ensure();
  return jsonb_build_object(
    'id', t.id,
    'week_start', t.week_start,
    'status', t.status,
    'registration_ends_at', t.registration_ends_at,
    'ends_at', t.ends_at,
    'rounds', t.rounds,
    'current_round', t.current_round,
    'round_ends_at', t.round_ends_at,
    'now', now(),
    'joined', exists (select 1 from public.tournament_players where tournament_id = t.id and user_id = uid),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user', private.public_card(p.user_id), 'rating', p.rating, 'seed', p.seed, 'place', p.place,
        'prize', p.prize, 'eliminated_round', p.eliminated_round, 'me', p.user_id = uid
      ) order by p.seed nulls last, p.rating desc), '[]')
      from public.tournament_players p where p.tournament_id = t.id
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'round', m.round, 'slot', m.slot, 'a', m.player_a, 'b', m.player_b, 'winner', m.winner,
        'duel_id', case when uid in (m.player_a, m.player_b) then m.duel_id end,
        'a_correct', d.a_correct, 'b_correct', d.b_correct,
        'a_done', d.a_answered >= 10 or d.status = 'finished', 'b_done', d.b_answered >= 10 or d.status = 'finished'
      ) order by m.round, m.slot), '[]')
      from public.tournament_matches m
      left join public.duels d on d.id = m.duel_id
      where m.tournament_id = t.id
    ),
    'last', (
      select jsonb_build_object(
        'week_start', lt.week_start,
        'podium', (
          select coalesce(jsonb_agg(jsonb_build_object('user', private.public_card(p.user_id), 'place', p.place, 'prize', p.prize) order by p.place), '[]')
          from public.tournament_players p where p.tournament_id = lt.id and p.place is not null and p.place <= 3
        )
      )
      from public.tournaments lt
      where lt.week_start < t.week_start and lt.status = 'finished'
      order by lt.week_start desc limit 1
    )
  );
end;
$$;

-- ---------- The duels tab ----------

create function public.duel_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.duel_stats;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  select * into s from public.duel_stats where user_id = uid;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'rating', coalesce(s.rating, 1000), 'best_rating', coalesce(s.best_rating, 1000),
      'ranked_games', coalesce(s.ranked_games, 0), 'wins', coalesce(s.wins, 0),
      'losses', coalesce(s.losses, 0), 'draws', coalesce(s.draws, 0), 'tournament_wins', coalesce(s.tournament_wins, 0),
      'rank', case when coalesce(s.ranked_games, 0) = 0 then null else (
        select count(*) + 1 from public.duel_stats o where o.ranked_games > 0 and o.rating > s.rating
      ) end
    ),
    'queued', exists (select 1 from public.duel_queue where user_id = uid and seen_at > now() - interval '15 seconds'),
    'active', (
      select d.id from public.duels d
      where uid in (d.player_a, d.player_b) and d.kind <> 'tournament' and d.status = 'active' and d.ends_at > now()
      order by d.created_at desc limit 1
    ),
    'incoming', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'user', private.public_card(d.player_a), 'stake', d.stake, 'level', d.level,
        'created_at', d.created_at, 'rematch', d.rematch_of is not null
      ) order by d.created_at desc), '[]')
      from public.duels d
      where d.player_b = uid and d.status = 'waiting' and d.created_at > now() - interval '2 minutes'
    ),
    'outgoing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'user', private.public_card(d.player_b), 'stake', d.stake, 'level', d.level, 'created_at', d.created_at
      ) order by d.created_at desc), '[]')
      from public.duels d
      where d.player_a = uid and d.status = 'waiting' and d.kind = 'friendly' and d.created_at > now() - interval '2 minutes'
    ),
    'recent', (
      select coalesce(jsonb_agg(x.item order by x.finished_at desc), '[]')
      from (
        select d.finished_at, jsonb_build_object(
          'id', d.id, 'kind', d.kind, 'stake', d.stake, 'finished_at', d.finished_at,
          'opponent', case
            when d.kind = 'bot' then null
            else private.public_card(case when d.player_a = uid then d.player_b else d.player_a end)
          end,
          'outcome', case when d.outcome = 'draw' then 'draw' when (d.outcome = 'a') = (d.player_a = uid) then 'win' else 'loss' end,
          'my_correct', case when d.player_a = uid then d.a_correct else d.b_correct end,
          'their_correct', case when d.player_a = uid then d.b_correct else d.a_correct end,
          'rating_change', case when d.player_a = uid then d.a_rating_change else d.b_rating_change end
        ) as item
        from public.duels d
        where uid in (d.player_a, d.player_b) and d.status = 'finished'
        order by d.finished_at desc
        limit 10
      ) x
    ),
    'leaders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user', private.public_card(o.user_id), 'rating', o.rating, 'wins', o.wins, 'me', o.user_id = uid
      ) order by o.rating desc, o.wins desc), '[]')
      from (select * from public.duel_stats where ranked_games > 0 order by rating desc, wins desc limit 20) o
    )
  );
end;
$$;

-- ---------- Housekeeping ----------

-- Every minute: decide live duels whose time ran out, expire unanswered invites, empty the
-- queue of people who left, and drop practice duels after a week.
create function private.duel_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  overdue uuid;
begin
  for overdue in
    select id from public.duels where status = 'active' and kind <> 'tournament' and ends_at < now() - interval '5 seconds'
  loop
    perform private.duel_settle(overdue);
  end loop;
  update public.duels set status = 'expired' where status = 'waiting' and created_at < now() - interval '2 minutes';
  delete from public.duel_queue where seen_at < now() - interval '30 seconds';
  delete from public.duels
  where created_at < now() - interval '7 days' and (kind = 'bot' or status in ('cancelled', 'declined', 'expired'));
end;
$$;

-- ---------- Grants ----------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.duel_check_player(uuid)', 'private.duel_rate_limit(uuid)', 'private.duel_busy(uuid)',
    'private.duel_pay(uuid, integer, text)', 'private.duel_take_stake(uuid, integer, text)',
    'private.duel_make_questions(uuid, text)', 'private.duel_bot_plan(text)', 'private.duel_start_live(uuid, text)',
    'private.duel_award(uuid, text)', 'private.duel_check_achievements(uuid)', 'private.duel_settle(uuid)',
    'private.duel_invite(uuid, uuid, integer, text, uuid)', 'private.duel_new_bot(uuid, text)',
    'private.tournament_ensure()', 'private.bracket_order(integer)',
    'private.tournament_open_match(uuid, integer, integer, uuid, uuid, timestamptz)', 'private.tournament_start(uuid)',
    'private.tournament_match_done(uuid, text)', 'private.tournament_advance(uuid)', 'private.tournament_tick()',
    'private.duel_sweep()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;

  foreach fn in array array[
    'public.duel_challenge(uuid, integer, text)', 'public.duel_respond(uuid, boolean)', 'public.duel_cancel(uuid)',
    'public.duel_find()', 'public.duel_leave_queue()', 'public.duel_vs_bot(text)', 'public.duel_rematch(uuid)',
    'public.duel_begin(uuid)', 'public.duel_answer(uuid, integer, integer)', 'public.duel_state(uuid)',
    'public.tournament_join()', 'public.tournament_leave()', 'public.tournament_bracket()', 'public.duel_overview()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

select cron.schedule('duel-sweep', '* * * * *', $$select private.duel_sweep()$$);
select cron.schedule('tournament-tick', '*/5 * * * *', $$select private.tournament_tick()$$);
