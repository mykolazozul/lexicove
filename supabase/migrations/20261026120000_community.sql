-- Phase 4: the community. Public profiles, friends, chat rooms and direct messages, reports and
-- moderation, weekly leagues, plus the admin view of the economy.
--
-- Every write goes through a function that checks bans, mutes, flood limits, links and the
-- profanity filter on the server. The browser is never trusted: the app's code is public.

-- ---------- Profiles: what other people may see ----------

alter table public.profiles
  add column last_seen_at timestamptz,
  add column chat_rules_accepted_at timestamptz,
  add column time_zone_changed_at timestamptz;

-- Other signed-in users see only the public part of a profile. Coins, time zone, daily goal,
-- the stats flag and "last seen" stay private; the owner reads them through my_profile().
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, role, xp, equipped, created_at) on public.profiles to authenticated;

-- "Mik" and "mik" are the same name when people search for friends.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

create function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

create function private.my_time_zone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select time_zone from public.profiles where id = (select auth.uid())), 'UTC');
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
revoke all on function private.my_time_zone() from public, anon;
grant execute on function private.my_time_zone() to authenticated;

-- study_insights runs as the caller, who can no longer read the time zone column directly.
create or replace function public.study_insights()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
    tz as (select private.my_time_zone() as name),
    today as (select (now() at time zone (select name from tz))::date as day)
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
        where p.user_id = (select auth.uid()) and p.lapses > 0 and w.deleted_at is null
        order by p.lapses desc, p.difficulty desc
        limit 8
      ) t
    ),
    -- Today's count includes everything already overdue.
    'forecast', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]')
      from (
        select gs.d,
               (select count(*) from public.word_progress p
                where p.user_id = (select auth.uid())
                  and case
                    when gs.d = (select day from today) then (p.due at time zone (select name from tz))::date <= gs.d
                    else (p.due at time zone (select name from tz))::date = gs.d
                  end) as n
        from (select ((select day from today) + i) as d from generate_series(0, 6) i) gs
      ) t
    )
  );
$$;

-- Hopping between time zones would start a new "today" early (a second chest, a second daily
-- goal bonus), so a new time zone sticks at most once every three days.
create or replace function private.check_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    new.time_zone := case when tg_op = 'UPDATE' then old.time_zone else 'UTC' end;
  end if;
  if tg_op = 'UPDATE' and new.time_zone is distinct from old.time_zone then
    if old.time_zone_changed_at is not null and old.time_zone_changed_at > now() - interval '3 days' then
      new.time_zone := old.time_zone;
    else
      new.time_zone_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- "Online" for friends: the app calls this every couple of minutes while it's open.
create function public.touch_presence()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_seen_at = now()
  where id = (select auth.uid()) and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');
$$;

revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- What anyone may see about a user in chat, leagues and friend lists.
create function private.public_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'role', p.role, 'xp', p.xp, 'equipped', p.equipped
  )
  from public.profiles p where p.id = p_user;
$$;

revoke all on function private.public_card(uuid) from public, anon, authenticated;

-- ---------- Sanctions ----------

create table public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('warning', 'mute', 'ban')),
  reason text not null default '' check (char_length(reason) <= 300),
  -- null means for good (mutes and bans); warnings don't expire.
  until timestamptz,
  -- null means the automatic filter.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);

create index user_sanctions_user_idx on public.user_sanctions (user_id, created_at desc);
alter table public.user_sanctions enable row level security;
create policy "Users see their own sanctions" on public.user_sanctions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_sanctions from anon, authenticated;
grant select on public.user_sanctions to authenticated;

-- The strongest active restriction: a ban before a mute.
create function private.restriction(p_user uuid)
returns table (kind text, until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.kind, s.until
  from public.user_sanctions s
  where s.user_id = p_user and s.kind in ('ban', 'mute') and s.revoked_at is null and (s.until is null or s.until > now())
  order by (s.kind = 'ban') desc, s.until desc nulls first
  limit 1;
$$;

revoke all on function private.restriction(uuid) from public, anon;
grant execute on function private.restriction(uuid) to authenticated;

-- Moderators act on users, admins also on moderators, only the owner on admins; nobody on the
-- owner or on themselves.
create function private.can_moderate(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is distinct from p_target and coalesce((
    select case
      when target.role = 'owner' then false
      when target.role = 'admin' then me.role = 'owner'
      when target.role = 'moderator' then me.role >= 'admin'
      else me.role >= 'moderator'
    end
    from public.profiles me, public.profiles target
    where me.id = (select auth.uid()) and target.id = p_target
  ), false);
$$;

revoke all on function private.can_moderate(uuid) from public, anon, authenticated;

-- ---------- Friends ----------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);

create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;
create policy "Users see their own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and least(f.requester, f.addressee) = least(a, b) and greatest(f.requester, f.addressee) = greatest(a, b)
  );
$$;

revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;

