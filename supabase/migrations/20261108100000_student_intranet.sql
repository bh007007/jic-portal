-- 학생 앱·인트라넷 테이블과 권한 (docs/student-app.md, docs/intranet.md). 여러 번 실행해도 되게 쓴다.
-- 11/8 결정:
--   학생 계정 = 학생번호 + 생년월일로 미리 만들고 첫 로그인 때 비밀번호를 바꾼다(원칙 V4). 계정 생성은 서비스 키(서버)만.
--   가드 = 출입구(캠퍼스)마다 공용 계정 하나, 기록에는 근무자 이름을 고른다.
--   상담 기록 = 같은 캠퍼스 직원만 본다. 내용은 함수로만 읽고, 열 때마다 접근 기록을 남긴다.
-- 범위: 학생·가드는 자기 범위만 쓰고 읽는다. 직원은 is_staff() 로 본다(역할 9개로 좁히는 일은 HANDOFF 6-4).
-- 업체 원본(legacy_*)은 지금처럼 직원만 읽는다. 학생 앱 서버가 학생 본인 행만 서비스 키로 읽는다(docs/collab.md).
-- 테이블 이름은 기획안 데이터 모델을 따르고, 기획안에 없는 것(departure_flights, airport_rides, intranet_settings, 계정 연결 표)은 새로 지었다.

-- ── 계정
create table if not exists public.student_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  student_no text not null unique,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.guard_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  campus text not null,
  label text not null, -- 예: 'Challenger 정문'
  created_at timestamptz not null default now()
);
create table if not exists public.staff_campuses (
  user_id uuid not null references public.staff_users (user_id) on delete cascade,
  campus text not null,
  primary key (user_id, campus)
);

create or replace function public.current_student_no()
returns text language sql stable security definer set search_path = public as $$
  select student_no from public.student_users where user_id = auth.uid();
$$;
create or replace function public.is_student()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_users where user_id = auth.uid());
$$;
create or replace function public.current_guard_campus()
returns text language sql stable security definer set search_path = public as $$
  select campus from public.guard_accounts where user_id = auth.uid();
$$;
create or replace function public.is_guard()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guard_accounts where user_id = auth.uid());
$$;
-- 직원이 그 캠퍼스를 맡는지(상담 기록 범위). 관리자도 맡는 캠퍼스를 staff_campuses 에 넣어야 본다.
create or replace function public.staff_has_campus(p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (select 1 from public.staff_campuses where user_id = auth.uid() and campus = p_campus);
$$;
-- 처리자 이름: 로그인한 직원의 이름(staff_users.name). 화면이 보내는 이름은 믿지 않는다.
create or replace function public.current_staff_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name, ''), auth.uid()::text) from public.staff_users where user_id = auth.uid();
$$;
-- 필리핀 오늘 날짜
create or replace function public.manila_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;
-- 그 연수가 그 학생 것인지(업체 원본 legacy_enrollments: id = tr_id, data.tr_st_id = 학생번호).
-- 원본 테이블 권한은 넓히지 않고 참/거짓만 돌려준다. 정규화 테이블로 옮기면 여기만 바꾼다.
create or replace function public.enrollment_of_student(p_enrollment text, p_student_no text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legacy_enrollments where id = p_enrollment and data ->> 'tr_st_id' = p_student_no);
$$;
-- 가드 태블릿 시각은 지금 기준 앞뒤 몇 분만 받는다(통금 판정 근거라 나중 시각으로 고쳐 쓰지 못하게).
create or replace function public.near_now(p_at timestamptz)
returns boolean language sql stable as $$
  select p_at is null or p_at between now() - interval '10 minutes' and now() + interval '2 minutes';
$$;
-- 학생이 첫 로그인 때 비밀번호를 바꾼 뒤 부른다.
create or replace function public.student_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.student_users set must_change_password = false where user_id = auth.uid();
$$;

