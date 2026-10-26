-- Streak reminders through Web Push.
--
-- The push function creates the VAPID key pair on its first run and keeps it in Vault, so the
-- private key never leaves the server. pg_cron calls the function every hour with a random token
-- that also lives only in Vault. Forks: change the project URL in the cron job below.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Only the browsers' own push services, so the server never posts anywhere else.
  endpoint text not null unique check (
    char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/'
  ),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  locale text not null default 'uk' check (locale in ('uk', 'en')),
  created_at timestamptz not null default now(),
  last_sent_day date
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "Users see their own subscriptions" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- A device belongs to whoever signed in on it last.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
  values (uid, p_endpoint, p_p256dh, p_auth, case when p_locale = 'en' then 'en' else 'uk' end);
  -- Ten devices are plenty; the oldest go first.
  delete from public.push_subscriptions
  where id in (select id from public.push_subscriptions where user_id = uid order by created_at desc offset 10);
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------- For the push function only (service role) ----------

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'push_cron_token',
  'Lets pg_cron call the push function'
);

create function public.push_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_key', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    'private_jwk', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_jwk'),
    'cron_token', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_token')
  );
$$;

-- Stores a freshly made key pair unless another run already did.
create function public.push_save_vapid(p_public text, p_private_jwk text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_public_key') then
    return;
  end if;
  perform vault.create_secret(p_public, 'vapid_public_key', 'Web Push public key');
  perform vault.create_secret(p_private_jwk, 'vapid_private_jwk', 'Web Push private key (JWK)');
exception when unique_violation then
  null;
end;
$$;

-- People to remind now: it's 19:00 where they are, they studied yesterday but not yet today.
create function public.push_targets()
returns table (id uuid, endpoint text, p256dh text, auth text, locale text, streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.locale, st.current_streak
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  join public.user_stats st on st.user_id = s.user_id
  where extract(hour from now() at time zone p.time_zone) = 19
    and st.current_streak > 0
    and st.last_active_day = (now() at time zone p.time_zone)::date - 1
    and (s.last_sent_day is null or s.last_sent_day < (now() at time zone p.time_zone)::date)
  limit 1000;
$$;

create function public.push_mark(p_sent uuid[], p_gone uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions s
  set last_sent_day = (now() at time zone p.time_zone)::date
  from public.profiles p
  where p.id = s.user_id and s.id = any (p_sent);
  delete from public.push_subscriptions where id = any (p_gone);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['public.push_config()', 'public.push_save_vapid(text, text)', 'public.push_targets()', 'public.push_mark(uuid[], uuid[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

select cron.schedule('streak-reminders', '0 * * * *', $$
  select net.http_post(
    url := 'https://eahfdgqyjeyensmskvcg.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_token')
    ),
    body := jsonb_build_object('action', 'remind')
  );
$$);
