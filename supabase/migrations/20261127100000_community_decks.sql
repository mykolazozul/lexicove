-- Community decks: a word list someone shares for others to copy into their own words (and Notion).
-- Publishing copies the chosen words into the deck, so the rest of the author's list stays private
-- and later edits to their words don't change what others already see. Everything goes through
-- the functions below; the tables themselves are closed to clients.

create table public.community_decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  description text not null default '' check (char_length(description) <= 300),
  level text not null default 'mixed' check (level in ('a1', 'a2', 'b1', 'b2', 'c1', 'mixed')),
  word_count integer not null default 0,
  likes integer not null default 0,
  copies integer not null default 0,
  -- Hidden by a moderator: only the owner and staff still see it.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_decks_owner_idx on public.community_decks (owner_id);
create index community_decks_top_idx on public.community_decks (likes desc, copies desc, created_at desc) where not hidden;
create index community_decks_new_idx on public.community_decks (created_at desc) where not hidden;

create table public.community_deck_words (
  deck_id uuid not null references public.community_decks (id) on delete cascade,
  sort integer not null,
  word text not null check (char_length(word) between 1 and 200),
  translation text not null default '' check (char_length(translation) <= 1000),
  pronunciation text not null default '' check (char_length(pronunciation) <= 200),
  example text not null default '' check (char_length(example) <= 4000),
  category text not null default '' check (char_length(category) <= 100),
  primary key (deck_id, sort)
);

create table public.community_deck_likes (
  deck_id uuid not null references public.community_decks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);

create index community_deck_likes_user_idx on public.community_deck_likes (user_id);

-- Who copied a deck, so a second copy doesn't count twice.
create table public.community_deck_copies (
  deck_id uuid not null references public.community_decks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);

create index community_deck_copies_user_idx on public.community_deck_copies (user_id);

alter table public.community_decks enable row level security;
alter table public.community_deck_words enable row level security;
alter table public.community_deck_likes enable row level security;
alter table public.community_deck_copies enable row level security;
revoke all on public.community_decks, public.community_deck_words, public.community_deck_likes, public.community_deck_copies
  from anon, authenticated;

-- Staff (moderator and up) see hidden decks and can hide or show any deck.
create function private.deck_staff(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role >= 'moderator' from public.profiles where id = p_user), false);
$$;

revoke all on function private.deck_staff(uuid) from public, anon, authenticated;