-- By username (as typed, with or without @) or by id (from a chat message or a league table).
create function public.send_friend_request(p_user uuid default null, p_username text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target uuid;
  existing public.friendships;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  if exists (select 1 from private.restriction(uid) r where r.kind = 'ban') then
    raise exception 'banned';
  end if;
  target := coalesce(p_user, (select p.id from public.profiles p where lower(p.username) = lower(btrim(p_username, ' @'))));
  if target is null or not exists (select 1 from public.profiles where id = target) then
    raise exception 'no_such_user';
  end if;
  if target = uid then
    raise exception 'self';
  end if;

  select * into existing from public.friendships f
  where least(f.requester, f.addressee) = least(uid, target) and greatest(f.requester, f.addressee) = greatest(uid, target);
  if found then
    if existing.status = 'pending' and existing.requester = target then
      update public.friendships set status = 'accepted', accepted_at = now() where id = existing.id;
      return 'accepted';
    end if;
    return 'already';
  end if;

  if (select count(*) from public.friendships where requester = uid and status = 'pending') >= 50 then
    raise exception 'too_many';
  end if;
  insert into public.friendships (requester, addressee) values (uid, target);
  return 'sent';
end;
$$;

create function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where id = p_id and addressee = (select auth.uid()) and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = (select auth.uid()) and status = 'pending';
  end if;
end;
$$;

-- Removes a friend, cancels a sent request or declines a received one.
create function public.remove_friend(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships f
  where least(f.requester, f.addressee) = least((select auth.uid()), p_user)
    and greatest(f.requester, f.addressee) = greatest((select auth.uid()), p_user);
$$;

-- ---------- Weekly leagues ----------
-- Groups of up to 30 per tier, Monday to Monday (UTC). Bronze 0 … Legend 6.

alter table public.user_stats add column league_tier smallint not null default 0 check (league_tier between 0 and 6);

create table public.league_members (
  week_start date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  tier smallint not null check (tier between 0 and 6),
  grp integer not null,
  xp integer not null default 0,
  joined_at timestamptz not null default now(),
  final_rank integer,
  outcome text check (outcome in ('promoted', 'stayed', 'demoted')),
  reward integer,
  primary key (week_start, user_id)
);

create index league_members_group_idx on public.league_members (week_start, tier, grp, xp desc);
create index league_members_user_idx on public.league_members (user_id, week_start desc);
alter table public.league_members enable row level security;
create policy "Users see their own league rows" on public.league_members for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.league_members from anon, authenticated;
grant select on public.league_members to authenticated;

create function private.league_week()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', now() at time zone 'UTC')::date;
$$;

-- How many go up and down in a group of this size.
create function private.league_zones(p_tier integer, p_size integer, out up integer, out down integer)
language sql
immutable
set search_path = ''
as $$
  select
    case when p_tier >= 6 then 0 when p_size >= 10 then 5 when p_size >= 5 then 2 when p_size >= 2 then 1 else 0 end,
    case when p_tier <= 0 then 0 when p_size >= 10 then 5 when p_size >= 5 then 2 else 0 end;
$$;

create function private.league_add_xp(p_user uuid, p_xp integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w date := private.league_week();
  t smallint;
  g integer;
begin
  update public.league_members set xp = xp + p_xp where week_start = w and user_id = p_user;
  if found then
    return;
  end if;

  select coalesce(league_tier, 0) into t from public.user_stats where user_id = p_user;
  t := coalesce(t, 0);
  -- One group assignment at a time per tier, so groups fill up to 30 and no further.
  perform pg_advisory_xact_lock(hashtext('league:' || w::text || ':' || t::text));
  select m.grp into g from public.league_members m
  where m.week_start = w and m.tier = t
  group by m.grp having count(*) < 30
  order by m.grp limit 1;
  if g is null then
    select coalesce(max(m.grp), 0) + 1 into g from public.league_members m where m.week_start = w and m.tier = t;
  end if;

  insert into public.league_members (week_start, user_id, tier, grp, xp) values (w, p_user, t, g, p_xp)
  on conflict (week_start, user_id) do update set xp = public.league_members.xp + excluded.xp;
end;
$$;

-- Ranks every finished week, moves people up and down a tier and pays the top places.
-- Runs every hour from pg_cron, so a missed run catches up on the next one.
create function private.close_league_weeks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  m record;
  zones record;
  result text;
  prize integer;
begin
  for g in
    select week_start, tier, grp, count(*)::integer as size
    from public.league_members
    where week_start < private.league_week() and final_rank is null
    group by 1, 2, 3
  loop
    select * into zones from private.league_zones(g.tier, g.size);
    for m in
      select user_id, row_number() over (order by xp desc, joined_at) as place
      from public.league_members
      where week_start = g.week_start and tier = g.tier and grp = g.grp
    loop
      result := case when m.place <= zones.up then 'promoted' when m.place > g.size - zones.down then 'demoted' else 'stayed' end;
      prize := case m.place
        when 1 then 50 + 25 * g.tier
        when 2 then 30 + 15 * g.tier
        when 3 then 20 + 10 * g.tier
        else case when result = 'promoted' then 10 + 5 * g.tier else 0 end
      end;
      -- Winning a group of one or two isn't much of a contest.
      if g.size < 3 then
        prize := least(prize, 10);
      end if;

      update public.league_members set final_rank = m.place, outcome = result, reward = prize
      where week_start = g.week_start and user_id = m.user_id;
      if prize > 0 then
        update public.profiles set coins = coins + prize where id = m.user_id;
        insert into public.coin_ledger (user_id, amount, reason) values (m.user_id, prize, 'league');
      end if;
      update public.user_stats
      set league_tier = least(6, greatest(0, g.tier + case result when 'promoted' then 1 when 'demoted' then -1 else 0 end))
      where user_id = m.user_id;
    end loop;
  end loop;
end;
$$;

revoke all on function private.league_week() from public, anon;
grant execute on function private.league_week() to authenticated;
revoke all on function private.league_zones(integer, integer) from public, anon;
grant execute on function private.league_zones(integer, integer) to authenticated;
revoke all on function private.league_add_xp(uuid, integer) from public, anon, authenticated;
revoke all on function private.close_league_weeks() from public, anon, authenticated;

select cron.schedule('close-league-weeks', '7 * * * *', $$select private.close_league_weeks()$$);

-- The caller's group this week, plus how last week ended for them.
create function public.league_standings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  w date := private.league_week();
  me public.league_members;
  previous public.league_members;
  my_tier smallint;
  size integer := 0;
  zones record;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  select * into me from public.league_members where week_start = w and user_id = uid;
  select coalesce(league_tier, 0) into my_tier from public.user_stats where user_id = uid;
  select * into previous from public.league_members
  where user_id = uid and week_start < w and final_rank is not null
  order by week_start desc limit 1;
  if me.user_id is not null then
    select count(*) into size from public.league_members where week_start = w and tier = me.tier and grp = me.grp;
  end if;
  select * into zones from private.league_zones(coalesce(me.tier, my_tier, 0), size);

  return jsonb_build_object(
    'week_start', w,
    'ends_at', (w + 7)::timestamp at time zone 'UTC',
    'tier', coalesce(me.tier, my_tier, 0),
    'joined', me.user_id is not null,
    'xp', coalesce(me.xp, 0),
    'promote', zones.up,
    'demote', zones.down,
    'members', case when me.user_id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('user', private.public_card(x.user_id), 'xp', x.xp, 'rank', x.place, 'me', x.user_id = uid) order by x.place), '[]')
      from (
        select lm.user_id, lm.xp, row_number() over (order by lm.xp desc, lm.joined_at) as place
        from public.league_members lm
        where lm.week_start = w and lm.tier = me.tier and lm.grp = me.grp
      ) x
    ) end,
    'last', case when previous.user_id is null then null else jsonb_build_object(
      'week_start', previous.week_start, 'tier', previous.tier, 'rank', previous.final_rank, 'outcome', previous.outcome, 'reward', previous.reward
    ) end
  );
