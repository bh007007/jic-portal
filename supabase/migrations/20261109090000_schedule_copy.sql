-- 강사 포털 수업 관리: 하루 수업을 다른 날로 복사(업체 '시간표 → 그날 출석 행'을 대신하는 1차 방법). 여러 번 실행해도 된다.
-- 업체 반복 시간표(schedule_detail)는 아직 구조를 모르므로, 스케줄러·매니저가 한 날을 만들어 두고 다음 날들로 복사한다.
-- security invoker: 수업·출석 행 쓰기 권한은 출석 표의 RLS(can_schedule: 매니저·관리자·스케줄러)와 트리거가 그대로 막는다.
-- 건너뛰는 날: 원래 날, 그 캠퍼스(또는 모든 캠퍼스) 휴일, 마감된 날. 같은 날·시각·캠퍼스·강사·교실 수업이 이미 있으면 그 수업은 건너뛴다.
-- 학생: 원래 수업의 학생 중 그날 재학하는 학생만(lms_students: 마지막 연장 종료일 기준) 옮긴다. 결과·메모는 옮기지 않는다.

create or replace function public.lms_copy_sessions(p_from date, p_to date[], p_campus text default '')
returns integer language plpgsql security invoker set search_path = public as $$
declare
  d date;
  s public.class_sessions;
  new_id uuid;
  n integer := 0;
begin
  if not public.can_schedule() then raise exception 'not_allowed'; end if;
  if coalesce(array_length(p_to, 1), 0) = 0 or array_length(p_to, 1) > 31 then raise exception 'bad_range'; end if;
  foreach d in array p_to loop
    continue when d is null or d = p_from;
    for s in select * from public.class_sessions where day = p_from and (coalesce(p_campus, '') = '' or campus = p_campus) order by start_time loop
      continue when public.attendance_closed(d, s.campus);
      continue when exists (select 1 from public.holidays h where h.day = d and h.campus in ('', s.campus));
      continue when exists (
        select 1 from public.class_sessions x
         where x.day = d and x.start_time = s.start_time and x.campus = s.campus
           and x.teacher_id is not distinct from s.teacher_id and x.classroom_id is not distinct from s.classroom_id);
      insert into public.class_sessions (day, start_time, minutes, campus, kind, subject, teacher_id, sub_teacher_id, classroom_id)
        values (d, s.start_time, s.minutes, s.campus, s.kind, s.subject, s.teacher_id, s.sub_teacher_id, s.classroom_id)
        returning id into new_id;
      insert into public.attendance (session_id, student_no, enrollment_id)
        select new_id, a.student_no, a.enrollment_id
          from public.attendance a
         where a.session_id = s.id
           and exists (select 1 from public.lms_students(d) l where l.student_no = a.student_no and l.start_date <= d);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.lms_copy_sessions(date, date[], text) from public, anon;
grant execute on function public.lms_copy_sessions(date, date[], text) to authenticated, service_role;
