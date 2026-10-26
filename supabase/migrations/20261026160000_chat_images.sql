-- Photos in chat, for the owner only.
--
-- Pictures go to a public Storage bucket under <user id>/<random name>; only the owner may upload
-- there, and send_message accepts an image only from the owner and only from that bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 5 * 1024 * 1024, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

create policy "Only the owner uploads chat images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.has_min_role('owner'))
  );

create policy "The owner removes their chat images" on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.has_min_role('owner'))
  );

alter table public.chat_messages add column image_url text;

-- A message is text, a picture, or both.
alter table public.chat_messages drop constraint chat_messages_check;
alter table public.chat_messages add constraint chat_messages_check check (
  (deleted_at is null and char_length(body) <= 500 and (char_length(body) >= 1 or image_url is not null))
  or (deleted_at is not null and body = '' and image_url is null)
);

-- Deleting a message also drops its picture from the message.
create or replace function public.delete_my_message(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.chat_messages set body = '', image_url = null, deleted_at = now()
  where id = p_id and user_id = (select auth.uid()) and deleted_at is null;
$$;

create or replace function public.mod_delete_message(p_id bigint, p_reason text default '')
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
  update public.chat_messages set body = '', image_url = null, deleted_at = now() where id = p_id and deleted_at is null;
  update public.message_reports set resolved_at = now(), resolved_by = (select auth.uid()), resolution = 'deleted'
  where message_id = p_id and resolved_at is null;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), 'delete_message', msg.user_id,
    jsonb_build_object('message', p_id, 'room', case when msg.room like 'dm:%' then 'dm' else msg.room end, 'text', left(msg.body, 200), 'reason', left(coalesce(p_reason, ''), 300)));
end;
$$;

-- The same checks as before, plus the optional picture. The old three-argument version goes, so
-- the API has exactly one send_message to call.
drop function public.send_message(text, text, bigint);

create function public.send_message(p_room text, p_body text, p_reply_to bigint default null, p_image text default null)
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

  if p_image is not null then
    if not private.has_min_role('owner') then
      raise exception 'images_owner_only';
    end if;
    if p_image !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/chat-images/' || uid::text || '/[A-Za-z0-9_-]+\.(webp|jpg|jpeg|png|gif)$') then
      raise exception 'bad_image';
    end if;
  end if;

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
  if body = '' and p_image is null then
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
    if p_image is null and lower(last_own.body) = lower(clean.masked) and last_own.created_at > now() - interval '2 minutes' then
      raise exception 'duplicate';
    end if;
  end if;

  -- Accounts younger than a day can't post links.
  if me.created_at > now() - interval '24 hours' and not staff
    and body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ru|ua|io|gg|me|ly|xyz|app|dev|co|tk|site|online|top|link)\M)' then
    raise exception 'no_links_yet';
  end if;

  insert into public.chat_messages (room, user_id, body, reply_to, filtered, image_url)
  values (p_room, uid, clean.masked, p_reply_to, clean.hits, p_image)
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

revoke all on function public.send_message(text, text, bigint, text) from public, anon;
grant execute on function public.send_message(text, text, bigint, text) to authenticated;
