-- First-party usage analytics and the admin panel's server side.
--
-- Analytics: a handful of events (app opened, page viewed, a few actions), no third parties,
-- no IP addresses. Guests are recorded without any identifier. Events are deleted after 90 days.
-- Admin: read-only overviews plus role changes, every one of them checked against the caller's
-- role and written to an audit log.

-- ---------- Analytics ----------

create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,39}$'),
  path text check (char_length(path) <= 100),
  platform text check (platform in ('web', 'pwa', 'desktop')),
  locale text check (char_length(locale) <= 10),
  theme text check (char_length(theme) <= 20),
  apple_style boolean,
  created_at timestamptz not null default now()
);

create index analytics_events_created_at_idx on public.analytics_events (created_at);
create index analytics_events_user_idx on public.analytics_events (user_id, created_at);

alter table public.analytics_events enable row level security;

-- Anyone may add an event, but only as themselves (or anonymously); nobody can read them back.
create policy "Anyone can record their own events"
  on public.analytics_events for insert
  to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

revoke all on public.analytics_events from anon, authenticated;
grant insert (name, path, platform, locale, theme, apple_style) on public.analytics_events to anon, authenticated;

-- Drops events beyond a sane rate instead of erroring, so a buggy or hostile client can't
-- flood the free database.
create function private.throttle_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if new.user_id is not null then
    select count(*) into recent from public.analytics_events
      where user_id = new.user_id and created_at > now() - interval '1 minute';
    if recent >= 30 then
      return null;
    end if;
  else
    select count(*) into recent from public.analytics_events
      where user_id is null and created_at > now() - interval '1 minute';
    if recent >= 600 then
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.throttle_analytics() from public, anon, authenticated;

create trigger analytics_events_throttle before insert on public.analytics_events
  for each row execute function private.throttle_analytics();

-- Keep 90 days of events.
create extension if not exists pg_cron;
select cron.schedule(
  'purge-old-analytics',
  '17 3 * * *',
  $$delete from public.analytics_events where created_at < now() - interval '90 days'$$
);

-- ---------- Audit log ----------

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- ---------- Admin functions ----------
-- SECURITY DEFINER so they can read auth.users; each one starts by checking the caller's role.

