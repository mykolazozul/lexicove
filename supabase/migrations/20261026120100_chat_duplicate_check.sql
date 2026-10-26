-- A repeated message that contained a filtered word slipped past the duplicate check, because
-- the stored copy is masked and the new one wasn't yet. The filter now runs first.

-- Errors are short codes the app translates; "muted" and "slow_mode" carry details.
create or replace function public.send_message(p_room text, p_body text, p_reply_to bigint default null)
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

  -- Stored messages are already filtered, so compare the filtered text.
  select * into clean from private.filter_profanity(body);
  select * into last_own from public.chat_messages where user_id = uid and room = p_room order by id desc limit 1;
  if found then
    if coalesce(room_row.slow_mode_seconds, 0) > 0 and not staff
      and last_own.created_at > now() - make_interval(secs => room_row.slow_mode_seconds) then
      raise exception 'slow_mode' using detail = room_row.slow_mode_seconds::text;
    end if;
    if lower(last_own.body) = lower(clean.masked) and last_own.created_at > now() - interval '2 minutes' then
      raise exception 'duplicate';
    end if;
  end if;

  -- Accounts younger than a day can't post links.
  if me.created_at > now() - interval '24 hours' and not staff
    and body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ru|ua|io|gg|me|ly|xyz|app|dev|co|tk|site|online|top|link)\M)' then
    raise exception 'no_links_yet';
  end if;

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
