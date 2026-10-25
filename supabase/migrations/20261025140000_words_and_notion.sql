-- Words, grammar rules and the Notion link that keeps them in sync.
--
-- Notion stays the source of truth for synced rows. The app may edit them; such rows are
-- flagged with needs_push until the Edge Function writes them back to Notion.
-- Notion tokens are stored encrypted in Supabase Vault and are only reachable with the
-- service role (the Edge Function), never from the browser.

-- ---------- Notion connection ----------

create table public.notion_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id text not null,
  workspace_name text,
  workspace_icon text,
  bot_id text not null,
  access_secret_id uuid not null,
  refresh_secret_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_connections enable row level security;

create policy "Users can see their own Notion connection"
  on public.notion_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Users see which workspace is connected, never the secret ids.
revoke all on public.notion_connections from anon, authenticated;
grant select (user_id, workspace_name, workspace_icon, created_at) on public.notion_connections to authenticated;

create trigger notion_connections_touch_updated_at
  before update on public.notion_connections
  for each row execute function public.touch_updated_at();

-- One-time values that tie an OAuth redirect back to the user who started it. Service role only.
create table public.notion_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

alter table public.notion_oauth_states enable row level security;
revoke all on public.notion_oauth_states from anon, authenticated;

-- ---------- Notion data sources the user linked ----------

create table public.notion_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('words', 'rules')),
  data_source_id text not null,
  title text not null default '',
  -- app field -> Notion property name, e.g. {"word": "Word", "translation": "Translation"}
  mapping jsonb not null,
  -- Notion property name -> property type, captured when the source is linked
  property_types jsonb not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, data_source_id)
);

alter table public.notion_sources enable row level security;

create policy "Users can see their own sources"
  on public.notion_sources for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can remove their own sources"
  on public.notion_sources for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Linking and syncing go through the Edge Function, which validates the mapping.
revoke insert, update on public.notion_sources from anon, authenticated;
revoke all on public.notion_sources from anon;

-- ---------- Words and rules ----------

create table public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid references public.notion_sources (id) on delete set null,
  notion_page_id text,
  word text not null check (char_length(word) between 1 and 200),
  translation text not null default '' check (char_length(translation) <= 1000),
  pronunciation text not null default '' check (char_length(pronunciation) <= 200),
  examples text not null default '' check (char_length(examples) <= 4000),
  explanation text not null default '' check (char_length(explanation) <= 4000),
  category text not null default '' check (char_length(category) <= 100),
  added_on date,
  notion_edited_at timestamptz,
  needs_push boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, notion_page_id)
);

create index words_user_id_idx on public.words (user_id);
create index words_source_id_idx on public.words (source_id);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid references public.notion_sources (id) on delete set null,
  notion_page_id text,
  rule text not null check (char_length(rule) between 1 and 300),
  topic text not null default '' check (char_length(topic) <= 100),
  explanation text not null default '' check (char_length(explanation) <= 8000),
  examples text not null default '' check (char_length(examples) <= 4000),
  added_on date,
  notion_edited_at timestamptz,
  needs_push boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, notion_page_id)
);

create index rules_user_id_idx on public.rules (user_id);
create index rules_source_id_idx on public.rules (source_id);

alter table public.words enable row level security;
alter table public.rules enable row level security;

create policy "Users manage their own words"
  on public.words for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own rules"
  on public.rules for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Users edit content; Notion ids and sync timestamps are written by the Edge Function only.
revoke all on public.words, public.rules from anon;
revoke truncate on public.words, public.rules, public.notion_sources from authenticated;
revoke insert, update on public.words, public.rules from authenticated;
grant insert (word, translation, pronunciation, examples, explanation, category, added_on, source_id, needs_push)
  on public.words to authenticated;
grant update (word, translation, pronunciation, examples, explanation, category, added_on, source_id, needs_push, deleted_at)
  on public.words to authenticated;
grant insert (rule, topic, explanation, examples, added_on, source_id, needs_push)
  on public.rules to authenticated;
grant update (rule, topic, explanation, examples, added_on, source_id, needs_push, deleted_at)
  on public.rules to authenticated;

create trigger words_touch_updated_at
  before update on public.words
  for each row execute function public.touch_updated_at();

