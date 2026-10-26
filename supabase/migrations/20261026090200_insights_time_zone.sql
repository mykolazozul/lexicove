-- The review forecast counted days in UTC; it now uses the time zone saved in the profile.

create or replace function public.study_insights()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
    tz as (
      select coalesce((select p.time_zone from public.profiles p where p.id = (select auth.uid())), 'UTC') as name
    ),
    today as (select (now() at time zone (select name from tz))::date as day)
  select jsonb_build_object(
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', category, 'correct', correct, 'total', total) order by total desc), '[]')
      from (
        select coalesce(nullif(w.category, ''), '—') as category,
               count(*) filter (where r.correct) as correct,
               count(*) as total
        from public.review_log r
        join public.words w on w.id = r.word_id
        where r.user_id = (select auth.uid()) and r.reviewed_at > now() - interval '90 days'
        group by 1
        order by count(*) desc
        limit 12
      ) t
    ),
    'hardest', (
      select coalesce(jsonb_agg(jsonb_build_object('word', word, 'translation', translation, 'lapses', lapses) order by lapses desc, difficulty desc), '[]')
      from (
        select w.word, w.translation, p.lapses, p.difficulty
        from public.word_progress p
        join public.words w on w.id = p.word_id
        where p.user_id = (select auth.uid()) and p.lapses > 0 and w.deleted_at is null
        order by p.lapses desc, p.difficulty desc
        limit 8
      ) t
    ),
    -- Today's count includes everything already overdue.
    'forecast', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]')
      from (
        select gs.d,
               (select count(*) from public.word_progress p
                where p.user_id = (select auth.uid())
                  and case
                    when gs.d = (select day from today) then (p.due at time zone (select name from tz))::date <= gs.d
                    else (p.due at time zone (select name from tz))::date = gs.d
                  end) as n
        from (select ((select day from today) + i) as d from generate_series(0, 6) i) gs
      ) t
    )
  );
$$;

revoke all on function public.study_insights() from public, anon;
grant execute on function public.study_insights() to authenticated;
