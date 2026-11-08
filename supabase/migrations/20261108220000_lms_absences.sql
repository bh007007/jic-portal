-- 강사 포털(LMS): 날짜별 결석 신청 보기(원칙 L4 '출석 현황에서 사유 표시'). 여러 번 실행해도 된다.
-- 결석 신청(absence_requests, 학생 포털이 쓰고 직원이 처리)은 직원·학생 본인만 읽는다(20261108100000_student_intranet.sql).
-- 강사 포털 사용자에게는 이 함수로 수업에 필요한 것만 준다: 학생, 날짜, 교시, 종류(병결·공결·개인), 처리 상태. 사유 글(reason)과 담당자 메모는 주지 않는다.
-- 승인·반려는 지금처럼 인트라넷이 한다(결정 대기: 강사 포털 매니저 승인, docs/leo-todo.md).

create or replace function public.lms_absences(p_from date default null, p_to date default null)
returns table (id uuid, student_no text, name text, campus text, absence_date date, periods smallint[], kind text, status text)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_from, public.manila_today()) as f, coalesce(p_to, p_from, public.manila_today()) as t)
  select a.id, a.student_no,
         coalesce(e.data ->> 'st_name', ''),
         case upper(trim(coalesce(e.data ->> 'first_co_ca_code', '')))
           when 'PREMIUM' then 'Premium' when 'CHALLENGER' then 'Challenger' when 'MCO' then 'MCO'
           else coalesce(e.data ->> 'first_co_ca_code', '') end,
         a.absence_date, a.periods, a.kind, a.status
    from public.absence_requests a
    join d on a.absence_date between d.f and d.t
    left join public.legacy_enrollments e on e.id = a.enrollment_id
   where public.is_lms_user()
     and a.status <> 'cancelled'
     and d.t - d.f <= 31
   order by a.absence_date, 4, 3;
$$;

revoke execute on function public.lms_absences(date, date) from public, anon;
grant execute on function public.lms_absences(date, date) to authenticated, service_role;
