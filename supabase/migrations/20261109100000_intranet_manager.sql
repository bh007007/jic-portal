-- 인트라넷 역할 2단계 B(docs/roles.md, 11/9 레오님 승인 '인트라넷' 표의 매니저 칸): 강사 포털 매니저(user_roles manager)에게 인트라넷 일부를 연다.
-- 매니저: 홈·외출·통금·가드 리포트·점수표 읽기, 패널티 승인은 수업 관련 위반(무단결석)만('정할 것' 4), 결석 신청 처리(L4, 매니저·오피스 둘 다 '정할 것' 3),
--   학교 여행 읽기, 내부 공지 읽기·쓰기(자기 글만 고침), Student File(맡은 캠퍼스, 인트라넷 서버가 막음).
-- 열지 않는 것: 외박·여행·생활 요청 처리, 귀국 일정·배차, 통금·근무자 설정, 점수표 쓰기, 접근 기록, 학생·가드 계정. 상담 기록(캠퍼스)은 다음 단계.
-- 매니저는 업체 원본(legacy_*)을 읽지 못한다(RLS 그대로). 인트라넷 서버가 가드처럼 서비스 키로 읽고 허용한 경로로만 내보낸다.
-- 직원(staff_users)이면서 매니저 역할도 있으면 직원 권한이 그대로 쓰인다. 여러 번 실행해도 된다.

-- ── 판단 함수
create or replace function public.is_intranet_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['manager']);
$$;
revoke execute on function public.is_intranet_manager() from public, anon;
grant execute on function public.is_intranet_manager() to authenticated, service_role;

-- ── 읽기: 외출·귀가, 가드 리포트, 점수표, 통금 설정, 결석 신청, 학교 여행·참가 신청
drop policy if exists outings_manager_read on public.outings;
create policy outings_manager_read on public.outings for select to authenticated using (public.is_intranet_manager());
drop policy if exists reports_manager_read on public.incident_reports;
create policy reports_manager_read on public.incident_reports for select to authenticated using (public.is_intranet_manager());
drop policy if exists rules_manager_read on public.penalty_rules;
create policy rules_manager_read on public.penalty_rules for select to authenticated using (public.is_intranet_manager());
drop policy if exists stages_manager_read on public.penalty_stages;
create policy stages_manager_read on public.penalty_stages for select to authenticated using (public.is_intranet_manager());
drop policy if exists settings_manager_read on public.intranet_settings;
create policy settings_manager_read on public.intranet_settings for select to authenticated using (public.is_intranet_manager());
drop policy if exists absence_manager_read on public.absence_requests;
create policy absence_manager_read on public.absence_requests for select to authenticated using (public.is_intranet_manager());
drop policy if exists trips_manager_read on public.trips;
create policy trips_manager_read on public.trips for select to authenticated using (public.is_intranet_manager());
drop policy if exists trip_signups_manager_read on public.trip_signups;
create policy trip_signups_manager_read on public.trip_signups for select to authenticated using (public.is_intranet_manager());

-- ── 패널티: 모두 읽기, 승인·반려는 무단결석만. 무단결석 후보(출처 attendance, 대기)는 매니저가 화면을 열 때도 정리한다(core.ts syncAbsencePenalties)
drop policy if exists penalties_manager_read on public.penalties;
create policy penalties_manager_read on public.penalties for select to authenticated using (public.is_intranet_manager());
drop policy if exists penalties_manager_decide on public.penalties;
create policy penalties_manager_decide on public.penalties for update to authenticated
  using (public.is_intranet_manager() and kind = 'absence') with check (public.is_intranet_manager() and kind = 'absence');
drop policy if exists penalties_manager_absence_insert on public.penalties;
create policy penalties_manager_absence_insert on public.penalties for insert to authenticated
  with check (public.is_intranet_manager() and source = 'attendance' and kind = 'absence' and status = 'pending'
              and score is null and decided_at is null and decided_by is null);
drop policy if exists penalties_manager_absence_delete on public.penalties;
create policy penalties_manager_absence_delete on public.penalties for delete to authenticated
  using (public.is_intranet_manager() and source = 'attendance' and status = 'pending');

-- ── 내부 공지: 읽기와 쓰기, 고치기는 자기 글만. 읽음 표시는 본인 것만 넣고, 읽음 확인은 읽는다
drop policy if exists notices_manager_read on public.internal_notices;
create policy notices_manager_read on public.internal_notices for select to authenticated using (public.is_intranet_manager());
drop policy if exists notices_manager_insert on public.internal_notices;
create policy notices_manager_insert on public.internal_notices for insert to authenticated
  with check (public.is_intranet_manager() and author_id = auth.uid());
drop policy if exists notices_manager_update on public.internal_notices;
create policy notices_manager_update on public.internal_notices for update to authenticated
  using (public.is_intranet_manager() and author_id = auth.uid()) with check (public.is_intranet_manager() and author_id = auth.uid());
drop policy if exists notice_reads_manager_read on public.internal_notice_reads;
create policy notice_reads_manager_read on public.internal_notice_reads for select to authenticated using (public.is_intranet_manager());
drop policy if exists notice_reads_manager_insert on public.internal_notice_reads;
create policy notice_reads_manager_insert on public.internal_notice_reads for insert to authenticated
  with check (public.is_intranet_manager() and user_id = auth.uid());

-- ── 결석 신청 처리: 직원(관리자·오피스)과 매니저(20261108100000_student_intranet.sql 의 같은 함수에서 조건만 넓혔다)
create or replace function public.decide_absence_requests(p_ids uuid[], p_approve boolean, p_comment text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (public.is_staff() or public.is_intranet_manager()) then raise exception 'staff_only'; end if;
  update public.absence_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid(),
         staff_comment = nullif(left(coalesce(p_comment, ''), 300), ''), updated_at = now()
   where id = any (p_ids) and status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 무단결석 후보용 결석 읽기: 직원과 매니저(20261109050000_absence_penalties.sql 의 같은 함수에서 조건만 넓혔다)
create or replace function public.intranet_absence_marks(p_from date, p_to date)
returns table (student_no text, day date, start_time text, campus text, subject text, excused boolean, closed boolean)
language sql stable security definer set search_path = public as $$
  select a.student_no, s.day, to_char(s.start_time, 'HH24:MI'), s.campus, s.subject, a.excused,
         exists (select 1 from public.attendance_closings c where c.day = s.day and c.campus = s.campus)
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
   where (public.is_staff() or public.is_intranet_manager()) and a.result = 'AB'
     and s.day between p_from and p_to and p_to - p_from between 0 and 62
   order by s.day, a.student_no, s.start_time;
$$;

-- ── 처리자 이름(화면의 '처리'·'작성' 칸): 직원 이름에 강사 목록 이름(매니저 등 계정이 이어진 사람)을 더한다. 직원과 매니저가 부른다
--   (20261108130000_intranet_deploy.sql 의 같은 함수. 직원 이름이 있으면 그것을 쓴다)
create or replace function public.staff_directory()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, coalesce(nullif(s.name, ''), s.user_id::text) from public.staff_users s
   where public.is_staff() or public.is_intranet_manager()
  union all
  select t.user_id, t.name from public.staff t
   where t.user_id is not null and not exists (select 1 from public.staff_users su where su.user_id = t.user_id)
     and (public.is_staff() or public.is_intranet_manager());
$$;
