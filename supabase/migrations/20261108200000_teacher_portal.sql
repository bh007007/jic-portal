-- 강사 포털(LMS) 1차: 역할, 강사 목록, 시험 종류·CEFR 대응, 성적, 수업 자료 목차, 강사용 학생 목록. 여러 번 실행해도 된다.
-- 11/8 사용자 결정: LMS = 강사 포털(JIC 포털 4개 포털 중 하나), DB 하나(docs/architecture.md). 메뉴 검토표 'LMS' 시트와 원칙 L1~L10.
-- 테이블 이름은 기획안 데이터 모델을 따른다(사람·권한: user_roles·staff, 학업: test_types·cefr_mappings·test_results·materials).
-- 기존 함수(is_staff 등)의 뜻은 바꾸지 않고 새 함수를 더한다(docs/collab.md). legacy_* 권한은 넓히지 않고 강사용 학생 목록은 함수로만 준다.

-- ── 역할 (기획안 user_roles, 원칙 C5의 역할 이름). 지금은 강사 포털 역할만 쓴다. 학생·에이전시·가드는 기존 계정 표를 그대로 쓴다.
create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'checker', 'scheduler', 'manager', 'office', 'admin')),
  campus text not null default '', -- '' = 모든 캠퍼스
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (user_id, role, campus)
);

create or replace function public.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = any (p_roles));
$$;
-- 강사 포털을 쓰는 사람: 강사·체커·스케줄러·매니저 역할이 있거나 직원(관리자 포털 계정).
create or replace function public.is_lms_user()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or public.has_role(array['teacher', 'checker', 'scheduler', 'manager']);
$$;
-- 강사 포털 관리(시험 종류·강사 목록·남의 기록 고치기): 직원 또는 매니저.
create or replace function public.is_lms_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or public.has_role(array['manager']);
$$;
-- 화면 메뉴용: 내 역할 목록(직원이면 'staff'를 더함)
create or replace function public.my_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select array(select distinct role from public.user_roles where user_id = auth.uid() order by role)
         || case when public.is_staff() then array['staff']::text[] else array[]::text[] end;
$$;

-- ── 강사 목록 (기획안 staff). 로그인 계정이 없어도 등록할 수 있고(업체 포털 교사 목록), 계정이 생기면 user_id 로 잇는다.
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  kind text not null default 'teacher' check (kind in ('teacher', 'staff')),
  name text not null check (char_length(name) between 1 and 60),
  nickname text not null default '' check (char_length(nickname) <= 40), -- 수업에서 부르는 이름
  campus text not null default '',
  legacy_id text, -- 업체 포털 교사 번호(te_id)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists staff_legacy on public.staff (kind, legacy_id) where legacy_id is not null;

-- 기록에 남길 이름: 강사 목록의 이름 → 직원 이름 → 계정 id
create or replace function public.current_lms_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(s.name, '') from public.staff s where s.user_id = auth.uid()),
    public.current_staff_name(),
    auth.uid()::text
  );
$$;

-- ── 시험 종류와 CEFR 대응 (원칙 L2: 시험 기록은 한 구조, '시험 종류'로 구분. L3: 대응 기준은 미결정이라 빈칸으로 둔다)
create table if not exists public.test_types (
  code text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  course text not null default '', -- 해당 코스 이름 일부('' = 모든 코스)
  scale text not null check (scale in ('band', 'score', 'level', 'percent')),
  min_value numeric not null default 0,
  max_value numeric not null,
  step numeric not null default 1 check (step > 0),
  sections text[] not null default '{}', -- 예: Listening·Reading·Writing·Speaking (빈 배열 = 총점만)
  sort smallint not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (max_value > min_value)
);
-- 공식 점수 체계가 정해진 시험만 넣는다. ESL 레벨·스피킹 평가는 학원 기준이 정해지면 화면에서 더한다(원칙 C8).
insert into public.test_types (code, name, scale, min_value, max_value, step, sections, sort) values
  ('ielts', 'IELTS', 'band', 0, 9, 0.5, '{Listening,Reading,Writing,Speaking}', 1),
  ('toeic', 'TOEIC', 'score', 10, 990, 5, '{Listening,Reading}', 2)
on conflict (code) do nothing;

