-- 통합 관리 앱 권한 구조 1단계(CL-025, docs/permissions.md, 11/12 레오님 결정 6가지). 여러 번 실행해도 된다.
-- 결정: ① 승인은 역할 기본값 + 사람별 더하기·빼기 ② 권한은 관리자와 센터장(자기 캠퍼스)이 준다 ③ 센터장만 역할로(DB 관리자는 역할 아님)
--       ④ 통금·근무자 설정은 '학생 생활', 오피스도 입력 ⑤ 메뉴 그룹 이름은 지금 앱 이름 그대로 ⑥ 권한표는 DB 표(관리자가 화면에서 고침)
-- 이 파일은 표와 판단 함수만 만든다. 기본값은 지금 규칙(11/9 권한표·지금 DB 함수)과 같아 **바뀌는 사람이 없다**.
-- 정책·화면을 can_view·can_input·can_approve 로 옮기는 것은 다음 단계(인트라넷·강사 포털 담당과 함께, docs/permissions.md 5장).
-- 센터장(director)은 오피스와 함께 준다(사용자·권한 화면이 같이 넣는다). 오피스 역할로 정한 범위(Student File 캠퍼스 등)를 그대로 받기 위해서다.

-- 1) 센터장 역할. 관리자 판단(20261109010000)에서 센터장도 오피스처럼 '관리자 아님'으로 본다.
--    (예전 규칙대로면 오피스 역할 없이 센터장만 남은 사람이 관리자가 된다.)
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('teacher', 'checker', 'scheduler', 'manager', 'office', 'admin', 'director'));
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() and (public.has_role(array['admin']) or not public.has_role(array['office', 'director']));
$$;

-- 2) 메뉴 그룹(⑤ 지금 앱 메뉴 이름)과 역할별 보기·입력 기본값(⑥ 표)
create table if not exists public.menu_groups (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  label text not null check (length(label) between 1 and 80),
  sort integer not null default 0
);
create table if not exists public.role_permissions (
  menu_group text not null references public.menu_groups (key) on delete cascade,
  role text not null check (role in ('teacher', 'checker', 'scheduler', 'manager', 'office', 'admin', 'director')),
  can_view boolean not null default false,
  can_input boolean not null default false,
  campus_scoped boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (menu_group, role),
  constraint role_permissions_input_needs_view check (not can_input or can_view)
);
create index if not exists role_permissions_updated_by on public.role_permissions (updated_by);

-- 3) 승인 종류와 역할별 기본값(① 기본), 사람별 더하기·빼기(①·②)
create table if not exists public.approval_kinds (
  kind text primary key check (kind ~ '^[a-z_]{2,40}$'),
  label text not null check (length(label) between 1 and 80),
  sort integer not null default 0
);
create table if not exists public.approval_defaults (
  kind text not null references public.approval_kinds (kind) on delete cascade,
  role text not null check (role in ('teacher', 'checker', 'scheduler', 'manager', 'office', 'admin', 'director')),
  campus_scoped boolean not null default false,
  primary key (kind, role)
);
create table if not exists public.approval_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null references public.approval_kinds (kind) on delete cascade,
  campus text not null default '' check (length(campus) <= 40), -- '' = 모든 캠퍼스
  allow boolean not null, -- 참 = 더하기, 거짓 = 빼기
  created_at timestamptz not null default now(),
  granted_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint approval_grants_unique unique (user_id, kind, campus)
);
create index if not exists approval_grants_user on public.approval_grants (user_id);
create index if not exists approval_grants_kind on public.approval_grants (kind);
create index if not exists approval_grants_granted_by on public.approval_grants (granted_by);

-- 기본값(지금 규칙). 화면에서 고친 값을 덮지 않게 없는 것만 넣는다
insert into public.menu_groups (key, label, sort) values
  ('dashboard', '대시보드', 1),
  ('students', '학생관리 · 학생 목록·상세·배치별 명단', 2),
  ('students_changes', '학생관리 · 중단·연기·변경 요청·체크 메모', 3),
  ('stats', '통계', 4),
  ('dorm', '기숙사', 5),
  ('accounting', '회계', 6),
  ('agency', '에이전시', 7),
  ('partner', '파트너 포털 관리', 8),
  ('life', '학생 생활 · 홈·외출·귀가·통금·가드 리포트', 9),
  ('life_settings', '학생 생활 · 통금·근무자 설정', 10),
  ('life_file', '학생 생활 · Student File', 11),
  ('life_counsel', '학생 생활 · 상담 기록', 12),
  ('life_penalty', '학생 생활 · 패널티 목록·점수표', 13),
  ('requests', '신청 처리 · 결석·외박·여행·생활 요청', 14),
  ('requests_trips', '신청 처리 · 학교 여행 등록·귀국 일정·배차', 15),
  ('notices', '공지·결재 · 내부 공지', 16),
  ('lms_view', '학사(LMS) · 학생·결석 신청 보기', 17),
  ('lms_grades', '학사(LMS) · 성적·자료실', 18),
  ('lms_attendance', '학사(LMS) · 출석 체크', 19),
  ('lms_classes', '학사(LMS) · 수업 관리·교실', 20),
  ('lms_settings', '학사(LMS) · 시험 종류·CEFR·강사 목록', 21),
  ('base', '기초관리 · 코스·기숙사·캠퍼스·배치·휴일·가격표', 22),
  ('base_admin', '기초관리 · 사용자·권한·가드 계정·접근 기록', 23)
