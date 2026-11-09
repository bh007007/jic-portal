-- 실제 데이터 전 성능 정리(11/10, Supabase 성능 진단 0003·0001). 관리자·에이전시·강사 포털 표만(다른 앱 표는 각 담당이 한다, docs/setup-cloud.md).
-- 1) 정책의 auth.uid() 를 (select auth.uid()) 로: 행마다 다시 계산하지 않고 한 번만 계산한다. 뜻은 같다(누가 무엇을 읽고 고치는지 그대로).
-- 2) 인덱스 없는 외래 키에 인덱스: 지점별 통계·내 신청 읽기, 사용자 지울 때 참조 확인.
-- 표가 없으면 건너뛴다(권한 시험이 일부 마이그레이션만 올린 DB 에도 이 파일을 적용한다). 여러 번 실행해도 된다.
do $$
declare s text[];
begin
  foreach s slice 1 in array array[
    -- [표, 실행할 문장]
    -- 관리자(20261107000000_legacy_tables.sql)
    ['staff_users', $q$alter policy staff_users_self_read on public.staff_users using (user_id = (select auth.uid()))$q$],
    -- 강사 포털(20261108200000_teacher_portal.sql·20261109010000_roles.sql)
    ['user_roles', $q$alter policy user_roles_read on public.user_roles using (user_id = (select auth.uid()) or public.is_staff())$q$],
    ['test_results', $q$alter policy test_results_update on public.test_results using (public.is_lms_writer() and (teacher_id = (select auth.uid()) or public.is_lms_manager())) with check (public.is_lms_writer())$q$],
    ['test_results', $q$alter policy test_results_delete on public.test_results using (public.is_lms_writer() and (teacher_id = (select auth.uid()) or public.is_lms_manager()))$q$],
    ['materials', $q$alter policy materials_update on public.materials using (public.is_lms_writer() and (created_by = (select auth.uid()) or public.is_lms_manager())) with check (public.is_lms_writer())$q$],
    ['materials', $q$alter policy materials_delete on public.materials using (public.is_lms_writer() and (created_by = (select auth.uid()) or public.is_lms_manager()))$q$],
    -- 에이전시 포털(20261107010000_partner_portal.sql)
    ['agency_members', $q$alter policy members_self_read on public.agency_members using (user_id = (select auth.uid()))$q$],
    ['agency_members', $q$alter policy members_self_update on public.agency_members using (user_id = (select auth.uid()) and status = 'active') with check (user_id = (select auth.uid()) and status = 'active')$q$],
    ['agency_requests', $q$alter policy requests_self_read on public.agency_requests using (user_id = (select auth.uid()))$q$],
    ['visit_requests', $q$alter policy visits_partner_read on public.visit_requests using (member_id = (select auth.uid()))$q$],
    ['visit_requests', $q$alter policy visits_partner_insert on public.visit_requests with check (member_id = (select auth.uid()) and public.is_partner() and status = 'received' and staff_note is null)$q$],
    ['plan_downloads', $q$alter policy downloads_partner_insert on public.plan_downloads with check (member_id = (select auth.uid()) and public.is_partner())$q$],
    -- 외래 키 인덱스
    ['agency_members', 'create index if not exists agency_members_approved_by on public.agency_members (approved_by)'],
    ['agency_requests', 'create index if not exists agency_requests_reviewed_by on public.agency_requests (reviewed_by)'],
    ['courses', 'create index if not exists courses_campus on public.courses (campus_id)'],
    ['course_contents', 'create index if not exists course_contents_updated_by on public.course_contents (updated_by)'],
    ['partner_notices', 'create index if not exists partner_notices_created_by on public.partner_notices (created_by)'],
    ['partner_resources', 'create index if not exists partner_resources_created_by on public.partner_resources (created_by)'],
    ['plan_downloads', 'create index if not exists plan_downloads_member on public.plan_downloads (member_id)'],
    ['visit_requests', 'create index if not exists visit_requests_member on public.visit_requests (member_id)'],
    ['class_sessions', 'create index if not exists class_sessions_classroom on public.class_sessions (classroom_id)'],
    ['class_sessions', 'create index if not exists class_sessions_sub_teacher on public.class_sessions (sub_teacher_id)'],
    ['materials', 'create index if not exists materials_created_by on public.materials (created_by)'],
    ['test_results', 'create index if not exists test_results_teacher on public.test_results (teacher_id)'],
    ['test_results', 'create index if not exists test_results_test_type on public.test_results (test_type)'],
    ['holidays', 'create index if not exists holidays_created_by on public.holidays (created_by)']
  ] loop
    if to_regclass('public.' || s[1]) is not null then
      execute s[2];
    end if;
  end loop;
end $$;
