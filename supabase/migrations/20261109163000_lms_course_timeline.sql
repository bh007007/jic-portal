-- 강사 포털 CEFR 성장선(원칙 L2)에 코스 변경 시점을 표시하려고, 한 학생의 연수 시작·코스 변경을 날짜순으로 준다. 여러 번 실행해도 된다.
-- 설계서 L2: "코스를 바꾸면 성장선에 변경 시점을 표시하고, CEFR 값은 'JIC 기준 추정 레벨'로 표기한다."
-- legacy_enrollments·legacy_course_changes 는 직원만 읽는다. 이 함수는 security definer 로 강사 포털 사용자(is_lms_user)에게 날짜·코스 이름만 준다
-- (금액·기숙사·메모 같은 다른 열은 주지 않는다). 취소·연기된 연수는 뺀다(lms_students 와 같은 조건).
-- 코스 변경 표(20261109030000_legacy_extend.sql)가 없는 DB 에서도 만들 수 있게 없으면 만든다(같은 정의).

create table if not exists public.legacy_course_changes (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_course_changes enable row level security;
drop policy if exists legacy_course_changes_staff_read on public.legacy_course_changes;
create policy legacy_course_changes_staff_read on public.legacy_course_changes for select to authenticated using (public.is_staff());
revoke all on public.legacy_course_changes from anon, authenticated;
grant select on public.legacy_course_changes to authenticated;
grant select, insert, update, delete on public.legacy_course_changes to service_role;

create or replace function public.lms_course_timeline(p_student_no text)
returns table (day date, kind text, course text, prev_course text)
language sql stable security definer set search_path = public as $$
  with e as (
    select le.id, le.data from public.legacy_enrollments le
     where le.data ->> 'tr_st_id' = p_student_no
       and coalesce(le.data ->> 'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청'
       and coalesce(le.data ->> 'tr_start_date', '') ~ '^\d{4}-\d{2}-\d{2}'
  )
  select * from (
    select left(e.data ->> 'tr_start_date', 10)::date, 'start'::text, coalesce(e.data ->> 'courses', ''), ''::text
      from e
    union all
    select left(c.data ->> 'chg_course_date', 10)::date, 'change', coalesce(c.data ->> 'chg_course', ''), coalesce(c.data ->> 'prev_chg_course', '')
      from public.legacy_course_changes c join e on e.id = c.data ->> 'tr_id'
     where coalesce(c.data ->> 'chg_course_date', '') ~ '^\d{4}-\d{2}-\d{2}'
       and coalesce(c.data ->> 'chg_course', '') <> coalesce(c.data ->> 'prev_chg_course', '')
  ) t (day, kind, course, prev_course)
   where public.is_lms_user() and length(p_student_no) between 1 and 20
   order by 1, 2 desc;
$$;

revoke execute on function public.lms_course_timeline(text) from public, anon;
grant execute on function public.lms_course_timeline(text) to authenticated, service_role;
