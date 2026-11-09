-- 학생 앱 '시간표'(docs/student-app.md): 강사 포털(LMS)의 수업·출석(20261109000000_attendance.sql)에서 학생 본인이 든 수업을 읽는다.
-- 수업·출석 표 권한은 그대로 두고(학생은 자기 출석 행과 그 수업을 이미 읽을 수 있다), 강사 부르는 이름·교실 번호까지 한 번에 주는 함수만 더한다.
-- 강사 메모(attendance.note)·체크한 사람·다른 학생은 주지 않는다. 기간은 31일 안. 여러 번 실행해도 된다.
create or replace function public.student_timetable(p_from date, p_to date)
returns table (id uuid, day date, start_time text, minutes smallint, kind text, subject text, teacher text, room text,
               result text, late_min smallint, excused boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.day, to_char(s.start_time, 'HH24:MI'), s.minutes, s.kind, s.subject,
         coalesce(nullif(t.nickname, ''), t.name, ''), coalesce(c.num, ''),
         a.result, a.late_min, a.excused
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    left join public.staff t on t.id = s.teacher_id
    left join public.classrooms c on c.id = s.classroom_id
   where a.student_no = public.current_student_no()
     and s.day between p_from and p_to and p_to - p_from between 0 and 31
   order by s.day, s.start_time;
$$;
revoke execute on function public.student_timetable(date, date) from public, anon;
grant execute on function public.student_timetable(date, date) to authenticated, service_role;
