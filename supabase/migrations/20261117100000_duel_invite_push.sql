-- Duel challenges as Web Push, so a friend sees one even with the app closed. A trigger asks the
-- push function to send it the moment the invite is created (pg_net queues the call until the
-- insert commits); the function reads who to notify through push_duel_invite_targets. People who
-- switched duel notifications off in Settings, or have no push subscription, are skipped.

alter table public.profiles add column duel_push boolean not null default true;
grant update (duel_push) on public.profiles to authenticated;

-- The invitee's devices, with what the notification says. Only for an invite still open.
create function public.push_duel_invite_targets(p_duel uuid)
returns table (id uuid, endpoint text, p256dh text, auth text, locale text, duel_id uuid, name text, stake integer, level text, rematch boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.locale, d.id, coalesce(c.display_name, c.username, 'Lexicove'), d.stake, d.level, d.rematch_of is not null
  from public.duels d
  join public.profiles p on p.id = d.player_b
  join public.profiles c on c.id = d.player_a
  join public.push_subscriptions s on s.user_id = d.player_b
  where d.id = p_duel and d.kind = 'friendly' and d.status = 'waiting'
    and d.created_at > now() - interval '2 minutes' and p.duel_push;
$$;

revoke all on function public.push_duel_invite_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_duel_invite_targets(uuid) to service_role;

create function private.duel_invite_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions s where s.user_id = new.player_b)
    and (select duel_push from public.profiles where id = new.player_b) then
    -- Forks: change the project URL here and in the streak-reminders cron job.
    perform net.http_post(
      url := 'https://eahfdgqyjeyensmskvcg.supabase.co/functions/v1/push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_token')
      ),
      body := jsonb_build_object('action', 'duel_invite', 'duel', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.duel_invite_push() from public, anon, authenticated;

create trigger duels_invite_push after insert on public.duels
  for each row when (new.kind = 'friendly' and new.status = 'waiting')
  execute function private.duel_invite_push();
