-- 파트너 포털 1차 (사이트맵 0.1–12.7). 테이블 이름은 기획안 '파트너' 그룹을 따른다.
-- 학생 정보는 저장하지 않는다(원칙 P3). 여러 번 실행해도 되게 쓴다.
-- 계정 흐름: 등록 신청 화면에서 supabase.auth.signUp(메타데이터 portal='partner') → 트리거가 agency_requests 생성
--          → JIC 관리자가 approve_agency_request() 로 승인 → agency_members(status=active) → 로그인 후 사용.

-- ── 공통: 파트너(승인된 지점 계정) 여부
create table if not exists public.agency_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  agency_name text not null,
  branch text,
  country text,
  contact_name text,
  phone text,
  lang text not null default 'ko',
  currency text not null default 'KRW',
  status text not null default 'active' check (status in ('active', 'suspended')),
  legacy_am_id text,             -- 업체 포털 담당자 계정(am_id) 연결, 선택
  login_count integer not null default 0,
  last_login_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agency_members where user_id = auth.uid() and status = 'active');
$$;
revoke execute on function public.is_partner() from public, anon;
grant execute on function public.is_partner() to authenticated, service_role;

-- ── 등록 신청
create table if not exists public.agency_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  agency_name text not null,
  branch text,
  country text,
  contact_name text,
  phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_partner_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if m->>'portal' = 'partner' then
    insert into public.agency_requests (user_id, email, agency_name, branch, country, contact_name, phone, message)
    values (new.id, new.email, coalesce(nullif(m->>'agency_name', ''), '(미입력)'), m->>'branch', m->>'country',
            m->>'contact_name', m->>'phone', m->>'message')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists on_partner_signup on auth.users;
create trigger on_partner_signup after insert on auth.users for each row execute function public.handle_partner_signup();