create table if not exists public.cefr_mappings (
  test_type text not null references public.test_types (code) on delete cascade,
  cefr text not null check (cefr in ('Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  min_value numeric not null, -- 이 점수 이상이면 이 레벨(JIC 기준 추정 레벨)
  updated_at timestamptz not null default now(),
  primary key (test_type, cefr)
);

-- ── 성적·시험 결과 (원칙 L1: 강사 포털에서 입력, 학생 포털·인트라넷·에이전시 포털은 읽기)
create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null,
  test_type text not null references public.test_types (code),
  test_date date not null,
  section text not null default '', -- '' = 총점
  value numeric not null,
  note text not null default '' check (char_length(note) <= 300),
  teacher_id uuid default auth.uid() references auth.users (id),
  teacher_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists test_results_student on public.test_results (student_no, test_date);

-- 점수는 시험 종류의 범위·단위 안에서만, 영역은 시험 종류의 영역 중에서만. 기록자 이름은 서버가 넣는다(화면이 보낸 이름은 믿지 않는다).
create or replace function public.test_results_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.test_types;
begin
  select * into t from public.test_types where code = new.test_type;
  if not found or not t.active then raise exception 'invalid_test_type'; end if;
  if new.value < t.min_value or new.value > t.max_value or mod(new.value - t.min_value, t.step) <> 0 then raise exception 'invalid_value'; end if;
  if new.section <> '' and not (new.section = any (t.sections)) then raise exception 'invalid_section'; end if;
  if new.test_date > public.manila_today() then raise exception 'invalid_date'; end if;
  if tg_op = 'INSERT' then
    new.teacher_id := auth.uid();
    new.teacher_name := coalesce(public.current_lms_name(), '');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists test_results_check on public.test_results;
create trigger test_results_check before insert or update on public.test_results for each row execute function public.test_results_check();

-- ── 수업 자료실 목차 (원칙 L8: 코스 → 교재 → 단원 → 자료 종류, 파일은 회사 공유 드라이브 링크. 학생 공개는 미결정이라 기본 비공개)
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  course text not null check (char_length(course) between 1 and 80),
  textbook text not null default '' check (char_length(textbook) <= 80),
  unit text not null default '' check (char_length(unit) <= 80),
  kind text not null default 'other' check (kind in ('book', 'worksheet', 'slides', 'audio', 'video', 'test', 'answer', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  campus text not null default '',
  sort integer not null default 0,
  student_visible boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_course on public.materials (course, textbook, unit, sort);

create or replace function public.materials_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := coalesce(public.current_lms_name(), '');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists materials_stamp on public.materials;
create trigger materials_stamp before insert or update on public.materials for each row execute function public.materials_stamp();

-- ── RLS 켜기, 권한 초기화(새 테이블은 자동으로 열리지 않는다), 서비스 키는 전부
do $$
declare t text;
begin
  foreach t in array array['user_roles', 'staff', 'test_types', 'cefr_mappings', 'test_results', 'materials'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

-- 역할: 본인 것과 직원은 읽기. 쓰기는 직원(관리자 포털)만.
grant select, insert, delete on public.user_roles to authenticated;
drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for insert to authenticated with check (public.is_staff());
drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated using (public.is_staff());

-- 강사 목록: 강사 포털 사용자 읽기, 관리는 매니저·직원.
grant select on public.staff to authenticated;
grant insert (user_id, kind, name, nickname, campus, legacy_id, active) on public.staff to authenticated;
grant update (user_id, kind, name, nickname, campus, legacy_id, active, updated_at) on public.staff to authenticated;
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated using (public.is_lms_user());
drop policy if exists staff_insert on public.staff;
create policy staff_insert on public.staff for insert to authenticated with check (public.is_lms_manager());
drop policy if exists staff_update on public.staff;
create policy staff_update on public.staff for update to authenticated using (public.is_lms_manager()) with check (public.is_lms_manager());

-- 시험 종류·CEFR 대응: 강사 포털 사용자와 학생 읽기, 관리는 매니저·직원.
grant select, insert, update on public.test_types to authenticated;
grant select, insert, update, delete on public.cefr_mappings to authenticated;
drop policy if exists test_types_read on public.test_types;
create policy test_types_read on public.test_types for select to authenticated using (public.is_lms_user() or public.is_student());
drop policy if exists test_types_write on public.test_types;
create policy test_types_write on public.test_types for insert to authenticated with check (public.is_lms_manager());
drop policy if exists test_types_update on public.test_types;
create policy test_types_update on public.test_types for update to authenticated using (public.is_lms_manager()) with check (public.is_lms_manager());
drop policy if exists cefr_read on public.cefr_mappings;
create policy cefr_read on public.cefr_mappings for select to authenticated using (public.is_lms_user() or public.is_student());
drop policy if exists cefr_write on public.cefr_mappings;
create policy cefr_write on public.cefr_mappings for all to authenticated using (public.is_lms_manager()) with check (public.is_lms_manager());

-- 성적: 강사 포털 사용자는 모두 읽고 입력, 고치기·지우기는 쓴 사람이나 매니저. 학생은 자기 것만 읽는다.
grant select, delete on public.test_results to authenticated;
grant insert (student_no, enrollment_id, test_type, test_date, section, value, note) on public.test_results to authenticated;
grant update (test_date, section, value, note) on public.test_results to authenticated;
drop policy if exists test_results_read on public.test_results;
create policy test_results_read on public.test_results for select to authenticated
  using (public.is_lms_user() or student_no = public.current_student_no());
drop policy if exists test_results_insert on public.test_results;
create policy test_results_insert on public.test_results for insert to authenticated
  with check (public.is_lms_user() and public.enrollment_of_student(enrollment_id, student_no));
drop policy if exists test_results_update on public.test_results;
create policy test_results_update on public.test_results for update to authenticated
  using (public.is_lms_user() and (teacher_id = auth.uid() or public.is_lms_manager()))
  with check (public.is_lms_user());
drop policy if exists test_results_delete on public.test_results;
create policy test_results_delete on public.test_results for delete to authenticated
  using (public.is_lms_user() and (teacher_id = auth.uid() or public.is_lms_manager()));

-- 수업 자료: 강사 포털 사용자 읽기·등록, 고치기·지우기는 올린 사람이나 매니저.
grant select, delete on public.materials to authenticated;
grant insert (course, textbook, unit, kind, title, url, campus, sort, student_visible) on public.materials to authenticated;
grant update (course, textbook, unit, kind, title, url, campus, sort, student_visible) on public.materials to authenticated;
drop policy if exists materials_read on public.materials;
create policy materials_read on public.materials for select to authenticated using (public.is_lms_user());
drop policy if exists materials_insert on public.materials;
create policy materials_insert on public.materials for insert to authenticated with check (public.is_lms_user());
drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials for update to authenticated
  using (public.is_lms_user() and (created_by = auth.uid() or public.is_lms_manager())) with check (public.is_lms_user());
drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials for delete to authenticated
  using (public.is_lms_user() and (created_by = auth.uid() or public.is_lms_manager()));

-- ── 강사용 학생 목록: 업체 원본(legacy_enrollments)에서 재학·곧 입학하는 연수만, 화면에 쓰는 열만. 연락처·여권·금액은 주지 않는다.
-- 기준일(p_on, 기본 필리핀 오늘)에 재학 중이거나 30일 안에 입학하는 연수. 취소·연기 등은 뺀다(관리자 core 의 CANCELLED 와 같은 낱말).
create or replace function public.lms_students(p_on date default null)
returns table (student_no text, enrollment_id text, name text, nation text, gender text, campus text, course text, dorm text, start_date date, end_date date, batch text)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_on, public.manila_today()) as day)
  select e.data ->> 'tr_st_id', e.id,
         coalesce(e.data ->> 'st_name', ''),
         coalesce(nullif(e.data ->> 'st_country_name', ''), e.data ->> 'tr_st_country_name', ''),
         coalesce(e.data ->> 'st_gender_name', ''),
         case upper(trim(coalesce(e.data ->> 'first_co_ca_code', '')))
           when 'PREMIUM' then 'Premium' when 'CHALLENGER' then 'Challenger' when 'MCO' then 'MCO'
           else coalesce(e.data ->> 'first_co_ca_code', '') end,
         coalesce(e.data ->> 'courses', ''),
         coalesce(e.data ->> 'dorms', ''),
         left(e.data ->> 'tr_start_date', 10)::date,
         left(e.data ->> 'tr_finish_date', 10)::date,
         coalesce(e.data ->> 'sd_name', '')
    from public.legacy_enrollments e, d
   where public.is_lms_user()
     and coalesce(e.data ->> 'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청'
     and coalesce(e.data ->> 'tr_start_date', '') ~ '^\d{4}-\d{2}-\d{2}'
     and coalesce(e.data ->> 'tr_finish_date', '') ~ '^\d{4}-\d{2}-\d{2}'
     and left(e.data ->> 'tr_finish_date', 10) >= d.day::text
     and left(e.data ->> 'tr_start_date', 10) <= (d.day + 30)::text
   order by 6, 3;
$$;

-- ── 함수 실행 권한: 익명은 막고, 로그인한 사용자와 서비스 키만
do $$
declare f text;
begin
  foreach f in array array['has_role(text[])', 'is_lms_user()', 'is_lms_manager()', 'my_roles()', 'current_lms_name()', 'lms_students(date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$$;
revoke execute on function public.test_results_check() from public, anon, authenticated;
revoke execute on function public.materials_stamp() from public, anon, authenticated;