end;
$$;

-- Friends (and the caller) with their weekly XP, streak and whether they're online.
create function public.my_friends()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select f.*, case when f.requester = (select auth.uid()) then f.addressee else f.requester end as other
    from public.friendships f
    where (select auth.uid()) in (f.requester, f.addressee)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'status', case when m.status = 'accepted' then 'friend' when m.requester = (select auth.uid()) then 'outgoing' else 'incoming' end,
    'user', private.public_card(m.other),
    'online', m.status = 'accepted' and coalesce(p.last_seen_at > now() - interval '5 minutes', false),
    'last_seen_at', case when m.status = 'accepted' then p.last_seen_at end,
    'streak', case when m.status = 'accepted' and s.last_active_day >= (now() at time zone p.time_zone)::date - 1 then s.current_streak else 0 end,
    'week_xp', coalesce(lm.xp, 0)
  ) order by (m.status = 'accepted') desc, coalesce(lm.xp, 0) desc, m.created_at), '[]')
  from mine m
  join public.profiles p on p.id = m.other
  left join public.user_stats s on s.user_id = m.other
  left join public.league_members lm on lm.user_id = m.other and lm.week_start = private.league_week();
$$;

create function public.public_profile(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user', private.public_card(p.id),
    'created_at', p.created_at,
    'best_streak', coalesce(s.best_streak, 0),
    'streak', case when s.last_active_day >= (now() at time zone p.time_zone)::date - 1 then s.current_streak else 0 end,
    'answers', coalesce(s.answers_total, 0),
    'achievements', (select count(*) from public.user_achievements a where a.user_id = p.id),
    'league_tier', coalesce(s.league_tier, 0),
    'friendship', (
      select case when f.status = 'accepted' then 'friend' when f.requester = (select auth.uid()) then 'outgoing' else 'incoming' end
      from public.friendships f
      where least(f.requester, f.addressee) = least((select auth.uid()), p.id) and greatest(f.requester, f.addressee) = greatest((select auth.uid()), p.id)
    ),
    'me', p.id = (select auth.uid())
  )
  from public.profiles p
  left join public.user_stats s on s.user_id = p.id
  where p.id = p_user and (select auth.uid()) is not null;
