-- Profiles, roles and the rules for who can change what.
--
-- Users may edit only their cosmetic fields. Role, XP, coins and the stats flag are changed
-- by server-side functions only, because the client code is public and anyone could call the API.

-- Ordered from least to most privileged, so `role >= 'moderator'` reads naturally.
create type public.app_role as enum ('user', 'tester', 'moderator', 'admin', 'owner');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  locale text not null default 'uk' check (locale in ('uk', 'en')),
  role public.app_role not null default 'user',
  -- Test and staff accounts that must not appear in leagues, leaderboards or public stats.
  hidden_from_stats boolean not null default false,
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 0 check (coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for every account. Cosmetic fields are user-editable; the rest is server-managed.';

alter table public.profiles enable row level security;

create policy "Signed-in users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level privileges: RLS picks the row, these grants pick the columns.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, locale) on public.profiles to authenticated;

-- Create a profile for every new account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  meta_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(meta_name, split_part(new.email, '@', 1), 'Learner'), 40),
    case when meta_avatar ~ '^https://' and char_length(meta_avatar) <= 500 then meta_avatar end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- For later policies (moderation, admin panel): does the caller have at least this role?
create function public.has_min_role(min_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role >= min_role from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.has_min_role(public.app_role) from public, anon;
grant execute on function public.has_min_role(public.app_role) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