on conflict (key) do nothing;

-- docs/permissions.md 2장 표(11/9 권한표). V = 보기, I = 보기+입력, c = 맡은 캠퍼스만. 센터장 = 오피스와 같게(오피스와 함께 받는다)
insert into public.role_permissions (menu_group, role, can_view, can_input, campus_scoped)
select g, r, v, i, c from (values
  ('dashboard', 'scheduler', true, false, false), ('dashboard', 'manager', true, false, false), ('dashboard', 'office', true, false, false), ('dashboard', 'admin', true, false, false), ('dashboard', 'director', true, false, false),
  ('students', 'scheduler', true, false, false), ('students', 'manager', true, false, false), ('students', 'office', true, true, false), ('students', 'admin', true, true, false), ('students', 'director', true, true, false),
  ('students_changes', 'manager', true, false, false), ('students_changes', 'office', true, true, false), ('students_changes', 'admin', true, true, false), ('students_changes', 'director', true, true, false),
  ('stats', 'scheduler', true, false, false), ('stats', 'manager', true, false, false), ('stats', 'office', true, false, false), ('stats', 'admin', true, false, false), ('stats', 'director', true, false, false),
  ('dorm', 'office', true, true, false), ('dorm', 'admin', true, true, false), ('dorm', 'director', true, true, false),
  ('accounting', 'office', true, false, false), ('accounting', 'admin', true, true, false), ('accounting', 'director', true, false, false),
  ('agency', 'office', true, false, false), ('agency', 'admin', true, true, false), ('agency', 'director', true, false, false),
  ('partner', 'office', true, true, false), ('partner', 'admin', true, true, false), ('partner', 'director', true, true, false),
  ('life', 'manager', true, false, false), ('life', 'office', true, false, false), ('life', 'admin', true, false, false), ('life', 'director', true, false, false),
  ('life_settings', 'office', true, true, false), ('life_settings', 'admin', true, true, false), ('life_settings', 'director', true, true, false),
  ('life_file', 'manager', true, false, true), ('life_file', 'office', true, false, true), ('life_file', 'admin', true, true, false), ('life_file', 'director', true, false, true),
  ('life_counsel', 'manager', true, true, true), ('life_counsel', 'office', true, true, true), ('life_counsel', 'admin', true, true, true), ('life_counsel', 'director', true, true, true),
  ('life_penalty', 'manager', true, false, false), ('life_penalty', 'office', true, false, false), ('life_penalty', 'admin', true, true, false), ('life_penalty', 'director', true, false, false),
  ('requests', 'manager', true, false, false), ('requests', 'office', true, false, false), ('requests', 'admin', true, false, false), ('requests', 'director', true, false, false),
  ('requests_trips', 'manager', true, false, false), ('requests_trips', 'office', true, true, false), ('requests_trips', 'admin', true, true, false), ('requests_trips', 'director', true, true, false),
  ('notices', 'teacher', true, false, false), ('notices', 'checker', true, false, false), ('notices', 'scheduler', true, false, false), ('notices', 'manager', true, true, false), ('notices', 'office', true, true, false), ('notices', 'admin', true, true, false), ('notices', 'director', true, true, false),
  ('lms_view', 'teacher', true, false, false), ('lms_view', 'checker', true, false, false), ('lms_view', 'scheduler', true, false, false), ('lms_view', 'manager', true, false, false), ('lms_view', 'office', true, false, false), ('lms_view', 'admin', true, false, false), ('lms_view', 'director', true, false, false),
  ('lms_grades', 'teacher', true, true, false), ('lms_grades', 'checker', true, false, false), ('lms_grades', 'scheduler', true, false, false), ('lms_grades', 'manager', true, true, false), ('lms_grades', 'office', true, false, false), ('lms_grades', 'admin', true, true, false), ('lms_grades', 'director', true, false, false),
  ('lms_attendance', 'teacher', true, true, false), ('lms_attendance', 'checker', true, true, false), ('lms_attendance', 'manager', true, true, false), ('lms_attendance', 'admin', true, true, false),
  ('lms_classes', 'teacher', true, false, false), ('lms_classes', 'checker', true, false, false), ('lms_classes', 'scheduler', true, true, false), ('lms_classes', 'manager', true, true, false), ('lms_classes', 'office', true, false, false), ('lms_classes', 'admin', true, true, false), ('lms_classes', 'director', true, false, false),
  ('lms_settings', 'manager', true, true, false), ('lms_settings', 'admin', true, true, false),
  ('base', 'scheduler', true, false, false), ('base', 'manager', true, false, false), ('base', 'office', true, true, false), ('base', 'admin', true, true, false), ('base', 'director', true, true, false),
  ('base_admin', 'admin', true, true, false)
) as v(g, r, v, i, c)
on conflict (menu_group, role) do nothing;