$$;

-- ---------- Chat ----------

create table public.chat_rooms (
  id text primary key check (id ~ '^[a-z0-9_]{2,24}$'),
  icon text not null,
  sort integer not null default 0,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 600),
  closed boolean not null default false
);

alter table public.chat_rooms enable row level security;
create policy "Signed-in users see the rooms" on public.chat_rooms for select to authenticated using (true);
revoke all on public.chat_rooms from anon, authenticated;
grant select on public.chat_rooms to authenticated;

insert into public.chat_rooms (id, icon, sort) values
  ('general', '💬', 10),
  ('beginners', '🌱', 20),
  ('intermediate', '📘', 30),
  ('advanced', '🎓', 40),
  ('phrasal', '🧩', 50),
  ('it', '💻', 60),
  ('travel', '✈️', 70),
  ('help', '🛟', 80);

-- Direct messages live in rooms named dm:<smaller id>:<bigger id>.
create function private.dm_room(a uuid, b uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'dm:' || least(a::text, b::text) || ':' || greatest(a::text, b::text);
$$;

create function private.dm_member(p_room text, p_user uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_room like 'dm:%' and p_user is not null
    and (split_part(p_room, ':', 2) = p_user::text or split_part(p_room, ':', 3) = p_user::text);
$$;

revoke all on function private.dm_room(uuid, uuid) from public, anon;
grant execute on function private.dm_room(uuid, uuid) to authenticated;
revoke all on function private.dm_member(text, uuid) from public, anon;
grant execute on function private.dm_member(text, uuid) to authenticated;

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room text not null check (room ~ '^[a-z0-9_]{2,24}$' or room ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  reply_to bigint references public.chat_messages (id) on delete set null,
  -- Reaction counts, kept up to date by a trigger so they reach everyone over Realtime.
  reactions jsonb not null default '{}'::jsonb,
  -- How many words the profanity filter masked.
  filtered smallint not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Hidden automatically after three reports, until a moderator decides.
  hidden boolean not null default false,
  check ((deleted_at is null and char_length(body) between 1 and 500) or (deleted_at is not null and body = ''))
);

create index chat_messages_room_idx on public.chat_messages (room, id desc);
create index chat_messages_user_idx on public.chat_messages (user_id, created_at desc);
alter table public.chat_messages enable row level security;
create policy "Read chat messages" on public.chat_messages for select to authenticated using (
  (room not like 'dm:%' or private.dm_member(room, (select auth.uid())))
  and (not hidden or user_id = (select auth.uid()) or (select private.has_min_role('moderator')))
);
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;

create table public.chat_reactions (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🎉', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.chat_reactions enable row level security;
-- Users read only their own reactions (to highlight them); counts come with the message.
create policy "Users see their reactions" on public.chat_reactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users react to visible messages" on public.chat_reactions for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.chat_messages m where m.id = message_id and m.deleted_at is null)
  and not exists (select 1 from private.restriction((select auth.uid())))
);
create policy "Users take back their reactions" on public.chat_reactions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.chat_reactions from anon, authenticated;
grant select, delete on public.chat_reactions to authenticated;
grant insert (message_id, emoji) on public.chat_reactions to authenticated;

create function private.count_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target bigint := coalesce(new.message_id, old.message_id);
begin
  if tg_op = 'INSERT' and (
    select count(*) from public.chat_reactions where user_id = new.user_id and created_at > now() - interval '1 minute'
  ) > 40 then
    raise exception 'too_fast';
  end if;
  update public.chat_messages m
  set reactions = coalesce((
    select jsonb_object_agg(emoji, n) from (
      select emoji, count(*) as n from public.chat_reactions where message_id = target group by emoji
    ) t
  ), '{}'::jsonb)
  where m.id = target;
  return null;
end;
$$;

revoke all on function private.count_reactions() from public, anon, authenticated;
create trigger chat_reactions_count after insert or delete on public.chat_reactions
  for each row execute function private.count_reactions();

alter publication supabase_realtime add table public.chat_messages;

-- ---------- Profanity filter ----------
-- Stems match any word that starts with them; whole words match only on their own. Words are
-- compared after undoing leetspeak (0→o, 3→e, @→a…) and Latin look-alikes of Cyrillic letters.

create table public.chat_filter_words (
  word text primary key check (word ~ '^[[:alpha:]]{2,30}$' and word = lower(word)),
  whole_word boolean not null default false
);

alter table public.chat_filter_words enable row level security;
revoke all on public.chat_filter_words from anon, authenticated;

insert into public.chat_filter_words (word, whole_word) values
  ('fuck', false), ('fck', true), ('fuk', false), ('shit', false), ('bitch', false), ('cunt', false), ('asshole', false),
  ('bastard', false), ('motherf', false), ('whore', false), ('slut', false), ('fagg', false), ('fag', true),
  ('nigg', false), ('retard', false), ('dickhead', false), ('wanker', false), ('twat', false), ('pussy', false),
  ('хуй', false), ('хуе', false), ('хуё', false), ('хуя', false), ('хуї', false), ('хуи', false),
  ('нахуй', false), ('похуй', false), ('нихуя', false), ('ніхуя', false), ('охуе', false), ('охуї', false), ('охуи', false), ('ахуе', false),
  ('пизд', false), ('пізд', false), ('пздц', true),
  ('еба', false), ('ебу', false), ('ебл', false), ('ебё', false), ('ебн', false), ('ёба', false), ('ёб', true),
  ('єба', false), ('єбу', false), ('їба', false), ('йоба', false), ('йобан', false),
  ('заеб', false), ('заёб', false), ('заїб', false), ('уеб', false), ('уёб', false), ('наеб', false), ('выеб', false),
  ('виеб', false), ('вйоб', false), ('долбоеб', false), ('долбоёб', false), ('довбойоб', false),
  ('блят', false), ('бляд', false), ('бля', true), ('выбля', false), ('вибля', false),
  ('сука', false), ('суки', false), ('сучк', false), ('сучар', false),
  ('мудак', false), ('мудил', false), ('мудо', false), ('залуп', false), ('шлюх', false), ('шалав', false),
  ('підор', false), ('пидор', false), ('підар', false), ('пидар', false), ('педик', false),
  ('гандон', false), ('гондон', false), ('дроч', false), ('мраз', false), ('курв', false),
  ('дебіл', false), ('дебил', false);

create function private.filter_profanity(p_body text, out masked text, out hits integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stem_list text;
  word_list text;
  pattern text;
  variant text;
  start_at integer;
  hit_start integer;
  hit_end integer;
  lowered text := lower(p_body);
begin
  masked := p_body;
  hits := 0;
  select string_agg(word, '|') filter (where not whole_word), string_agg(word, '|') filter (where whole_word)
  into stem_list, word_list from public.chat_filter_words;
  pattern := concat_ws('|',
    case when stem_list is not null then '\m(' || stem_list || ')[[:alnum:]_]*' end,
    case when word_list is not null then '\m(' || word_list || ')\M' end);
  if pattern = '' then
    return;
  end if;

  -- Both variants keep every character in place, so a match marks the same span of the original.
  foreach variant in array array[
    translate(lowered, '0134578@$', 'oieastbas'),
    translate(lowered, 'aeopcxykmtbiё', 'аеорсхукмтвіе')
  ] loop
    continue when char_length(variant) <> char_length(p_body);
    start_at := 1;
    loop
      hit_start := regexp_instr(variant, pattern, start_at, 1, 0, 'i');
      exit when hit_start = 0;
      hit_end := regexp_instr(variant, pattern, start_at, 1, 1, 'i');
      exit when hit_end <= hit_start;
      if substr(masked, hit_start, hit_end - hit_start) !~ '^\*+$' then
        masked := overlay(masked placing repeat('*', hit_end - hit_start) from hit_start for hit_end - hit_start);
        hits := hits + 1;
      end if;
      start_at := hit_end;
    end loop;
  end loop;
end;
$$;

revoke all on function private.filter_profanity(text) from public, anon, authenticated;

-- ---------- Posting ----------

create function public.accept_chat_rules()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set chat_rules_accepted_at = coalesce(chat_rules_accepted_at, now()) where id = (select auth.uid());
$$;

-- Errors are short codes the app translates; "muted" and "slow_mode" carry details.
create function public.send_message(p_room text, p_body text, p_reply_to bigint default null)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
  room_row public.chat_rooms;
  other uuid;
  body text;
  limited record;
  clean record;
  recent integer;
  last_own public.chat_messages;
  result public.chat_messages;
  staff boolean;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  select * into me from public.profiles where id = uid;
  if me.chat_rules_accepted_at is null then
    raise exception 'rules_not_accepted';
  end if;
  select * into limited from private.restriction(uid);
  if found then
    raise exception '%', case when limited.kind = 'ban' then 'banned' else 'muted' end
      using detail = coalesce(limited.until::text, 'forever');
  end if;
  staff := private.has_min_role('moderator');

  if p_room like 'dm:%' then
    if not private.dm_member(p_room, uid) then
      raise exception 'no_such_room';
    end if;
    other := (case when split_part(p_room, ':', 2) = uid::text then split_part(p_room, ':', 3) else split_part(p_room, ':', 2) end)::uuid;
    if p_room <> private.dm_room(uid, other) then
      raise exception 'no_such_room';
    end if;
    if not private.are_friends(uid, other) then
      raise exception 'not_friends';
    end if;
  else
    select * into room_row from public.chat_rooms where id = p_room;
    if not found then
      raise exception 'no_such_room';
    end if;
    if room_row.closed and not staff then
      raise exception 'room_closed';
    end if;
  end if;

  -- Control and zero-width characters out (they hide words from the filter), extra blank lines too.
  body := regexp_replace(coalesce(p_body, ''), '[\x01-\x09\x0B-\x1F\x7F]', '', 'g');
  body := translate(body, chr(8203) || chr(8204) || chr(8205) || chr(8206) || chr(8207) || chr(8288) || chr(65279), '');
  body := btrim(regexp_replace(body, '\n{3,}', E'\n\n', 'g'), E' \n\t');
  if body = '' then
    raise exception 'empty';
  end if;
  if char_length(body) > 500 then
    raise exception 'too_long';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.chat_messages m where m.id = p_reply_to and m.room = p_room) then
    raise exception 'bad_reply';
  end if;

  -- Flood limits across all rooms: 5 messages in 10 seconds, 20 a minute.
  select count(*) into recent from public.chat_messages where user_id = uid and created_at > now() - interval '10 seconds';
  if recent >= 5 then
    raise exception 'too_fast';
  end if;
  select count(*) into recent from public.chat_messages where user_id = uid and created_at > now() - interval '1 minute';
  if recent >= 20 then
    raise exception 'too_fast';
  end if;

  select * into last_own from public.chat_messages where user_id = uid and room = p_room order by id desc limit 1;
  if found then
    if coalesce(room_row.slow_mode_seconds, 0) > 0 and not staff
      and last_own.created_at > now() - make_interval(secs => room_row.slow_mode_seconds) then
      raise exception 'slow_mode' using detail = room_row.slow_mode_seconds::text;
    end if;
    if lower(last_own.body) = lower(body) and last_own.created_at > now() - interval '2 minutes' then
      raise exception 'duplicate';
    end if;
  end if;

  -- Accounts younger than a day can't post links.
  if me.created_at > now() - interval '24 hours' and not staff
    and body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ru|ua|io|gg|me|ly|xyz|app|dev|co|tk|site|online|top|link)\M)' then
    raise exception 'no_links_yet';
  end if;

  select * into clean from private.filter_profanity(body);
  insert into public.chat_messages (room, user_id, body, reply_to, filtered)
  values (p_room, uid, clean.masked, p_reply_to, clean.hits)
  returning * into result;

  -- Five filtered messages within an hour earn an automatic 15-minute mute.
  if clean.hits > 0 and (
    select count(*) from public.chat_messages where user_id = uid and filtered > 0 and created_at > now() - interval '1 hour'
  ) >= 5 then
    insert into public.user_sanctions (user_id, kind, reason, until) values (uid, 'mute', 'auto:profanity', now() + interval '15 minutes');
  end if;
  return result;
