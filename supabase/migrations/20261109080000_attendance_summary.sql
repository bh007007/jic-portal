-- 강사 포털 '출석 확인 · 사유별 합계'와 '무단결석 목록'(메뉴 검토표 LMS, 원칙 L4: 출석에 결석 사유 표시). 여러 번 실행해도 된다.
-- 출석(20261109000000_attendance.sql)과 결석 신청(absence_requests, 학생 포털)을 묶어 읽기만 한다. 새 표·쓰기는 없다.
-- 결석의 사유는 세 가지로 나눈다:
--   사유 인정  = 출석 행의 excused(매니저·직원이 정함)
--   신청 인정  = 그날 승인된 결석 신청이 있음(병결·공결·개인). 신청의 교시와 수업 시각은 아직 맞추지 않는다(업체 교시표 연결 뒤)
--   무단      = 둘 다 아님. 인트라넷 무단결석 패널티 후보(20261109050000_absence_penalties.sql)와 같은 기준이다
-- 강사 포털 사용자(is_lms_user)만 받는다. 기간은 92일 안이다. 사유 글(reason)은 주지 않는다.

-- 학생별 합계
create or replace function public.lms_attendance_summary(p_from date, p_to date, p_campus text default '')
returns table (student_no text, campus text, sessions int, present int, absent int, late int, unchecked int, late_min int,
               excused int, req_sick int, req_official int, req_personal int, unexcused int)
language sql stable security definer set search_path = public as $$
  with r as (
    select a.student_no, s.campus, a.result, a.excused, a.late_min,
           (select q.kind from public.absence_requests q
             where q.student_no = a.student_no and q.absence_date = s.day and q.status = 'approved'
             order by q.kind limit 1) as req
      from public.attendance a
      join public.class_sessions s on s.id = a.session_id
     where public.is_lms_user()
       and s.day between p_from and p_to and p_to - p_from between 0 and 92
       and (coalesce(p_campus, '') = '' or s.campus = p_campus)
  )
  select student_no, min(campus), count(*)::int,
         (count(*) filter (where result = 'AT'))::int,
         (count(*) filter (where result = 'AB'))::int,
         (count(*) filter (where result = 'TA'))::int,
         (count(*) filter (where result is null))::int,
         coalesce(sum(late_min), 0)::int,
         (count(*) filter (where result = 'AB' and excused))::int,
         (count(*) filter (where result = 'AB' and not excused and req = 'sick'))::int,
         (count(*) filter (where result = 'AB' and not excused and req = 'official'))::int,
         (count(*) filter (where result = 'AB' and not excused and req = 'personal'))::int,
         (count(*) filter (where result = 'AB' and not excused and req is null))::int
    from r
   group by student_no
   order by 13 desc, 5 desc, 1;
$$;

-- 한 학생의 수업별 출석(학생 상세·합계 화면 펼치기): 날짜·시각·캠퍼스·과목·강사·교실·결과·지각 분·사유 인정·그날 결석 신청(종류·상태)
create or replace function public.lms_student_attendance(p_student_no text, p_from date, p_to date)
returns table (day date, start_time text, campus text, subject text, teacher_name text, room text,
               result text, late_min smallint, excused boolean, request_kind text, request_status text)
language sql stable security definer set search_path = public as $$
  select s.day, to_char(s.start_time, 'HH24:MI'), s.campus, s.subject,
         coalesce(nullif(t.nickname, ''), t.name, ''), coalesce(c.num, ''),
         a.result, a.late_min, a.excused,
         q.kind, q.status
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    left join public.staff t on t.id = s.teacher_id
    left join public.classrooms c on c.id = s.classroom_id
    left join lateral (
      select q.kind, q.status from public.absence_requests q
       where q.student_no = a.student_no and q.absence_date = s.day and q.status <> 'cancelled'
       order by (q.status = 'approved') desc, q.created_at desc limit 1
    ) q on true
   where public.is_lms_user() and a.student_no = p_student_no
     and s.day between p_from and p_to and p_to - p_from between 0 and 92
   order by s.day desc, s.start_time desc;
$$;

revoke all on function public.lms_attendance_summary(date, date, text) from public, anon;
grant execute on function public.lms_attendance_summary(date, date, text) to authenticated, service_role;
revoke all on function public.lms_student_attendance(text, date, date) from public, anon;
grant execute on function public.lms_student_attendance(text, date, date) to authenticated, service_role;