-- ── 학생 신청: 결석·외박 (apps/student/server/requests.ts)
create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null,
  absence_date date not null,
  periods smallint[] not null default '{}' check (periods <@ '{1,2,3,4,5,6,7,8}'::smallint[]), -- 빈 배열 = 종일
  kind text not null check (kind in ('sick', 'official', 'personal')),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  staff_comment text check (staff_comment is null or char_length(staff_comment) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists absence_requests_student on public.absence_requests (student_no);

create table if not exists public.overnight_permissions (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null,
  leave_date date not null, -- 첫 밤
  return_date date not null check (return_date > leave_date),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  staff_comment text check (staff_comment is null or char_length(staff_comment) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists overnight_permissions_student on public.overnight_permissions (student_no);

-- ── 귀국 항공편(학생이 씀)과 공항 이동 배차(직원이 씀) (apps/student/server/departures.ts)
create table if not exists public.departure_flights (
  enrollment_id text primary key, -- 연수마다 하나
  student_no text not null,
  depart_date date not null,
  depart_time time not null,
  flight text not null check (char_length(flight) between 2 and 20),
  airport text not null check (airport in ('MANILA', 'CLARK', 'OTHER')),
  needs_ride boolean not null default false,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (airport <> 'OTHER' or char_length(note) > 0)
);
create index if not exists departure_flights_student on public.departure_flights (student_no);

create table if not exists public.airport_rides (
  enrollment_id text primary key references public.departure_flights (enrollment_id) on delete cascade,
  student_no text not null,
  decision text not null check (decision in ('confirmed', 'declined')),
  pickup_date date,
  pickup_time time,
  note text not null default '' check (char_length(note) <= 200),
  for_date date not null, -- 처리할 때의 항공편(학생이 바꾸면 다시 확인)
  for_time time not null,
  decided_by uuid default auth.uid() references auth.users (id),
  decided_at timestamptz not null default now(),
  check (decision = 'declined' or (pickup_date is not null and pickup_time is not null)),
  check (decision = 'confirmed' or char_length(note) > 0)
);

-- ── 인트라넷: 설정, 외출·귀가, 가드 리포트, 패널티 (apps/intranet/server/core.ts, reports.ts)
create table if not exists public.intranet_settings (
  id smallint primary key default 1 check (id = 1),
  curfew time not null default '23:00', -- 디자인 값. 설정 화면에서 바꾼다
  guards text[] not null default '{}', -- 가드 태블릿 근무자 목록
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.intranet_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.outings (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null default '',
  campus text not null, -- 기록한 출입구
  out_at timestamptz,
  out_by text not null default '', -- 근무자 이름
  in_at timestamptz,
  in_by text not null default '',
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (out_at is not null or in_at is not null)
);
create index if not exists outings_open on public.outings (campus) where in_at is null;
create index if not exists outings_student on public.outings (student_no);

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null default '',
  campus text not null,
  kind text not null check (kind in ('alcohol', 'violence', 'unauthorized', 'other')),
  note text not null check (char_length(note) between 1 and 500),
  occurred_at timestamptz not null,
  reported_by text not null default '', -- 근무자 이름
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- 점수·경고 기준은 정해지지 않아 비워 둔다(설정 화면에서 입력, HANDOFF 7).
create table if not exists public.penalty_rules (
  code text primary key,
  name text not null,
  score integer check (score is null or score between 0 and 100),
  approver text not null default '',
  sort smallint not null default 0
);
insert into public.penalty_rules (code, name, sort) values
  ('absence', '무단결석', 1), ('curfew', '통금 위반', 2), ('alcohol', '음주', 3), ('other', '기타', 4)
on conflict (code) do nothing;
create table if not exists public.penalty_stages (
  stage smallint primary key check (stage between 1 and 3),
  name text not null,
  min_score integer check (min_score is null or min_score >= 1)
);
insert into public.penalty_stages (stage, name) values (1, '1단계'), (2, '2단계'), (3, '3단계') on conflict (stage) do nothing;

create table if not exists public.penalties (
  id text primary key, -- 'curfew-<외출 id>', 'guard-<리포트 id>': 같은 근거로는 한 건
  student_no text not null,
  kind text not null references public.penalty_rules (code),
  occurred_on date not null, -- 통금·가드 리포트는 '밤' 기준
  campus text not null,
  basis text not null,
  source text not null check (source in ('outing', 'guard')),
  source_id text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  score integer, -- 승인할 때의 점수표 점수
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists penalties_student on public.penalties (student_no);

-- ── 상담 기록과 접근 기록: 테이블을 직접 읽거나 쓰지 못하게 하고, 아래 함수로만 다룬다.
create table if not exists public.counseling_notes (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  campus text not null, -- 학생의 캠퍼스(열람 범위). 작성할 때 서버가 넣는다
  counsel_date date not null,
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 3000),
  author_id uuid references auth.users (id),
  author_name text not null,
  follow_up_due date,
  follow_up_done boolean not null default false,
  follow_up_done_at timestamptz,
  follow_up_done_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  check (follow_up_due is null or follow_up_due >= counsel_date)
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  action text not null check (action in ('view', 'create', 'update', 'followup_done', 'followup_reopen')),
  target text not null default 'counseling',
  target_id text not null,
  student_no text not null,
  campus text not null
);
create index if not exists audit_logs_target on public.audit_logs (target_id);

-- ── 내부 공지와 읽음
create table if not exists public.internal_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  campus text not null default '', -- '' = 전체
  pinned boolean not null default false,
  until_date date, -- 이날까지 게시
  author_id uuid default auth.uid() references auth.users (id),
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create table if not exists public.internal_notice_reads (
  notice_id uuid not null references public.internal_notices (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  read_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

-- ── RLS 켜기, 권한 초기화(새 테이블은 자동으로 열리지 않는다), 서비스 키는 전부
do $$
declare
  t text;
begin
  foreach t in array array[
    'student_users', 'guard_accounts', 'staff_campuses', 'absence_requests', 'overnight_permissions',
    'departure_flights', 'airport_rides', 'intranet_settings', 'outings', 'incident_reports',
    'penalty_rules', 'penalty_stages', 'penalties', 'counseling_notes', 'audit_logs',
    'internal_notices', 'internal_notice_reads'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

-- 계정 표: 본인 행만 읽는다(쓰기는 서비스 키). 직원은 학생·가드 계정과 직원 캠퍼스를 본다.
grant select on public.student_users, public.guard_accounts, public.staff_campuses to authenticated;
drop policy if exists student_users_read on public.student_users;
create policy student_users_read on public.student_users for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists guard_accounts_read on public.guard_accounts;
create policy guard_accounts_read on public.guard_accounts for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists staff_campuses_read on public.staff_campuses;
create policy staff_campuses_read on public.staff_campuses for select to authenticated using (public.is_staff());

-- 결석·외박: 학생은 자기 것 읽기·대기 상태로만 등록. 취소·승인·반려는 아래 함수로.
grant select on public.absence_requests, public.overnight_permissions to authenticated;
grant insert (student_no, enrollment_id, absence_date, periods, kind, reason) on public.absence_requests to authenticated;
grant insert (student_no, enrollment_id, leave_date, return_date, reason) on public.overnight_permissions to authenticated;
drop policy if exists absence_read on public.absence_requests;
create policy absence_read on public.absence_requests for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff());
drop policy if exists absence_insert on public.absence_requests;
create policy absence_insert on public.absence_requests for insert to authenticated
  with check (student_no = public.current_student_no() and public.enrollment_of_student(enrollment_id, student_no) and status = 'pending');
drop policy if exists overnight_read on public.overnight_permissions;
create policy overnight_read on public.overnight_permissions for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff());
drop policy if exists overnight_insert on public.overnight_permissions;
create policy overnight_insert on public.overnight_permissions for insert to authenticated
  with check (student_no = public.current_student_no() and public.enrollment_of_student(enrollment_id, student_no) and status = 'pending');

create or replace function public.cancel_absence_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.absence_requests set status = 'cancelled', updated_at = now()
   where id = p_id and student_no = public.current_student_no() and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;
create or replace function public.cancel_overnight_permission(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.overnight_permissions set status = 'cancelled', updated_at = now()
   where id = p_id and student_no = public.current_student_no() and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;
-- 대기 중인 건만 처리하고, 처리한 건수를 돌려준다(이미 처리·취소된 건은 건너뜀).
create or replace function public.decide_absence_requests(p_ids uuid[], p_approve boolean, p_comment text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  update public.absence_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid(),
         staff_comment = nullif(left(coalesce(p_comment, ''), 300), ''), updated_at = now()
   where id = any (p_ids) and status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.decide_overnight_permissions(p_ids uuid[], p_approve boolean, p_comment text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  update public.overnight_permissions
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid(),
         staff_comment = nullif(left(coalesce(p_comment, ''), 300), ''), updated_at = now()
   where id = any (p_ids) and status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;

-- 귀국 항공편: 학생은 자기 것을 등록·수정(출발일이 지나면 수정 불가). 배차는 직원이 쓰고 학생은 자기 것을 읽는다.
grant select on public.departure_flights to authenticated;
grant insert (enrollment_id, student_no, depart_date, depart_time, flight, airport, needs_ride, note) on public.departure_flights to authenticated;
grant update (depart_date, depart_time, flight, airport, needs_ride, note, updated_at) on public.departure_flights to authenticated;
drop policy if exists departure_read on public.departure_flights;
create policy departure_read on public.departure_flights for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff());
drop policy if exists departure_insert on public.departure_flights;
create policy departure_insert on public.departure_flights for insert to authenticated
  with check (student_no = public.current_student_no() and public.enrollment_of_student(enrollment_id, student_no) and depart_date >= public.manila_today());
drop policy if exists departure_update on public.departure_flights;
create policy departure_update on public.departure_flights for update to authenticated
  using (student_no = public.current_student_no() and depart_date >= public.manila_today())
  with check (student_no = public.current_student_no() and depart_date >= public.manila_today());

grant select, insert, update on public.airport_rides to authenticated;
drop policy if exists ride_read on public.airport_rides;
create policy ride_read on public.airport_rides for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff());
drop policy if exists ride_staff_write on public.airport_rides;
create policy ride_staff_write on public.airport_rides for insert to authenticated
  with check (public.is_staff() and decided_by = auth.uid()
              and student_no = (select f.student_no from public.departure_flights f where f.enrollment_id = airport_rides.enrollment_id));
drop policy if exists ride_staff_update on public.airport_rides;
create policy ride_staff_update on public.airport_rides for update to authenticated using (public.is_staff())
  with check (public.is_staff() and decided_by = auth.uid()
              and student_no = (select f.student_no from public.departure_flights f where f.enrollment_id = airport_rides.enrollment_id));

-- 설정: 직원·가드가 읽고 직원이 바꾼다.
grant select, update on public.intranet_settings to authenticated;
drop policy if exists settings_read on public.intranet_settings;
create policy settings_read on public.intranet_settings for select to authenticated using (public.is_staff() or public.is_guard());
drop policy if exists settings_update on public.intranet_settings;
create policy settings_update on public.intranet_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- 외출·귀가: 가드는 자기 출입구(캠퍼스) 기록만 쓰고 읽는다. 귀가는 외출 중인 기록에만. 직원은 모두 읽는다.
grant select on public.outings to authenticated;
grant insert (student_no, enrollment_id, campus, out_at, out_by, in_at, in_by) on public.outings to authenticated;
grant update (in_at, in_by) on public.outings to authenticated;
drop policy if exists outings_read on public.outings;
create policy outings_read on public.outings for select to authenticated
  using (public.is_staff() or campus = public.current_guard_campus());
drop policy if exists outings_insert on public.outings;
create policy outings_insert on public.outings for insert to authenticated
  with check (campus = public.current_guard_campus() and public.near_now(out_at) and public.near_now(in_at));
drop policy if exists outings_return on public.outings;
create policy outings_return on public.outings for update to authenticated
  using (campus = public.current_guard_campus() and in_at is null)
  with check (campus = public.current_guard_campus() and in_at is not null and public.near_now(in_at));

-- 가드 리포트: 가드가 자기 출입구로 등록, 직원과 그 가드가 읽는다.
grant select on public.incident_reports to authenticated;
grant insert (student_no, enrollment_id, campus, kind, note, occurred_at, reported_by) on public.incident_reports to authenticated;
drop policy if exists reports_read on public.incident_reports;
create policy reports_read on public.incident_reports for select to authenticated
  using (public.is_staff() or campus = public.current_guard_campus());
drop policy if exists reports_insert on public.incident_reports;
create policy reports_insert on public.incident_reports for insert to authenticated
  with check (campus = public.current_guard_campus() and occurred_at <= now() + interval '2 minutes');

-- 점수표: 직원이 읽고 바꾼다.
grant select, update on public.penalty_rules, public.penalty_stages to authenticated;
drop policy if exists rules_staff on public.penalty_rules;
create policy rules_staff on public.penalty_rules for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists stages_staff on public.penalty_stages;
create policy stages_staff on public.penalty_stages for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 패널티: 직원이 다룬다(통금 위반 후보 정리·승인·반려). 가드는 자기 출입구의 가드 리포트 후보만 등록한다.
grant select, insert, update, delete on public.penalties to authenticated;
drop policy if exists penalties_staff on public.penalties;
create policy penalties_staff on public.penalties for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists penalties_guard_insert on public.penalties;
create policy penalties_guard_insert on public.penalties for insert to authenticated
  with check (source = 'guard' and status = 'pending' and score is null and decided_at is null and decided_by is null
              and campus = public.current_guard_campus());

-- 내부 공지: 직원이 읽고 쓴다. 읽음은 본인 것만 남긴다.
grant select, insert, update on public.internal_notices to authenticated;
grant select, insert on public.internal_notice_reads to authenticated;
drop policy if exists notices_staff on public.internal_notices;
create policy notices_staff on public.internal_notices for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists notice_reads_read on public.internal_notice_reads;
create policy notice_reads_read on public.internal_notice_reads for select to authenticated using (public.is_staff());
drop policy if exists notice_reads_insert on public.internal_notice_reads;
create policy notice_reads_insert on public.internal_notice_reads for insert to authenticated
  with check (public.is_staff() and user_id = auth.uid());

-- 접근 기록: 같은 캠퍼스 직원이 읽는다. 쓰기는 상담 함수만.
grant select on public.audit_logs to authenticated;
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (public.staff_has_campus(campus));
-- counseling_notes 에는 authenticated 권한을 주지 않는다(위에서 revoke). 아래 함수로만.

create or replace function public.counseling_audit(p_action text, n public.counseling_notes)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, actor_name, action, target_id, student_no, campus)
  values (auth.uid(), public.current_staff_name(), p_action, n.id::text, n.student_no, n.campus);
$$;

-- 목록: 내용 없이. 맡은 캠퍼스만.
create or replace function public.counseling_list()
returns table (id uuid, student_no text, campus text, counsel_date date, title text, author_name text,
               follow_up_due date, follow_up_done boolean, follow_up_done_at timestamptz, follow_up_done_by text,
               created_at timestamptz, updated_at timestamptz, updated_by text)
language sql stable security definer set search_path = public as $$
  select n.id, n.student_no, n.campus, n.counsel_date, n.title, n.author_name, n.follow_up_due, n.follow_up_done,
         n.follow_up_done_at, n.follow_up_done_by, n.created_at, n.updated_at, n.updated_by
    from public.counseling_notes n
   where public.staff_has_campus(n.campus)
   order by n.counsel_date desc, n.created_at desc;
$$;

-- 상세: 내용까지. 열 때마다 '열람'을 남긴다(같은 직원이 10초 안에 다시 열면 한 번으로).
create or replace function public.counseling_open(p_id uuid)
returns setof public.counseling_notes language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id;
  if not found or not public.staff_has_campus(n.campus) then raise exception 'not_found'; end if;
  if not exists (select 1 from public.audit_logs a where a.target_id = p_id::text and a.actor_id = auth.uid() and a.action = 'view' and a.at > now() - interval '10 seconds') then
    perform public.counseling_audit('view', n);
  end if;
  return next n;
end $$;

create or replace function public.counseling_create(p_student_no text, p_campus text, p_date date, p_title text, p_content text, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  if not public.staff_has_campus(p_campus) then raise exception 'campus_not_allowed'; end if;
  if p_date > public.manila_today() then raise exception 'invalid_date'; end if;
  insert into public.counseling_notes (student_no, campus, counsel_date, title, content, follow_up_due, author_id, author_name, updated_by)
  values (p_student_no, p_campus, p_date, trim(p_title), trim(p_content), p_due, auth.uid(), public.current_staff_name(), public.current_staff_name())
  returning * into n;
  perform public.counseling_audit('create', n);
  return n.id;
end $$;

-- 수정: 기한을 바꾸면 후속 조치를 다시 연다.
create or replace function public.counseling_update(p_id uuid, p_date date, p_title text, p_content text, p_due date default null)
returns void language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id for update;
  if not found or not public.staff_has_campus(n.campus) then raise exception 'not_found'; end if;
  if p_date > public.manila_today() then raise exception 'invalid_date'; end if;
  update public.counseling_notes
     set counsel_date = p_date, title = trim(p_title), content = trim(p_content), follow_up_due = p_due,
         follow_up_done = case when p_due is distinct from n.follow_up_due then false else follow_up_done end,
         follow_up_done_at = case when p_due is distinct from n.follow_up_due then null else follow_up_done_at end,
         follow_up_done_by = case when p_due is distinct from n.follow_up_due then null else follow_up_done_by end,
         updated_at = now(), updated_by = public.current_staff_name()
   where id = p_id
  returning * into n;
  perform public.counseling_audit('update', n);
end $$;

create or replace function public.counseling_followup(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id for update;
  if not found or not public.staff_has_campus(n.campus) then raise exception 'not_found'; end if;
  if n.follow_up_due is null then raise exception 'no_followup'; end if;
  if n.follow_up_done = p_done then return; end if;
  update public.counseling_notes
     set follow_up_done = p_done,
         follow_up_done_at = case when p_done then now() else null end,
         follow_up_done_by = case when p_done then public.current_staff_name() else null end
   where id = p_id
  returning * into n;
  perform public.counseling_audit(case when p_done then 'followup_done' else 'followup_reopen' end, n);
end $$;

-- ── 함수 실행 권한: 익명은 막고, 로그인한 사용자와 서비스 키만
do $$
declare
  f text;
begin
  foreach f in array array[
    'current_student_no()', 'is_student()', 'current_guard_campus()', 'is_guard()', 'staff_has_campus(text)',
    'current_staff_name()', 'student_password_changed()', 'enrollment_of_student(text, text)',
    'cancel_absence_request(uuid)', 'cancel_overnight_permission(uuid)',
    'decide_absence_requests(uuid[], boolean, text)', 'decide_overnight_permissions(uuid[], boolean, text)',
    'counseling_list()', 'counseling_open(uuid)', 'counseling_create(text, text, date, text, text, date)',
    'counseling_update(uuid, date, text, text, date)', 'counseling_followup(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$$;
-- 기록 남기는 내부 함수는 다른 함수 안에서만 쓴다.
revoke execute on function public.counseling_audit(text, public.counseling_notes) from public, anon, authenticated;
grant execute on function public.manila_today() to authenticated, service_role;
grant execute on function public.near_now(timestamptz) to authenticated, service_role;