end;
$$;

create function public.delete_my_message(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.chat_messages set body = '', deleted_at = now()
  where id = p_id and user_id = (select auth.uid()) and deleted_at is null;
$$;

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  reporter uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'hate', 'sexual', 'other')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text check (resolution in ('dismissed', 'deleted')),
  unique (message_id, reporter)
);

create index message_reports_open_idx on public.message_reports (message_id) where resolved_at is null;
-- Server-only: reports are filed and read through functions.
alter table public.message_reports enable row level security;
revoke all on public.message_reports from anon, authenticated;

create function public.report_message(p_id bigint, p_reason text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  msg public.chat_messages;
begin
  select * into msg from public.chat_messages where id = p_id and deleted_at is null;
  if not found or (msg.room like 'dm:%' and not private.dm_member(msg.room, uid)) then
    raise exception 'no_such_message';
  end if;
  if msg.user_id = uid then
    raise exception 'own_message';
  end if;
  if exists (select 1 from private.restriction(uid) r where r.kind = 'ban') then
    raise exception 'banned';
  end if;
  if (select count(*) from public.message_reports where reporter = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_fast';
  end if;

  insert into public.message_reports (message_id, reporter, reason, note)
  values (p_id, uid, p_reason, left(coalesce(p_note, ''), 300))
  on conflict (message_id, reporter) do nothing;

  if (select count(*) from public.message_reports where message_id = p_id and resolved_at is null) >= 3 then
    update public.chat_messages set hidden = true where id = p_id;
  end if;
end;
$$;

-- What the chat screen needs to know about the caller.
create function public.chat_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rules_accepted', p.chat_rules_accepted_at is not null,
    'restriction', (select jsonb_build_object('kind', r.kind, 'until', r.until) from private.restriction(p.id) r),
    'warnings', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', s.reason, 'created_at', s.created_at) order by s.created_at desc), '[]')
      from public.user_sanctions s
      where s.user_id = p.id and s.kind = 'warning' and s.revoked_at is null and s.created_at > now() - interval '7 days'
    ),
    'links_allowed', p.created_at <= now() - interval '24 hours',
    'moderator', p.role >= 'moderator'
  )
  from public.profiles p where p.id = (select auth.uid());
