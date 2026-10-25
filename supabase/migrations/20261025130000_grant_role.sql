-- Gives an existing account a role. Run it from the Supabase SQL editor (as postgres):
--
--   select private.grant_role('you@example.com', 'owner');
--   select private.grant_role('you+test@example.com', 'tester');
--
-- Not callable through the API: it lives in the private schema and nobody else may execute it.
create function private.grant_role(target_email text, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select id into target from auth.users where lower(email) = lower(target_email);
  if target is null then
    raise exception 'No account with email %', target_email;
  end if;

  update public.profiles
  set role = new_role,
      -- Test accounts stay out of leagues, leaderboards and public stats.
      hidden_from_stats = (new_role = 'tester'),
      -- ...and start with enough coins and XP to try almost everything.
      coins = case when new_role = 'tester' then greatest(coins, 1000000) else coins end,
      xp = case when new_role = 'tester' then greatest(xp, 250000) else xp end
  where id = target;
end;
$$;

revoke all on function private.grant_role(text, public.app_role) from public, anon, authenticated;
