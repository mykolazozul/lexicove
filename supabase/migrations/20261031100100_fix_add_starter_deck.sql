-- Users may not set words.user_id themselves (it defaults to auth.uid()), so leave it out.
create or replace function public.add_starter_deck(p_deck text, p_to_notion boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  source uuid;
  added integer;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  if p_to_notion then
    select id into source from public.notion_sources where user_id = uid and kind = 'words' order by created_at limit 1;
  end if;

  insert into public.words (word, translation, pronunciation, examples, category, added_on, source_id, needs_push)
  select d.word, d.translation, d.pronunciation, d.example, d.category,
    (now() at time zone private.my_time_zone())::date, source, source is not null
  from public.deck_words d
  where d.deck = p_deck
    and not exists (
      select 1 from public.words w where w.user_id = uid and w.deleted_at is null and lower(w.word) = lower(d.word)
    )
  order by d.sort;
  get diagnostics added = row_count;
  return added;
end;
$$;