$$;

-- ---------- Moderation ----------

create function public.mod_delete_message(p_id bigint, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages;
begin
  perform private.require_role('moderator');
  select * into msg from public.chat_messages where id = p_id;
  if not found then
    raise exception 'no_such_message';
  end if;
  if not private.can_moderate(msg.user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.chat_messages set body = '', deleted_at = now() where id = p_id and deleted_at is null;
  update public.message_reports set resolved_at = now(), resolved_by = (select auth.uid()), resolution = 'deleted'
  where message_id = p_id and resolved_at is null;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'delete_message', msg.user_id,
    jsonb_build_object('message', p_id, 'room', case when msg.room like 'dm:%' then 'dm' else msg.room end, 'text', left(msg.body, 200), 'reason', left(coalesce(p_reason, ''), 300)));
end;
$$;

create function public.mod_dismiss_reports(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role('moderator');
  update public.message_reports set resolved_at = now(), resolved_by = (select auth.uid()), resolution = 'dismissed'
  where message_id = p_id and resolved_at is null;
  update public.chat_messages set hidden = false where id = p_id;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'dismiss_reports', (select user_id from public.chat_messages where id = p_id), jsonb_build_object('message', p_id));
end;
$$;

-- Moderators mute and ban for up to a week; longer or permanent bans need an admin.
create function public.mod_sanction(p_user uuid, p_kind text, p_minutes integer default null, p_reason text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  perform private.require_role('moderator');
  if p_kind not in ('warning', 'mute', 'ban') then
    raise exception 'bad_kind';
  end if;
  if not private.can_moderate(p_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind in ('mute', 'ban') and (p_minutes is null or p_minutes > 10080) and not private.has_min_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_minutes is not null and p_minutes <= 0 then
    raise exception 'bad_duration';
  end if;

  insert into public.user_sanctions (user_id, kind, reason, until, created_by)
  values (
    p_user, p_kind, left(coalesce(p_reason, ''), 300),
    case when p_kind = 'warning' or p_minutes is null then null else now() + make_interval(mins => p_minutes) end,
    (select auth.uid())
  )
  returning id into created;

  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'sanction', p_user, jsonb_build_object('kind', p_kind, 'minutes', p_minutes, 'reason', left(coalesce(p_reason, ''), 300)));
  return created;
end;
$$;

create function public.mod_revoke_sanction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform private.require_role('moderator');
  select user_id into target from public.user_sanctions where id = p_id and revoked_at is null;
  if target is null then
    raise exception 'no_such_sanction';
  end if;
  if not private.can_moderate(target) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.user_sanctions set revoked_at = now(), revoked_by = (select auth.uid()) where id = p_id;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'revoke_sanction', target, jsonb_build_object('sanction', p_id));
end;
$$;

-- Open reports, one row per reported message.
create function public.mod_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('moderator');
  return (
    select coalesce(jsonb_agg(x order by x ->> 'last_report' desc), '[]')
    from (
      select jsonb_build_object(
        'message_id', m.id,
        'room', case when m.room like 'dm:%' then 'dm' else m.room end,
        'body', m.body,
        'created_at', m.created_at,
        'hidden', m.hidden,
        'filtered', m.filtered,
        'author', private.public_card(m.user_id),
        'reports', count(r.id),
        'reasons', jsonb_agg(distinct r.reason),
        'notes', coalesce(jsonb_agg(r.note) filter (where r.note <> ''), '[]'),
        'last_report', max(r.created_at)
      ) as x
      from public.message_reports r
      join public.chat_messages m on m.id = r.message_id
      where r.resolved_at is null and m.deleted_at is null
      group by m.id
    ) t
  );
end;
$$;

create function public.mod_sanctions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('moderator');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'reason', s.reason, 'until', s.until, 'created_at', s.created_at,
      'user', private.public_card(s.user_id),
      'by', (select p.display_name from public.profiles p where p.id = s.created_by)
    ) order by s.created_at desc), '[]')
    from public.user_sanctions s
    where s.revoked_at is null and s.kind in ('mute', 'ban') and (s.until is null or s.until > now())
  );