-- docs/permissions.md 3장(지금 DB가 하는 대로). '직원이면 모두'는 오피스·관리자(모든 직원이 둘 중 하나).
-- 센터장 몫은 결정된 것만: 방문 확정·반려(CL-046, 자기 캠퍼스), 추천 규칙 승인(CL-023). 나머지는 함께 받는 오피스 역할로 지금처럼 한다
insert into public.approval_kinds (kind, label, sort) values
  ('absence_decide', '결석 신청 승인·반려', 1),
  ('penalty_absence', '무단결석 패널티 승인', 2),
  ('penalty_curfew', '통금 위반 패널티 승인', 3),
  ('overnight_trip', '외박·여행 신청 승인', 4),
  ('nonacademic', '생활 요청 처리', 5),
  ('airport_ride', '공항 이동 배차 확정', 6),
  ('trip_remove', '학교 여행 참가 제외', 7),
  ('change_request', '변경 요청 처리', 8),
  ('agency_signup', '에이전시 가입 승인', 9),
  ('reco_rules', '추천 규칙 승인본 지정', 10),
  ('attendance_close', '출석 마감·사유 인정', 11),
  ('visit_confirm', '방문 신청 확정·반려', 12),
  ('grant_roles', '역할·승인 권한 주기', 13)
on conflict (kind) do nothing;
insert into public.approval_defaults (kind, role, campus_scoped)
select k, r, c from (values
  ('absence_decide', 'manager', true), ('absence_decide', 'office', false), ('absence_decide', 'admin', false),
  ('penalty_absence', 'manager', true), ('penalty_absence', 'office', false), ('penalty_absence', 'admin', false),
  ('penalty_curfew', 'office', false), ('penalty_curfew', 'admin', false),
  ('overnight_trip', 'office', false), ('overnight_trip', 'admin', false),
  ('nonacademic', 'office', false), ('nonacademic', 'admin', false),
  ('airport_ride', 'office', false), ('airport_ride', 'admin', false),
  ('trip_remove', 'office', false), ('trip_remove', 'admin', false),
  ('change_request', 'office', false), ('change_request', 'admin', false),
  ('agency_signup', 'office', false), ('agency_signup', 'admin', false),
  ('reco_rules', 'office', false), ('reco_rules', 'admin', false), ('reco_rules', 'director', false),
  ('attendance_close', 'manager', true), ('attendance_close', 'admin', false),
  ('visit_confirm', 'director', true),
  ('grant_roles', 'admin', false)
) as v(k, r, c)
on conflict (kind, role) do nothing;

-- 4) 판단 함수
-- 내 역할과 캠퍼스(역할 없는 직원 = 관리자, docs/roles.md). 캠퍼스는 소문자, '' = 모든 캠퍼스
create or replace function public.my_role_scopes()
returns table (role text, campus text) language sql stable security definer set search_path = public as $$
  select r.role, lower(r.campus) from public.user_roles r where r.user_id = (select auth.uid())
  union
  select 'admin', '' where public.is_admin();
$$;
revoke execute on function public.my_role_scopes() from public, anon, authenticated;

-- 그 캠퍼스의 센터장인가(② 자기 캠퍼스 권한 주기)
create or replace function public.is_campus_director(p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_campus, '') <> '' and exists (
    select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'director' and lower(r.campus) = lower(p_campus)
  );
$$;
revoke execute on function public.is_campus_director(text) from public, anon;
grant execute on function public.is_campus_director(text) to authenticated;

create or replace function public.can_view(p_group text)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_staff() or public.is_lms_user()) and exists (
    select 1 from public.my_role_scopes() s join public.role_permissions p on p.role = s.role
    where p.menu_group = p_group and p.can_view
  );
$$;
create or replace function public.can_input(p_group text, p_campus text default '')
returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_staff() or public.is_lms_user()) and exists (
    select 1 from public.my_role_scopes() s join public.role_permissions p on p.role = s.role
    where p.menu_group = p_group and p.can_input and (not p.campus_scoped or s.campus = '' or s.campus = lower(coalesce(p_campus, '')))
  );
