-- Each level asks for more than the last, and the step itself grows:
-- going from level L to L+1 takes 100 + 50·(L−1) + 10·(L−1)² XP (src/lib/progression.ts matches).

create or replace function private.level_for(total integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  level integer := 1;
  remaining integer := greatest(coalesce(total, 0), 0);
  step integer;
begin
  loop
    step := 100 + 50 * (level - 1) + 10 * (level - 1) * (level - 1);
    exit when remaining < step;
    remaining := remaining - step;
    level := level + 1;
  end loop;
  return level;
end;
$$;