end;
$$;

-- A user's record for the moderator card: past sanctions and recent public messages.
create function public.mod_user(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('moderator');
  return jsonb_build_object(
    'can_moderate', private.can_moderate(p_user),
    'sanctions', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'reason', s.reason, 'until', s.until,
        'created_at', s.created_at, 'revoked_at', s.revoked_at) order by s.created_at desc), '[]')
      from (select * from public.user_sanctions where user_id = p_user order by created_at desc limit 20) s
    ),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'room', m.room, 'body', m.body, 'created_at', m.created_at,
        'deleted', m.deleted_at is not null) order by m.id desc), '[]')
      from (select * from public.chat_messages where user_id = p_user and room not like 'dm:%' order by id desc limit 20) m
    ),
    'reports_against', (
      select count(*) from public.message_reports r join public.chat_messages m on m.id = r.message_id where m.user_id = p_user
    )
  );
end;
$$;

create function public.mod_set_room(p_room text, p_slow_mode integer, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role('moderator');
  update public.chat_rooms set slow_mode_seconds = greatest(0, least(600, p_slow_mode)), closed = p_closed where id = p_room;
  if not found then
    raise exception 'no_such_room';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'room_settings', null, jsonb_build_object('room', p_room, 'slow_mode', p_slow_mode, 'closed', p_closed));
