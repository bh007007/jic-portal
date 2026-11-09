-- 인트라넷 자동 확인(11/9 결정 I3, jic-intranet Worker 크론 apps/intranet/worker/cron.ts): 화면을 열지 않아도 통금 위반·무단결석 후보를 정리한다.
-- 크론은 로그인한 사람이 없어 서비스 키로 읽고 쓴다. intranet_absence_marks(직원·매니저만)는 서비스 키에 빈 결과를 줘서
-- 대기 중인 무단결석 후보를 지우게 되므로, 같은 결과를 서비스 키에만 주는 함수를 따로 둔다. 강사 포털 출석은 읽기만 한다. 여러 번 실행해도 된다.

-- 기간 안의 결석(수업 × 학생, 결과 AB): intranet_absence_marks(20261109100000_intranet_manager.sql)와 같은 열·순서·62일 제한.
-- 실행 권한은 서비스 키(service_role)만. 로그인한 사용자·익명은 부를 수 없다.
create or replace function public.intranet_absence_marks_service(p_from date, p_to date)
returns table (student_no text, day date, start_time text, campus text, subject text, excused boolean, closed boolean)
language sql stable security definer set search_path = public as $$
  select a.student_no, s.day, to_char(s.start_time, 'HH24:MI'), s.campus, s.subject, a.excused,
         exists (select 1 from public.attendance_closings c where c.day = s.day and c.campus = s.campus)
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
   where a.result = 'AB'
     and s.day between p_from and p_to and p_to - p_from between 0 and 62
   order by s.day, a.student_no, s.start_time;
$$;
revoke all on function public.intranet_absence_marks_service(date, date) from public, anon, authenticated;
grant execute on function public.intranet_absence_marks_service(date, date) to service_role;