create or replace function public.approve_agency_request(p_request_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.agency_requests;
begin
  if not public.is_staff() then raise exception '관리자만 처리할 수 있습니다.'; end if;
  select * into r from public.agency_requests where id = p_request_id for update;
  if not found then raise exception '신청을 찾을 수 없습니다.'; end if;
  update public.agency_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_request_id;
  if p_approve then
    insert into public.agency_members (user_id, email, agency_name, branch, country, contact_name, phone, approved_by)
    values (r.user_id, r.email, r.agency_name, r.branch, r.country, r.contact_name, r.phone, auth.uid())
    on conflict (user_id) do update set status = 'active', updated_at = now();
  end if;
end $$;
revoke execute on function public.approve_agency_request(bigint, boolean, text) from public, anon;
grant execute on function public.approve_agency_request(bigint, boolean, text) to authenticated;

-- 로그인 기록(지점별 접속 수, 12.7)
create or replace function public.touch_partner_login()
returns void language sql security definer set search_path = public as $$
  update public.agency_members set login_count = login_count + 1, last_login_at = now() where user_id = auth.uid();
$$;
revoke execute on function public.touch_partner_login() from public, anon;
grant execute on function public.touch_partner_login() to authenticated;

-- ── 캠퍼스·코스(기준 코드) + 포털용 내용
create table if not exists public.campuses (
  id text primary key,
  name text not null,
  tagline text,
  status text not null default 'open' check (status in ('open', 'preparing')),
  sort integer not null default 0,
  direction text, environment text, facilities text, activities text, life text,
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id text primary key,
  campus_id text not null references public.campuses (id),
  name text not null,
  levels jsonb not null default '[]'::jsonb,  -- [{name, lessons, intensity, budget, includes}]
  sort integer not null default 0,
  status text not null default 'open' check (status in ('open', 'preparing')),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_contents (
  course_id text primary key references public.courses (id) on delete cascade,
  summary text, target text, structure text, outcomes text, media_links text,
  reason_learning text, reason_growth text, reason_environment text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.recommendation_rules (
  id bigint generated always as identity primary key,
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  note text,
  questions jsonb not null,
  rules jsonb not null,
  level_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 공지·프로모션, 자료실, 설정, 방문 신청, 학습계획서 다운로드
create table if not exists public.partner_notices (
  id bigint generated always as identity primary key,
  kind text not null default 'notice' check (kind in ('notice', 'promotion')),
  tag text not null default '안내',
  title text not null,
  body text,
  target text,
  pinned boolean not null default false,
  starts_on date,
  ends_on date,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table if not exists public.partner_resources (
  id bigint generated always as identity primary key,
  category text not null,
  title text not null,
  description text,
  file_path text,
  file_name text,
  file_size bigint,
  link_url text,
  updated_on date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table if not exists public.partner_settings (
  key text primary key,
  value text not null default '',
  label text,
  updated_at timestamptz not null default now()
);

create table if not exists public.visit_requests (
  id bigint generated always as identity primary key,
  member_id uuid not null default auth.uid() references public.agency_members (user_id) on delete cascade,
  visit_date date not null,
  people integer not null check (people between 1 and 50),
  purpose text not null,
  status text not null default 'received' check (status in ('received', 'confirmed', 'done', 'cancelled')),
  staff_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_downloads (
  id bigint generated always as identity primary key,
  member_id uuid not null default auth.uid() references public.agency_members (user_id) on delete cascade,
  course_id text,
  created_at timestamptz not null default now()
);

-- ── 권한
do $$
declare t text;
begin
  foreach t in array array['agency_members', 'agency_requests', 'campuses', 'courses', 'course_contents', 'recommendation_rules',
                            'partner_notices', 'partner_resources', 'partner_settings', 'visit_requests', 'plan_downloads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_staff_all', t);
  end loop;
end $$;

-- 직원(관리자): 모든 테이블 읽기·쓰기 (정책은 위에서, 여기서는 grant)
grant select, insert, update, delete on public.campuses, public.courses, public.course_contents, public.recommendation_rules,
  public.partner_notices, public.partner_resources, public.partner_settings to authenticated;
grant select, update on public.agency_members, public.agency_requests, public.visit_requests to authenticated;
grant select, insert on public.visit_requests, public.plan_downloads to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 공개 대시보드(로그인 전): 캠퍼스 카드만
grant select (id, name, tagline, status, sort) on public.campuses to anon;
drop policy if exists campuses_public_read on public.campuses;
create policy campuses_public_read on public.campuses for select to anon, authenticated using (true);

-- 파트너: 내용 읽기
drop policy if exists courses_partner_read on public.courses;
create policy courses_partner_read on public.courses for select to authenticated using (public.is_partner());
drop policy if exists course_contents_partner_read on public.course_contents;
create policy course_contents_partner_read on public.course_contents for select to authenticated using (public.is_partner());
drop policy if exists rules_partner_read on public.recommendation_rules;
create policy rules_partner_read on public.recommendation_rules for select to authenticated using (public.is_partner());
drop policy if exists notices_partner_read on public.partner_notices;
create policy notices_partner_read on public.partner_notices for select to authenticated
  using (public.is_partner() and published and (starts_on is null or starts_on <= current_date));
drop policy if exists resources_partner_read on public.partner_resources;
create policy resources_partner_read on public.partner_resources for select to authenticated using (public.is_partner());
drop policy if exists settings_partner_read on public.partner_settings;
create policy settings_partner_read on public.partner_settings for select to authenticated using (public.is_partner());

-- 파트너: 내 계정·내 신청
drop policy if exists members_self_read on public.agency_members;
create policy members_self_read on public.agency_members for select to authenticated using (user_id = auth.uid());
drop policy if exists members_self_update on public.agency_members;
create policy members_self_update on public.agency_members for update to authenticated
  using (user_id = auth.uid() and status = 'active') with check (user_id = auth.uid() and status = 'active');
drop policy if exists requests_self_read on public.agency_requests;
create policy requests_self_read on public.agency_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists visits_partner_read on public.visit_requests;
create policy visits_partner_read on public.visit_requests for select to authenticated using (member_id = auth.uid());
drop policy if exists visits_partner_insert on public.visit_requests;
create policy visits_partner_insert on public.visit_requests for insert to authenticated
  with check (member_id = auth.uid() and public.is_partner() and status = 'received' and staff_note is null);
drop policy if exists downloads_partner_insert on public.plan_downloads;
create policy downloads_partner_insert on public.plan_downloads for insert to authenticated
  with check (member_id = auth.uid() and public.is_partner());

-- 파트너가 고칠 수 있는 내 계정 열은 연락처·화면 설정뿐 (상태·지점명은 관리자만)
revoke update on public.agency_members from authenticated;
grant update (contact_name, phone, lang, currency, updated_at) on public.agency_members to authenticated;
-- 직원은 정책(_staff_all)으로 전체 수정이 필요하므로 별도 함수 없이 상태 변경용 열도 허용
grant update (status, agency_name, branch, country, legacy_am_id) on public.agency_members to authenticated;
-- 위 grant 는 열 권한만 연다. 실제로 누가 어떤 행을 고칠 수 있는지는 RLS 가 정한다:
-- 파트너는 members_self_update 로 자기 행만, 상태 열은 아래 트리거가 막는다.
create or replace function public.guard_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() and (new.status is distinct from old.status or new.agency_name is distinct from old.agency_name
      or new.branch is distinct from old.branch or new.country is distinct from old.country
      or new.legacy_am_id is distinct from old.legacy_am_id or new.email is distinct from old.email) then
    raise exception '연락처와 화면 설정만 바꿀 수 있습니다.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_member_update on public.agency_members;
create trigger guard_member_update before update on public.agency_members for each row execute function public.guard_member_update();

-- ── 자료실 파일 저장소 (비공개, 파트너·직원만 읽기, 직원만 올리기)
insert into storage.buckets (id, name, public) values ('partner-resources', 'partner-resources', false) on conflict (id) do nothing;
drop policy if exists partner_resources_read on storage.objects;
create policy partner_resources_read on storage.objects for select to authenticated
  using (bucket_id = 'partner-resources' and (public.is_partner() or public.is_staff()));
drop policy if exists partner_resources_write on storage.objects;
create policy partner_resources_write on storage.objects for all to authenticated
  using (bucket_id = 'partner-resources' and public.is_staff()) with check (bucket_id = 'partner-resources' and public.is_staff());

-- ── 기본 데이터 (사이트맵에 확정된 이름만. 설명 문구는 관리자 화면에서 입력)
insert into public.campuses (id, name, tagline, status, sort) values
  ('premium', 'Premium', '세미 스파르타 · 스피킹 중심', 'open', 1),
  ('challenger', 'Challenger', '뉴 스파르타 · IELTS 목표', 'open', 2),
  ('new', 'New Campus', null, 'preparing', 3)
on conflict (id) do nothing;

insert into public.courses (id, campus_id, name, levels, sort) values
  ('p-esl', 'premium', 'ESL', '[]', 1),
  ('p-tep', 'premium', 'TEP', '[{"name":"8"},{"name":"9"},{"name":"10"}]', 2),
  ('p-speaking', 'premium', 'Speaking Course', '[{"name":"STARTER"},{"name":"PRO"},{"name":"MASTER"}]', 3),
  ('p-wh', 'premium', 'Working Holiday', '[]', 4),
  ('p-toeic', 'premium', 'TOEIC', '[]', 5),
  ('p-business', 'premium', 'Business Master', '[]', 6),
  ('p-senior', 'premium', 'Senior', '[{"name":"3"},{"name":"4"}]', 7),
  ('c-ielts', 'challenger', 'IELTS', '[]', 1),
  ('c-ielts-g', 'challenger', 'IELTS Guarantee', '[]', 2),
  ('c-esl', 'challenger', 'ESL', '[]', 3)
on conflict (id) do nothing;
insert into public.course_contents (course_id) select id from public.courses on conflict do nothing;

insert into public.partner_settings (key, label) values
  ('quote_kr', '견적 사이트 (KR)'), ('quote_jp', '견적 사이트 (JP)'), ('quote_usd', '견적 사이트 (USD)'), ('quote_usd_new', '견적 사이트 (USD-New)'),
  ('vacancy_url', '업체 포털 공실 화면'), ('register_url', '업체 포털 등록 화면'),
  ('register_guide', '등록 안내 (입학 일정·절차·서류·문의처)'),
  ('newsletter_latest', '뉴스레터 최신호'), ('newsletter_archive', '뉴스레터 지난 호'),
  ('contact_email', '파트너 문의 이메일')
on conflict (key) do nothing;

-- 추천 조건표: 센터장 승인 전이라 'draft' 샘플. 승인본이 들어오면 관리자 화면(12.2)에서 바꾼다.
insert into public.recommendation_rules (version, status, note, questions, rules, level_defaults)
select 'sample-1', 'draft', '센터장 승인 전 샘플 규칙. 실제 상담에 쓰기 전에 승인본으로 바꿔야 한다.',
  '[
    {"id":"purpose","label":"학습 목적","options":[["speaking","스피킹 실력 향상"],["general","전반적인 영어 (ESL)"],["ielts","IELTS 점수"],["toeic","TOEIC 점수"],["work","워킹홀리데이·취업 준비"],["business","비즈니스 영어"]]},
    {"id":"style","label":"학교 분위기","options":[["semi","관리형 (세미 스파르타)"],["sparta","집중형 (스파르타)"],["any","상관없음"]]},
    {"id":"level","label":"현재 수준","options":[["beginner","초급"],["lowmid","초중급"],["mid","중급"],["high","중상급 이상"]]},
    {"id":"weeks","label":"연수 기간","options":[["4","4주"],["8","8주"],["12","12주"],["16","16주"],["24","24주 이상"]]},
    {"id":"age","label":"연령대","options":[["teen","10대"],["20s","20대"],["30s","30대"],["40s","40대"],["50s","50대 이상"]]}
  ]'::jsonb,
  '[
    {"when":{"purpose":["ielts"]},"campus":"challenger","first":"c-ielts","alt":"c-ielts-g","weeks":12},
    {"when":{"age":["50s"]},"campus":"premium","first":"p-senior","alt":"p-esl","weeks":4},
    {"when":{"purpose":["toeic"]},"campus":"premium","first":"p-toeic","alt":"p-esl","weeks":8},
    {"when":{"purpose":["work"]},"campus":"premium","first":"p-wh","alt":"p-speaking","weeks":8},
    {"when":{"purpose":["business"]},"campus":"premium","first":"p-business","alt":"p-speaking","weeks":8},
    {"when":{"purpose":["speaking"]},"campus":"premium","first":"p-speaking","alt":"p-tep","weeks":12},
    {"when":{"purpose":["general"],"style":["sparta"]},"campus":"challenger","first":"c-esl","alt":"p-tep","weeks":12},
    {"when":{},"campus":"premium","first":"p-esl","alt":"p-tep","weeks":12}
  ]'::jsonb,
  '{"p-speaking":{"beginner":"STARTER","lowmid":"STARTER","mid":"PRO","high":"MASTER"},
    "p-tep":{"beginner":"8","lowmid":"8","mid":"9","high":"10"},
    "p-senior":{"beginner":"3","lowmid":"3","mid":"4","high":"4"}}'::jsonb
where not exists (select 1 from public.recommendation_rules);
