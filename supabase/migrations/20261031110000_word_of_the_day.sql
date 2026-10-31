-- Word of the day: one word a day from the user's own list (new and shaky words first), or from
-- the starter decks for guests and empty lists. The home page shows it, and Web Push sends it at
-- 09:00 local time to people who have reminders on and didn't switch this one off.

alter table public.profiles add column word_push boolean not null default true;
grant update (word_push) on public.profiles to authenticated;

alter table public.push_subscriptions add column last_word_day date;

-- The same day gives the same word. Runs with the caller's rights: a signed-in user only sees
-- their own words, and the push function (service role) reads anyone's.
create function private.word_pick(p_user uuid, p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'source', 'mine', 'id', w.id, 'word', w.word, 'translation', w.translation,
        'pronunciation', w.pronunciation, 'example', w.examples, 'category', w.category
      )
      from public.words w
      left join public.word_progress wp on wp.user_id = w.user_id and wp.word_id = w.id
      where w.user_id = p_user and w.deleted_at is null and w.translation <> ''
      -- Words that aren't solid yet (stability under three weeks) come first.
      order by coalesce(wp.stability, 0) >= 21, md5(w.id::text || p_day::text)
      limit 1
    ),
    (
      select jsonb_build_object(
        'source', 'deck', 'id', null, 'word', d.word, 'translation', d.translation,
        'pronunciation', d.pronunciation, 'example', d.example, 'category', d.category
      )
      from public.deck_words d
      order by md5(d.id::text || p_day::text)
      limit 1
    )
  );
$$;

revoke all on function private.word_pick(uuid, date) from public, anon;
grant execute on function private.word_pick(uuid, date) to authenticated, service_role;

create function public.word_of_the_day()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date;
begin
  if uid is null then
    -- Guests: a starter-deck word, by the UTC date.
    today := (now() at time zone 'UTC')::date;
    return (
      select jsonb_build_object(
        'source', 'deck', 'id', null, 'word', d.word, 'translation', d.translation,
        'pronunciation', d.pronunciation, 'example', d.example, 'category', d.category, 'day', today
      )
      from public.deck_words d
      order by md5(d.id::text || today::text)
      limit 1
    );
  end if;
  today := (now() at time zone private.my_time_zone())::date;
  return private.word_pick(uid, today) || jsonb_build_object('day', today);
end;
$$;

revoke all on function public.word_of_the_day() from public;
grant execute on function public.word_of_the_day() to anon, authenticated;

-- ---------- For the push function only (service role) ----------

-- People to send the word to now: it's 09:00 where they are and they haven't had today's word.
create function public.push_word_targets()
returns table (id uuid, endpoint text, p256dh text, auth text, locale text, word text, translation text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.locale, pick->>'word', pick->>'translation'
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  cross join lateral private.word_pick(s.user_id, (now() at time zone p.time_zone)::date) as pick
  where p.word_push
    and extract(hour from now() at time zone p.time_zone) = 9
    and (s.last_word_day is null or s.last_word_day < (now() at time zone p.time_zone)::date)
  limit 1000;
$$;

create function public.push_mark_words(p_sent uuid[], p_gone uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions s
  set last_word_day = (now() at time zone p.time_zone)::date
  from public.profiles p
  where p.id = s.user_id and s.id = any (p_sent);
  delete from public.push_subscriptions where id = any (p_gone);
$$;

revoke all on function public.push_word_targets() from public, anon, authenticated;
revoke all on function public.push_mark_words(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.push_word_targets() to service_role;
grant execute on function public.push_mark_words(uuid[], uuid[]) to service_role;