create function private.require_role(min_role public.app_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_min_role(min_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_role(public.app_role) from public, anon;
grant execute on function private.require_role(public.app_role) to authenticated;

-- Accounts that count in statistics (test accounts are left out).
create function private.counted_users()
returns table (id uuid, created_at timestamptz, provider text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.created_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p.hidden_from_stats, false) = false;
$$;

revoke all on function private.counted_users() from public, anon;
grant execute on function private.counted_users() to authenticated;

create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_role('admin');

  -- Days and hours are counted in Kyiv time, where the owner lives.
  with
    counted as (select * from private.counted_users()),
    events as (
      select e.*, (e.created_at at time zone 'Europe/Kyiv') as local_at
      from public.analytics_events e
      left join public.profiles p on p.id = e.user_id
      where e.created_at > now() - interval '30 days'
        and coalesce(p.hidden_from_stats, false) = false
    ),
    today as (select (now() at time zone 'Europe/Kyiv')::date as day),
    days as (
      select generate_series((select day from today) - 29, (select day from today), interval '1 day')::date as day
    ),
    word_counts as (
      select c.id, (select count(*) from public.words w where w.user_id = c.id and w.deleted_at is null) as n
      from counted c
    )
  select jsonb_build_object(
    'users_total', (select count(*) from counted),
    'users_7d', (select count(*) from counted where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from counted where created_at > now() - interval '30 days'),
    'testers', (select count(*) from public.profiles where hidden_from_stats),
    'dau', (select count(distinct user_id) from events where created_at > now() - interval '1 day'),
    'wau', (select count(distinct user_id) from events where created_at > now() - interval '7 days'),
    'mau', (select count(distinct user_id) from events),
    'guest_opens_7d', (
      select count(*) from events where user_id is null and name = 'app_open' and created_at > now() - interval '7 days'
    ),
    'events_30d', (select count(*) from events),
    'words_total', (select count(*) from public.words where deleted_at is null),
    'rules_total', (select count(*) from public.rules where deleted_at is null),
    'notion_connections', (select count(*) from public.notion_connections),
    'notion_sources', (select count(*) from public.notion_sources),
    'notion_errors', (select count(*) from public.notion_sources where last_error is not null),
    'signups_by_day', (
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day,
          'count', (select count(*) from counted c where (c.created_at at time zone 'Europe/Kyiv')::date = d.day)
        )
        order by d.day
      )
      from days d
    ),
    'active_by_day', (
      select jsonb_agg(
        jsonb_build_object('day', d.day, 'count', (select count(distinct e.user_id) from events e where e.local_at::date = d.day))
        order by d.day
      )
      from days d
    ),
    -- When people use the app: weekday (1 = Monday) x hour, from app opens and page views.
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'count', n)), '[]')
      from (
        select extract(isodow from local_at)::int as dow, extract(hour from local_at)::int as hour, count(*) n
        from events
        where name in ('app_open', 'page_view')
        group by 1, 2
      ) t
    ),
    -- How far accounts get: signed up -> added words -> connected Notion -> linked a table.
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from counted),
      'has_words', (select count(*) from word_counts where n > 0),
      'notion_connected', (select count(*) from public.notion_connections nc join counted c on c.id = nc.user_id),
      'notion_linked', (select count(distinct s.user_id) from public.notion_sources s join counted c on c.id = s.user_id)
    ),
    -- Of the people who joined 8-30 days ago, how many came back in the last 7 days.
    'retention_7d', (
      select jsonb_build_object(
        'cohort', count(*),
        'returned', count(*) filter (
          where exists (select 1 from events e where e.user_id = c.id and e.created_at > now() - interval '7 days')
        )
      )
      from counted c
      where c.created_at between now() - interval '30 days' and now() - interval '8 days'
    ),
    'words_histogram', jsonb_build_object(
      '0', (select count(*) from word_counts where n = 0),
      '1-49', (select count(*) from word_counts where n between 1 and 49),
      '50-199', (select count(*) from word_counts where n between 50 and 199),
      '200-999', (select count(*) from word_counts where n between 200 and 999),
      '1000+', (select count(*) from word_counts where n >= 1000)
    ),
    'top_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', category, 'count', n) order by n desc), '[]')
      from (
        select w.category, count(*) n
        from public.words w
        join counted c on c.id = w.user_id
        where w.deleted_at is null and w.category <> ''
        group by 1
        order by 2 desc
        limit 10
      ) t
    ),
    'recent_signups', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'provider', c.provider, 'created_at', c.created_at) order by c.created_at desc), '[]')
      from (select * from counted order by created_at desc limit 8) c
      join public.profiles p on p.id = c.id
    ),
    'providers', (select coalesce(jsonb_object_agg(provider, n), '{}') from (select provider, count(*) n from counted group by 1) t),
    'platforms', (
      select coalesce(jsonb_object_agg(k, n), '{}')
      from (select coalesce(platform, 'web') k, count(*) n from events where name = 'app_open' group by 1) t
    ),
    'locales', (
      select coalesce(jsonb_object_agg(k, n), '{}')
      from (select coalesce(locale, '?') k, count(*) n from events where name = 'app_open' group by 1) t
    ),
    'themes', (
      select coalesce(jsonb_object_agg(k, n), '{}')
      from (select coalesce(theme, '?') k, count(*) n from events where name = 'app_open' group by 1) t
    ),
    'apple_style', (
      select coalesce(jsonb_object_agg(k, n), '{}')
      from (select case when apple_style then 'on' else 'off' end k, count(*) n from events where name = 'app_open' group by 1) t
    ),
    'top_pages', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'count', n) order by n desc), '[]')
      from (select path, count(*) n from events where name = 'page_view' and path is not null group by 1 order by 2 desc limit 8) t
    ),
    'actions', (
      select coalesce(jsonb_object_agg(name, n), '{}')
      from (select name, count(*) n from events where name not in ('app_open', 'page_view') group by 1) t
    ),
    'db_bytes', pg_database_size(current_database()),
    'tables', (
      select jsonb_agg(jsonb_build_object('name', relname, 'rows', n_live_tup, 'bytes', pg_total_relation_size(relid)) order by pg_total_relation_size(relid) desc)
      from pg_stat_user_tables
      where schemaname = 'public'
    )
  ) into result;

  return result;
