-- 무단결석 패널티 후보(인트라넷): 강사 포털 출석(20261109000000_attendance.sql)의 결석을 인트라넷이 읽어 패널티 승인 대기에 올린다.
-- 출석은 강사 포털이 쓰고 인트라넷은 읽기만 한다. 후보 규칙(마감된 날, 사유 인정 아님, 결석 신청·학교 여행 제외, 학생·날짜당 한 건)은
-- apps/intranet/server/core.ts syncAbsencePenalties 한 곳에 있다. 여러 번 실행해도 된다.

-- 패널티 출처에 'attendance'(강사 포털 출석)를 더한다. id 는 'absence-<학생 번호>-<날짜>', source_id 는 '<학생 번호>:<날짜>'.
alter table public.penalties drop constraint if exists penalties_source_check;
alter table public.penalties add constraint penalties_source_check check (source in ('outing', 'guard', 'attendance'));

-- 기간 안의 결석(수업 × 학생, 결과 AB)을 한 줄씩: 학생 번호, 날짜, 수업 시작, 캠퍼스, 과목, 사유 인정, 그 캠퍼스·날짜 마감 여부.
-- 직원(인트라넷)만 받는다. 강사 포털의 출석 읽기 권한(is_lms_user)이 바뀌어도 이 함수의 뜻은 그대로다. 기간은 62일 안.
create or replace function public.intranet_absence_marks(p_from date, p_to date)
returns table (student_no text, day date, start_time text, campus text, subject text, excused boolean, closed boolean)
language sql stable security definer set search_path = public as $$
  select a.student_no, s.day, to_char(s.start_time, 'HH24:MI'), s.campus, s.subject, a.excused,
         exists (select 1 from public.attendance_closings c where c.day = s.day and c.campus = s.campus)
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
   where public.is_staff() and a.result = 'AB'
     and s.day between p_from and p_to and p_to - p_from between 0 and 62
   order by s.day, a.student_no, s.start_time;
$$;
revoke all on function public.intranet_absence_marks(date, date) from public, anon;
grant execute on function public.intranet_absence_marks(date, date) to authenticated, service_role;