-- Title and description: no swearing, no hidden characters.
create function private.deck_text_ok(p_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hits integer;
begin
  -- Control characters other than line breaks and tabs.
  if p_text ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    return false;
  end if;
  select f.hits into hits from private.filter_profanity(p_text) f;
  return coalesce(hits, 0) = 0;
end;
$$;

revoke all on function private.deck_text_ok(text) from public, anon, authenticated;

-- One deck as the app shows it in a list.
create function private.deck_card(p_deck public.community_decks, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_deck.id,
    'title', p_deck.title,
    'description', p_deck.description,
    'level', p_deck.level,
    'word_count', p_deck.word_count,
    'likes', p_deck.likes,
    'copies', p_deck.copies,
    'hidden', p_deck.hidden,
    'created_at', p_deck.created_at,
    'mine', p_deck.owner_id = p_me,
    'liked', p_me is not null and exists (
      select 1 from public.community_deck_likes l where l.deck_id = p_deck.id and l.user_id = p_me
    ),
    'copied', p_me is not null and exists (
      select 1 from public.community_deck_copies c where c.deck_id = p_deck.id and c.user_id = p_me
    ),
    'owner', private.public_card(p_deck.owner_id),
    'sample', coalesce((
      select jsonb_agg(w.word order by w.sort)
      from (select word, sort from public.community_deck_words where deck_id = p_deck.id order by sort limit 4) w
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.deck_card(public.community_decks, uuid) from public, anon, authenticated;

-- The list: 'top' (most liked), 'new' or 'mine', filtered by level and a search in the title.
create function public.community_decks_list(
  p_sort text default 'top',
  p_level text default null,
  p_search text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pattern text;
  result jsonb;
begin
  if p_sort not in ('top', 'new', 'mine') then
    raise exception 'bad_sort';
  end if;
  if p_sort = 'mine' and me is null then
    return '[]'::jsonb;
  end if;
  if nullif(trim(p_search), '') is not null then
    pattern := '%' || replace(replace(replace(left(trim(p_search), 60), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select d, row_number() over (order by
      case when p_sort = 'top' then d.likes end desc nulls last,
      case when p_sort = 'top' then d.copies end desc nulls last,
      d.created_at desc) as rank
    from public.community_decks d
    where ((p_sort = 'mine' and d.owner_id = me) or (p_sort <> 'mine' and not d.hidden))
      and (p_level is null or d.level = p_level)
      and (pattern is null or d.title ilike pattern or d.description ilike pattern)
    order by rank
    limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
  )
  select coalesce(jsonb_agg(private.deck_card(page.d, me) order by page.rank), '[]'::jsonb)
  into result
  from page;

  return result;
end;
$$;

-- One deck with all its words. Hidden decks only for their owner and staff.
create function public.community_deck(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  deck public.community_decks;
begin
  select * into deck from public.community_decks where id = p_id;
  if not found or (deck.hidden and deck.owner_id is distinct from me and not private.deck_staff(me)) then
    raise exception 'not_found';
  end if;
  return private.deck_card(deck, me) || jsonb_build_object(
    'words', coalesce((
      select jsonb_agg(jsonb_build_object(
        'word', w.word, 'translation', w.translation, 'pronunciation', w.pronunciation, 'example', w.example
      ) order by w.sort)
      from public.community_deck_words w where w.deck_id = p_id
    ), '[]'::jsonb),
    'can_moderate', private.deck_staff(me) and deck.owner_id is distinct from me
  );
end;
$$;

-- Shares some of the user's own words as a deck. Returns the new deck's id.
create function public.community_deck_publish(p_title text, p_description text, p_level text, p_word_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  picked integer;
  v_deck uuid;
begin
  if me is null then
    raise exception 'sign_in_first';
  end if;
  if exists (select 1 from private.restriction(me) r where r.kind in ('ban', 'mute')) then
    raise exception 'restricted';
  end if;
  if char_length(v_title) not between 3 and 60 or char_length(v_description) > 300 then
    raise exception 'bad_text';
  end if;
  if not private.deck_text_ok(v_title) or not private.deck_text_ok(v_description) then
    raise exception 'bad_words';
  end if;
  if coalesce(p_level, '') not in ('a1', 'a2', 'b1', 'b2', 'c1', 'mixed') then
    raise exception 'bad_level';
  end if;
  if coalesce(cardinality(p_word_ids), 0) not between 5 and 300 then
    raise exception 'word_count';
  end if;
  if (select count(*) from public.community_decks where owner_id = me and created_at > now() - interval '1 day') >= 5
    or (select count(*) from public.community_decks where owner_id = me) >= 50 then
    raise exception 'too_many';
  end if;

  select count(distinct w.id) into picked
  from public.words w
  where w.id = any (p_word_ids) and w.user_id = me and w.deleted_at is null;
  if picked < 5 then
    raise exception 'word_count';
  end if;

  insert into public.community_decks (owner_id, title, description, level)
  values (me, v_title, v_description, p_level)
  returning id into v_deck;

  insert into public.community_deck_words (deck_id, sort, word, translation, pronunciation, example, category)
  select v_deck, row_number() over (order by w.added_on nulls last, w.created_at), w.word, w.translation,
    w.pronunciation, left(w.examples, 4000), w.category
  from public.words w
  where w.id = any (p_word_ids) and w.user_id = me and w.deleted_at is null;

  update public.community_decks
  set word_count = (select count(*) from public.community_deck_words x where x.deck_id = community_decks.id)
  where id = v_deck;

  return v_deck;
end;
$$;

-- The owner renames a deck or changes its description and level.
create function public.community_deck_update(p_id uuid, p_title text, p_description text, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
begin
  if me is null then
    raise exception 'sign_in_first';
  end if;
  if char_length(v_title) not between 3 and 60 or char_length(v_description) > 300 then
    raise exception 'bad_text';
  end if;
  if not private.deck_text_ok(v_title) or not private.deck_text_ok(v_description) then
    raise exception 'bad_words';
  end if;
  if coalesce(p_level, '') not in ('a1', 'a2', 'b1', 'b2', 'c1', 'mixed') then
    raise exception 'bad_level';
  end if;
  update public.community_decks
  set title = v_title, description = v_description, level = p_level, updated_at = now()
  where id = p_id and owner_id = me;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- The owner removes a deck for good; copies people already made stay in their lists.
create function public.community_deck_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  delete from public.community_decks where id = p_id and owner_id = me;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Likes or unlikes a deck. Returns the new number of likes.
create function public.community_deck_like(p_id uuid, p_on boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  total integer;
begin
  if me is null then
    raise exception 'sign_in_first';
  end if;
  if not exists (select 1 from public.community_decks where id = p_id and not hidden) then
    raise exception 'not_found';
  end if;
  if p_on then
    insert into public.community_deck_likes (deck_id, user_id) values (p_id, me) on conflict do nothing;
  else
    delete from public.community_deck_likes where deck_id = p_id and user_id = me;
  end if;
  select count(*) into total from public.community_deck_likes where deck_id = p_id;
  update public.community_decks set likes = total where id = p_id;
  return total;
end;
$$;

-- Copies the deck's words the user doesn't have yet into their list (and Notion when asked).
-- Returns how many were added.
create function public.community_deck_copy(p_id uuid, p_to_notion boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  source uuid;
  added integer;
begin
  if me is null then
    raise exception 'sign_in_first';
  end if;
  if not exists (
    select 1 from public.community_decks d
    where d.id = p_id and (not d.hidden or d.owner_id = me)
  ) then
    raise exception 'not_found';
  end if;
  if p_to_notion then
    select id into source from public.notion_sources where user_id = me and kind = 'words' order by created_at limit 1;
  end if;

  insert into public.words (word, translation, pronunciation, examples, category, added_on, source_id, needs_push)
  select d.word, d.translation, d.pronunciation, d.example, d.category,
    (now() at time zone private.my_time_zone())::date, source, source is not null
  from public.community_deck_words d
  where d.deck_id = p_id
    and not exists (
      select 1 from public.words w where w.user_id = me and w.deleted_at is null and lower(w.word) = lower(d.word)
    )
  order by d.sort;
  get diagnostics added = row_count;

  insert into public.community_deck_copies (deck_id, user_id) values (p_id, me) on conflict do nothing;
  update public.community_decks
  set copies = (select count(*) from public.community_deck_copies c where c.deck_id = p_id)
  where id = p_id;

  return added;
end;
$$;

-- A moderator hides a deck from the lists (or shows it again).
create function public.community_deck_hide(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  owner uuid;
begin
  select owner_id into owner from public.community_decks where id = p_id;
  if owner is null then
    raise exception 'not_found';
  end if;
  if not private.deck_staff(me) or not private.can_moderate(owner) then
    raise exception 'not_allowed';
  end if;
  update public.community_decks set hidden = p_hidden, updated_at = now() where id = p_id;
end;
$$;

revoke all on function public.community_decks_list(text, text, text, integer, integer) from public;
revoke all on function public.community_deck(uuid) from public;
revoke all on function public.community_deck_publish(text, text, text, uuid[]) from public, anon;
revoke all on function public.community_deck_update(uuid, text, text, text) from public, anon;
revoke all on function public.community_deck_delete(uuid) from public, anon;
revoke all on function public.community_deck_like(uuid, boolean) from public, anon;
revoke all on function public.community_deck_copy(uuid, boolean) from public, anon;
revoke all on function public.community_deck_hide(uuid, boolean) from public, anon;

-- Guests can browse; everything else needs an account.
grant execute on function public.community_decks_list(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.community_deck(uuid) to anon, authenticated;
grant execute on function public.community_deck_publish(text, text, text, uuid[]) to authenticated;
grant execute on function public.community_deck_update(uuid, text, text, text) to authenticated;
grant execute on function public.community_deck_delete(uuid) to authenticated;
grant execute on function public.community_deck_like(uuid, boolean) to authenticated;
grant execute on function public.community_deck_copy(uuid, boolean) to authenticated;
grant execute on function public.community_deck_hide(uuid, boolean) to authenticated;