end;
$$;

create function public.admin_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  email text,
  display_name text,
  role public.app_role,
  hidden_from_stats boolean,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  words bigint,
  notion_connected boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return query
    select
      u.id,
      u.email::text,
      p.display_name,
      p.role,
      p.hidden_from_stats,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      u.created_at,
      u.last_sign_in_at,
      (select max(e.created_at) from public.analytics_events e where e.user_id = u.id),
      (select count(*) from public.words w where w.user_id = u.id and w.deleted_at is null),
      exists (select 1 from public.notion_connections c where c.user_id = u.id)
    from auth.users u
    join public.profiles p on p.id = u.id
    where coalesce(p_search, '') = ''
      or position(lower(p_search) in lower(coalesce(u.email, ''))) > 0
      or position(lower(p_search) in lower(p.display_name)) > 0
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200)
    offset greatest(p_offset, 0);
end;
$$;

create function public.admin_set_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.app_role;
  current_role_value public.app_role;
begin
  perform private.require_role('admin');
  select role into caller from public.profiles where id = (select auth.uid());
  select role into current_role_value from public.profiles where id = p_user;
  if current_role_value is null then
    raise exception 'no such user';
  end if;

  -- Only the owner hands out or takes away admin and owner rights.
  if (p_role in ('admin', 'owner') or current_role_value in ('admin', 'owner')) and caller <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- The last owner can't step down, or nobody could manage the app.
  if current_role_value = 'owner' and p_role <> 'owner'
    and (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'the last owner cannot be demoted';
  end if;

  update public.profiles
  set role = p_role,
      hidden_from_stats = (p_role = 'tester')
  where id = p_user;

  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'set_role', p_user, jsonb_build_object('from', current_role_value, 'to', p_role));
end;
$$;

create function public.admin_notion_sources()
returns table (
  email text,
  title text,
  kind text,
  rows_count bigint,
  last_synced_at timestamptz,
  last_error text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return query
    select
      u.email::text,
      s.title,
      s.kind,
      case s.kind
        when 'words' then (select count(*) from public.words w where w.source_id = s.id)
        else (select count(*) from public.rules r where r.source_id = s.id)
      end,
      s.last_synced_at,
      s.last_error
    from public.notion_sources s
    join auth.users u on u.id = s.user_id
    order by s.last_error is null, s.last_synced_at desc nulls last;
end;
$$;

create function public.admin_audit(p_limit integer default 100)
returns table (
  created_at timestamptz,
  actor text,
  action text,
  target text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role('admin');
  return query
    select l.created_at, a.email::text, l.action, t.email::text, l.details
    from public.admin_audit_log l
    left join auth.users a on a.id = l.actor_id
    left join auth.users t on t.id = l.target_id
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_users(text, integer, integer) from public, anon;
revoke all on function public.admin_set_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_notion_sources() from public, anon;
revoke all on function public.admin_audit(integer) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_users(text, integer, integer) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_notion_sources() to authenticated;
grant execute on function public.admin_audit(integer) to authenticated;

-- Role changes made from the SQL editor are logged too.
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

  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values (null, 'grant_role (sql)', target, jsonb_build_object('from', previous, 'to', new_role));
end;
$$;

revoke all on function private.grant_role(text, public.app_role) from public, anon, authenticated;