$$;
-- 승인: 사람별 '빼기'가 있으면 거짓, 아니면 역할 기본값 또는 사람별 '더하기'
create or replace function public.can_approve(p_kind text, p_campus text default '')
returns boolean language sql stable security definer set search_path = public as $$
  with g as (
    select g.allow from public.approval_grants g
    where g.user_id = (select auth.uid()) and g.kind = p_kind and (g.campus = '' or lower(g.campus) = lower(coalesce(p_campus, '')))
  )
  select (select auth.uid()) is not null
    and (public.is_staff() or public.is_lms_user()) -- 사람별 '더하기'도 직원·강사 포털 사용자에게만 뜻이 있다
    and not exists (select 1 from g where not g.allow)
    and (
      exists (select 1 from g where g.allow)
      or exists (
        select 1 from public.my_role_scopes() s join public.approval_defaults d on d.role = s.role
        where d.kind = p_kind and (not d.campus_scoped or s.campus = '' or s.campus = lower(coalesce(p_campus, '')))
      )
    );
$$;
revoke execute on function public.can_view(text) from public, anon;
revoke execute on function public.can_input(text, text) from public, anon;
revoke execute on function public.can_approve(text, text) from public, anon;
grant execute on function public.can_view(text), public.can_input(text, text), public.can_approve(text, text) to authenticated;

-- 5) 권한: 표는 직원이 읽고 관리자가 고친다. 사람별 승인은 관리자, 또는 센터장이 자기 캠퍼스로(역할·승인 권한 주기는 빼고, 자기 자신에게는 못 준다)
alter table public.menu_groups enable row level security;
alter table public.role_permissions enable row level security;
alter table public.approval_kinds enable row level security;
alter table public.approval_defaults enable row level security;
alter table public.approval_grants enable row level security;
revoke all on public.menu_groups, public.role_permissions, public.approval_kinds, public.approval_defaults, public.approval_grants from anon, authenticated;
grant select, insert, update, delete on public.menu_groups, public.role_permissions, public.approval_kinds, public.approval_defaults to authenticated;
grant select, insert, delete on public.approval_grants to authenticated;
grant select, insert, update, delete on public.menu_groups, public.role_permissions, public.approval_kinds, public.approval_defaults, public.approval_grants to service_role;

drop policy if exists menu_groups_read on public.menu_groups;
create policy menu_groups_read on public.menu_groups for select to authenticated using (public.is_staff() or public.is_lms_user());
drop policy if exists menu_groups_admin on public.menu_groups;
create policy menu_groups_admin on public.menu_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (public.is_staff() or public.is_lms_user());
drop policy if exists role_permissions_admin on public.role_permissions;
create policy role_permissions_admin on public.role_permissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists approval_kinds_read on public.approval_kinds;
create policy approval_kinds_read on public.approval_kinds for select to authenticated using (public.is_staff() or public.is_lms_user());
drop policy if exists approval_kinds_admin on public.approval_kinds;
create policy approval_kinds_admin on public.approval_kinds for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists approval_defaults_read on public.approval_defaults;
create policy approval_defaults_read on public.approval_defaults for select to authenticated using (public.is_staff() or public.is_lms_user());
drop policy if exists approval_defaults_admin on public.approval_defaults;
create policy approval_defaults_admin on public.approval_defaults for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists approval_grants_read on public.approval_grants;
create policy approval_grants_read on public.approval_grants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
drop policy if exists approval_grants_insert on public.approval_grants;
create policy approval_grants_insert on public.approval_grants for insert to authenticated
  with check (public.is_admin() or (kind <> 'grant_roles' and user_id <> (select auth.uid()) and public.is_campus_director(campus)));
drop policy if exists approval_grants_delete on public.approval_grants;
create policy approval_grants_delete on public.approval_grants for delete to authenticated
  using (public.is_admin() or (kind <> 'grant_roles' and user_id <> (select auth.uid()) and public.is_campus_director(campus)));

-- ② 센터장은 자기 캠퍼스의 강사 포털 역할(강사·체커·스케줄러·매니저)을 다른 사람에게 주고 회수한다.
--    관리자·오피스·센터장 역할은 관리자만: 오피스를 빼거나 더하면 '관리자인지'가 바뀌기 때문이다(역할 없는 직원 = 관리자).
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for insert to authenticated
  with check (public.is_admin() or (role in ('teacher', 'checker', 'scheduler', 'manager') and user_id <> (select auth.uid()) and public.is_campus_director(campus)));
drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.is_admin() or (role in ('teacher', 'checker', 'scheduler', 'manager') and user_id <> (select auth.uid()) and public.is_campus_director(campus)));
