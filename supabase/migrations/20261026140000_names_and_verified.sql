-- Names everyone sees: how often they may change, what they may contain, and a verified badge.
--
-- Display names change at most once every 7 days, usernames once every 30 (the first change is
-- free). Both are checked against the chat's word list, also with spaces, digits and look-alike
-- letters squeezed out, and ordinary users can't pose as staff. Admins and the owner skip the
-- waiting time and the staff-word rule.

alter table public.profiles
  add column verified boolean not null default false,
  add column display_name_changed_at timestamptz,
  add column username_changed_at timestamptz;

grant select (verified) on public.profiles to authenticated;

-- Whether a name is unacceptable, and why; null when it's fine.
create function private.name_problem(p_name text, p_staff boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  squeezed text;
  variant text;
  harsh text[] := array[
    'хуй', 'хуе', 'хуё', 'хуя', 'пизд', 'пізд', 'ебан', 'ебат', 'ёбан', 'єбан', 'бляд', 'блят', 'залуп', 'шлюх', 'гандон',
    'підор', 'пидор', 'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'pussy', 'asshole'
  ];
begin
  if p_name ~ '[[:cntrl:]]'
    or position(chr(8203) in p_name) > 0 or position(chr(8204) in p_name) > 0 or position(chr(8205) in p_name) > 0
    or position(chr(8288) in p_name) > 0 or position(chr(65279) in p_name) > 0 then
    return 'name_invalid';
  end if;
  if (private.filter_profanity(p_name)).hits > 0 then
    return 'name_bad_word';
  end if;
  -- "F u c k", "х.у.й", "sh1t": the same words with everything but letters squeezed out.
  squeezed := regexp_replace(lower(p_name), '[^[:alpha:]0-9@$]', '', 'g');
  foreach variant in array array[translate(squeezed, '0134578@$', 'oieastbas'), translate(squeezed, 'aeopcxykmtbiё', 'аеорсхукмтвіе')] loop
    if exists (select 1 from unnest(harsh) as word where position(word in variant) > 0) then
      return 'name_bad_word';
    end if;
  end loop;
  if not p_staff and lower(p_name) ~ '\m(lexicove|admin|адмін|админ|moderator|модератор|support|підтримк|поддержк|official|офіційн|официальн|owner|власник|system|систем)' then
    return 'name_reserved';
  end if;
  return null;
end;
$$;

revoke all on function private.name_problem(text, boolean) from public, anon, authenticated;

create function private.check_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff boolean := old.role >= 'admin';
  problem text;
begin
  if new.display_name is distinct from old.display_name then
    new.display_name := btrim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
    if char_length(new.display_name) not between 2 and 32 then
      raise exception 'name_length';
    end if;
    problem := private.name_problem(new.display_name, staff);
    if problem is not null then
      raise exception '%', problem;
    end if;
    if not staff and old.display_name_changed_at > now() - interval '7 days' then
      raise exception 'name_too_soon' using detail = (old.display_name_changed_at + interval '7 days')::text;
    end if;
    new.display_name_changed_at := now();
  end if;

  if new.username is distinct from old.username then
    if new.username is null then
      raise exception 'name_invalid';
    end if;
    problem := private.name_problem(new.username, staff);
    if problem is not null then
      raise exception '%', problem;
    end if;
    if not staff and old.username is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username_too_soon' using detail = (old.username_changed_at + interval '30 days')::text;
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.check_names() from public, anon, authenticated;

create trigger profiles_check_names before update of display_name, username on public.profiles
  for each row execute function private.check_names();

-- Cards in chat, leagues and friend lists now carry the badge.
create or replace function private.public_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'role', p.role, 'xp', p.xp, 'equipped', p.equipped, 'verified', p.verified
  )
  from public.profiles p where p.id = p_user;
$$;

-- Only the owner hands out the badge.
create function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role('owner');
  update public.profiles set verified = p_verified where id = p_user;
  if not found then
    raise exception 'no such user';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'set_verified', p_user, jsonb_build_object('verified', p_verified));
end;
$$;

revoke all on function public.admin_set_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;
