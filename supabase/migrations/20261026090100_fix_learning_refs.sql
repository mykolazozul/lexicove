-- word_progress has no rule_id, and PL/pgSQL plans a whole condition before running it, so the
-- combined check failed on every word_progress write. The rule check now sits in its own branch.

create or replace function private.check_learning_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.word_id is not null
    and not exists (select 1 from public.words w where w.id = new.word_id and w.user_id = new.user_id) then
    raise exception 'word does not belong to this user';
  end if;
  if tg_table_name = 'review_log' then
    if new.rule_id is not null
      and not exists (select 1 from public.rules r where r.id = new.rule_id and r.user_id = new.user_id) then
      raise exception 'rule does not belong to this user';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.check_learning_refs() from public, anon, authenticated;