end;
$$;

-- ---------- Admin: the economy at a glance ----------

create function public.admin_economy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return (
    with
      counted as (select id from private.counted_users()),
      ledger as (
        select l.* from public.coin_ledger l join counted c on c.id = l.user_id
        where l.created_at > now() - interval '30 days'
      ),
      today as (select (now() at time zone 'Europe/Kyiv')::date as day),
      days as (select ((select day from today) - i) as day from generate_series(0, 29) i)
    select jsonb_build_object(
      'circulation', (select coalesce(sum(p.coins), 0) from public.profiles p join counted c on c.id = p.id),
      'holders', (select count(*) from public.profiles p join counted c on c.id = p.id where p.coins > 0),
      'answer_coins_30d', (
        select count(*) from public.review_log r join counted c on c.id = r.user_id
        where r.correct and r.reviewed_at > now() - interval '30 days'
      ),
      'spent_30d', (select coalesce(-sum(amount), 0) from ledger where amount < 0),
      'earned_by_reason', (
        select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'amount', amount) order by amount desc), '[]')
        from (
          select case when reason like 'quest:%' then 'quests' else reason end as reason, sum(amount) as amount
          from ledger where amount > 0 group by 1
        ) t
      ),
      'spent_daily', (
        select jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(x.value, 0)) order by d.day)
        from days d
        left join (
          select (created_at at time zone 'Europe/Kyiv')::date as day, -sum(amount) as value from ledger where amount < 0 group by 1
        ) x on x.day = d.day
      ),
      'top_items', (
        select coalesce(jsonb_agg(jsonb_build_object('item', item_id, 'owners', owners) order by owners desc), '[]')
        from (
          select i.item_id, count(*) as owners
          from public.inventory i join counted c on c.id = i.user_id join public.shop_items s on s.id = i.item_id
          where not s.consumable
          group by 1 order by 2 desc limit 10
        ) t
      ),
      'quests', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'given', given, 'claimed', claimed) order by given desc), '[]')
        from (
          select q.kind, count(*) as given, count(*) filter (where q.claimed_at is not null) as claimed
          from public.user_quests q join counted c on c.id = q.user_id
          where q.period_start > current_date - 30
          group by 1
        ) t
      ),
      'chests_30d', (select count(*) from ledger where reason = 'daily_chest'),
      'achievements', (
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'icon', icon, 'unlocked', unlocked) order by unlocked desc, sort), '[]')
        from (
          select a.id, a.icon, a.sort, count(u.user_id) as unlocked
          from public.achievements a
          left join public.user_achievements u on u.achievement_id = a.id and u.user_id in (select id from counted)
          group by a.id, a.icon, a.sort
        ) t
      ),
      'leagues', (
        select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'users', users) order by tier), '[]')
        from (
          select coalesce(s.league_tier, 0) as tier, count(*) as users
          from counted c left join public.user_stats s on s.user_id = c.id
          group by 1
        ) t
      ),
      'league_players', (select count(*) from public.league_members where week_start = private.league_week()),
      'chat', jsonb_build_object(
        'messages_7d', (select count(*) from public.chat_messages where created_at > now() - interval '7 days' and room not like 'dm:%'),
        'open_reports', (select count(distinct message_id) from public.message_reports where resolved_at is null),
        'active_sanctions', (
          select count(*) from public.user_sanctions
          where revoked_at is null and kind in ('mute', 'ban') and (until is null or until > now())
        )
      )
    )
  );
end;
$$;

-- ---------- Rewards now also feed the leagues ----------

create or replace function private.on_review()
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

  -- Leagues count everyone except test and staff accounts hidden from stats.
  if xp_gain > 0 and not profile.hidden_from_stats then
    perform private.league_add_xp(new.user_id, xp_gain);
  end if;

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

-- ---------- Housekeeping ----------

select cron.schedule('purge-old-chat', '41 3 * * *', $$
  delete from public.chat_messages where created_at < now() - interval '180 days';
  delete from public.user_sanctions where revoked_at < now() - interval '180 days' or until < now() - interval '180 days';
$$);

-- ---------- Who may call what ----------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.send_friend_request(uuid, text)', 'public.respond_friend_request(uuid, boolean)', 'public.remove_friend(uuid)',
    'public.league_standings()', 'public.my_friends()', 'public.public_profile(uuid)',
    'public.accept_chat_rules()', 'public.send_message(text, text, bigint)', 'public.delete_my_message(bigint)',
    'public.report_message(bigint, text, text)', 'public.chat_status()',
    'public.mod_delete_message(bigint, text)', 'public.mod_dismiss_reports(bigint)',
    'public.mod_sanction(uuid, text, integer, text)', 'public.mod_revoke_sanction(uuid)', 'public.mod_reports()',
    'public.mod_sanctions()', 'public.mod_user(uuid)', 'public.mod_set_room(text, integer, boolean)', 'public.admin_economy()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;