create trigger rules_touch_updated_at
  before update on public.rules
  for each row execute function public.touch_updated_at();

-- A row may only point at a source of the same user, otherwise a push could write
-- into somebody else's Notion.
create function private.check_row_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_id is not null and not exists (
    select 1 from public.notion_sources s where s.id = new.source_id and s.user_id = new.user_id
  ) then
    raise exception 'source does not belong to this user';
  end if;
  return new;
end;
$$;

-- Keeps one account from filling the shared free database.
create function private.limit_rows_per_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into total using new.user_id;
  if total >= 20000 then
    raise exception 'row limit reached (20000 per user)';
  end if;
  return new;
end;
$$;

revoke all on function private.check_row_source() from public, anon, authenticated;
revoke all on function private.limit_rows_per_user() from public, anon, authenticated;

create trigger words_check_source before insert or update of source_id on public.words
  for each row execute function private.check_row_source();
create trigger rules_check_source before insert or update of source_id on public.rules
  for each row execute function private.check_row_source();
create trigger words_limit before insert on public.words
  for each row execute function private.limit_rows_per_user();
create trigger rules_limit before insert on public.rules
  for each row execute function private.limit_rows_per_user();

-- ---------- Token storage (service role only) ----------
-- These sit in the public schema so the Edge Function can call them over the API,
-- but only the service role may execute them.

create function public.notion_save_connection(
  p_user uuid,
  p_access_token text,
  p_refresh_token text,
  p_workspace_id text,
  p_workspace_name text,
  p_workspace_icon text,
  p_bot_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.notion_connections;
  access_id uuid;
  refresh_id uuid;
begin
  select * into existing from public.notion_connections where user_id = p_user;

  if found then
    perform vault.update_secret(existing.access_secret_id, p_access_token);
    access_id := existing.access_secret_id;
    if existing.refresh_secret_id is not null then
      perform vault.update_secret(existing.refresh_secret_id, p_refresh_token);
      refresh_id := existing.refresh_secret_id;
    elsif p_refresh_token is not null then
      refresh_id := vault.create_secret(p_refresh_token, 'notion_refresh:' || p_user::text);
    end if;
  else
    access_id := vault.create_secret(p_access_token, 'notion_access:' || p_user::text);
    if p_refresh_token is not null then
      refresh_id := vault.create_secret(p_refresh_token, 'notion_refresh:' || p_user::text);
    end if;
  end if;

  insert into public.notion_connections
    (user_id, workspace_id, workspace_name, workspace_icon, bot_id, access_secret_id, refresh_secret_id)
  values (p_user, p_workspace_id, p_workspace_name, p_workspace_icon, p_bot_id, access_id, refresh_id)
  on conflict (user_id) do update set
    workspace_id = excluded.workspace_id,
    workspace_name = coalesce(excluded.workspace_name, public.notion_connections.workspace_name),
    workspace_icon = coalesce(excluded.workspace_icon, public.notion_connections.workspace_icon),
    bot_id = excluded.bot_id,
    access_secret_id = excluded.access_secret_id,
    refresh_secret_id = excluded.refresh_secret_id;
end;
$$;

create function public.notion_read_tokens(p_user uuid)
returns table (access_token text, refresh_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.decrypted_secret, r.decrypted_secret
  from public.notion_connections c
  join vault.decrypted_secrets a on a.id = c.access_secret_id
  left join vault.decrypted_secrets r on r.id = c.refresh_secret_id
  where c.user_id = p_user;
$$;

create function public.notion_delete_connection(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.notion_connections;
begin
  select * into existing from public.notion_connections where user_id = p_user;
  if not found then
    return;
  end if;
  delete from public.notion_sources where user_id = p_user;
  delete from public.notion_connections where user_id = p_user;
  delete from vault.secrets where id in (existing.access_secret_id, existing.refresh_secret_id);
end;
$$;

revoke all on function public.notion_save_connection(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notion_read_tokens(uuid) from public, anon, authenticated;
revoke all on function public.notion_delete_connection(uuid) from public, anon, authenticated;
grant execute on function public.notion_save_connection(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.notion_read_tokens(uuid) to service_role;
grant execute on function public.notion_delete_connection(uuid) to service_role;
