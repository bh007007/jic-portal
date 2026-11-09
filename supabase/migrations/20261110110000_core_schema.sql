-- 정규화 스키마 1단계: 학생·기수·연수·연장(docs/schema.md). 여러 번 실행해도 된다.
-- 11/10 레오님 결정: 코드는 지금 만들고, 적용은 학원 계정의 새 Supabase 프로젝트에서 처음부터 한다(지금 개인 계정 DB에는 적용하지 않아도 된다. 적용해도 빈 표라 화면은 그대로다).
--
-- 두 층 구조(기획안 'DB 이관 전략'): 업체 원본은 legacy_*(jsonb) 그대로 두고, 화면이 읽을 표를 여기서 만든다.
-- 채우기는 load_core_from_legacy()(서비스 키만): legacy_* → 이 표들. 다시 돌려도 같은 결과(upsert).
-- 업체 번호를 그대로 키로 쓴다(학생 student_no = st_id, 연수 id = tr_id, 연장 id = tt_id). legacy_id 는 원본 행 추적용.
-- 이름이 겹치는 표: campuses·courses 는 파트너 포털 소개 내용(20261107010000)이라, 연수에는 업체 캠퍼스 코드·코스 요약을 글자로 둔다(2단계에서 기준 코드 표).
-- 권한: 직원(is_staff())만 읽는다. 쓰기는 서비스 키(불러오기)만. 모듈을 JIC 포털로 넘길 때 그 표의 쓰기 정책을 더한다.

-- ── 업체 값 바꾸기(빈 값·잘못된 값은 null)
create or replace function public.legacy_date(v text) returns date language sql immutable as $$
  select case when v ~ '^\d{4}-\d{2}-\d{2}' then substr(v, 1, 10)::date end
$$;
create or replace function public.legacy_ts(v text) returns timestamptz language sql immutable as $$
  select case when v ~ '^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$' then (v::timestamp at time zone 'Asia/Manila') end
$$; -- 업체 시각은 필리핀 시각으로 적혀 있다
create or replace function public.legacy_int(v text) returns integer language sql immutable as $$
  select case when v ~ '^-?\d{1,9}$' then v::integer end
$$;

-- ── 표
create table if not exists public.students (
  student_no text primary key,                               -- 업체 st_id
  name text not null default '',
  last_name text not null default '',
  first_name text not null default '',
  birthday date,
  gender text not null default '',                           -- M·F
  country text not null default '',                          -- 국적 이름(st_country_cd_name)
  email text not null default '',
  phone text not null default '',
  language text not null default '',
  vip_level text not null default '',
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id text primary key,                                       -- 업체 기수 이름(sd_name, 예: 279_B)
  departure_date date,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id text primary key,                                       -- 업체 tr_id
  student_no text not null references public.students (student_no),
  batch_id text references public.batches (id),
  campus_code text not null default '',                      -- 첫 코스의 캠퍼스(first_co_ca_code: PREMIUM·CHALLENGER·MCO)
  dorm_campus_code text not null default '',
  courses text not null default '',                          -- 코스(기간) 요약, 예: ESL-Core(12w)
  dorms text not null default '',
  start_date date,
  finish_date date,                                          -- 업체 원래 종료일. 연장 반영 종료일은 enrollment_periods.end_date
  weeks integer,
  state text not null default '',                            -- 업체 tr_state(INVOICE·CANCEL·CANCEL_TRAIN …)
  state_name text not null default '',                       -- 업체 tr_state_name(인보이스승인·캔슬·연수중 취소 …)
  country_code text not null default '',                     -- 인보이스 국적(tr_st_country)
  agency_id text not null default '',
  agency_name text not null default '',
  agent_id text not null default '',
  agent_name text not null default '',
  branch text not null default '',
  deposit_state text not null default '',                    -- 납부 상태(tr_deposit_name)
  deposit_due_date date,
  departure_date date,
  return_date date,
  pickup_type text not null default '',
  pickup_place text not null default '',
  room_clear boolean not null default false,
  point_clear boolean not null default false,
  agency_memo text not null default '',
  branch_memo text not null default '',
  invoiced_at timestamptz,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enrollments_student on public.enrollments (student_no);
create index if not exists enrollments_period on public.enrollments (start_date, finish_date);
create index if not exists enrollments_batch on public.enrollments (batch_id);

create table if not exists public.enrollment_extensions (
  id text primary key,                                       -- 업체 tt_id
  enrollment_id text not null references public.enrollments (id) on delete cascade,
  start_date date,
  finish_date date,
  weeks integer,
  memo text not null default '',
  registered_at timestamptz,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enrollment_extensions_enrollment on public.enrollment_extensions (enrollment_id);

-- ── 종료일·상태(관리자 core.ts finishOf·statusOf 와 같은 규칙)
-- 연장해도 업체는 원래 종료일을 두므로, 종료일 = 원래 종료일과 마지막 연장 종료일 중 늦은 날.
create or replace view public.enrollment_periods with (security_invoker = true) as
  select e.id, e.student_no, e.start_date, e.finish_date,
         greatest(e.finish_date, max(x.finish_date)) as end_date,
         count(x.id)::integer as extensions
  from public.enrollments e
  left join public.enrollment_extensions x on x.enrollment_id = e.id
  group by e.id;

-- 상태: cancelled 취소(캔슬·거절·취소·연기·홀드·요청) / upcoming 입학 예정 / current 재학 / graduated 졸업 / other(퇴교, 날짜 없음)
create or replace function public.enrollment_status(p_state_name text, p_start date, p_end date, p_ref date)
returns text language sql immutable as $$
  select case
    when coalesce(p_state_name, '') ~ '캔슬|거절|취소|연기|홀드|요청' then 'cancelled'
    when p_start is null or p_end is null then 'other'
    when p_start > p_ref then 'upcoming'
    when p_state_name = '퇴교' then 'other'
    when p_end < p_ref then 'graduated'
    else 'current'
  end
$$;

-- ── 업체 원본 → 정규화 표(서비스 키만). 다시 돌려도 같은 결과. 원본에서 사라진 행은 지우지 않는다(다른 표가 가리킬 수 있어서).
create or replace function public.load_core_from_legacy()
returns table (tbl text, row_count integer)
language plpgsql security definer set search_path = public as $$
begin
  insert into public.students as s (student_no, name, last_name, first_name, birthday, gender, country, email, phone, language, vip_level, legacy_id)
  select d->>'st_id', coalesce(d->>'st_name', ''), coalesce(d->>'st_last_name', ''), coalesce(d->>'st_first_name', ''),
         public.legacy_date(d->>'st_birthday'), upper(coalesce(d->>'st_gender', '')), coalesce(d->>'st_country_cd_name', ''),
         coalesce(d->>'st_email', ''), coalesce(d->>'st_cell', ''), coalesce(d->>'st_lang_name', ''), coalesce(d->>'st_vip_level', ''), d->>'st_id'
  from (select data as d from public.legacy_students) l
  where coalesce(d->>'st_id', '') <> ''
  on conflict (student_no) do update set
    name = excluded.name, last_name = excluded.last_name, first_name = excluded.first_name, birthday = excluded.birthday,
    gender = excluded.gender, country = excluded.country, email = excluded.email, phone = excluded.phone,
    language = excluded.language, vip_level = excluded.vip_level, legacy_id = excluded.legacy_id, updated_at = now();

  -- 학생 목록에 없는 학생의 연수: 연수 행의 이름으로 학생을 만든다(연수가 빠지지 않게)
  insert into public.students (student_no, name, last_name, first_name, legacy_id)
  select distinct on (d->>'tr_st_id') d->>'tr_st_id', coalesce(d->>'st_name', ''), coalesce(d->>'st_last_name', ''), coalesce(d->>'st_first_name', ''), d->>'tr_st_id'
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'tr_st_id', '') <> ''
  on conflict (student_no) do nothing;

  insert into public.batches as b (id, departure_date, start_date)
  select distinct on (d->>'sd_name') d->>'sd_name', public.legacy_date(d->>'sd_departure_date'), public.legacy_date(d->>'sd_start_date')
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'sd_name', '') <> ''
  order by d->>'sd_name', d->>'sd_start_date' desc nulls last
  on conflict (id) do update set departure_date = excluded.departure_date, start_date = excluded.start_date, updated_at = now();

  insert into public.enrollments as e (id, student_no, batch_id, campus_code, dorm_campus_code, courses, dorms, start_date, finish_date, weeks,
    state, state_name, country_code, agency_id, agency_name, agent_id, agent_name, branch, deposit_state, deposit_due_date,
    departure_date, return_date, pickup_type, pickup_place, room_clear, point_clear, agency_memo, branch_memo, invoiced_at, legacy_id)
  select d->>'tr_id', d->>'tr_st_id', nullif(d->>'sd_name', ''), coalesce(d->>'first_co_ca_code', ''), coalesce(d->>'first_do_ca_code', ''),
         coalesce(d->>'courses', ''), coalesce(d->>'dorms', ''), public.legacy_date(d->>'tr_start_date'), public.legacy_date(d->>'tr_finish_date'),
         public.legacy_int(d->>'tr_total_week'), coalesce(d->>'tr_state', ''), coalesce(d->>'tr_state_name', ''), coalesce(d->>'tr_st_country', ''),
         coalesce(d->>'ag_id', ''), coalesce(d->>'ag_name', ''), coalesce(d->>'tr_am_id', ''), coalesce(d->>'am_name', ''), coalesce(d->>'am_branch', ''),
         coalesce(d->>'tr_deposit_name', ''), public.legacy_date(d->>'tr_deposit_due_date'),
         public.legacy_date(d->>'tr_departure_date'), public.legacy_date(d->>'tr_return_date'),
         coalesce(d->>'tr_pick_type', ''), coalesce(d->>'tr_pick_place', ''),
         upper(coalesce(d->>'tr_room_clear_yn', '')) = 'Y', upper(coalesce(d->>'tr_point_clear_yn', '')) = 'Y',
         coalesce(d->>'tr_ag_memo', ''), coalesce(d->>'tr_br_memo', ''), public.legacy_ts(d->>'tr_invoice_dt'), d->>'tr_id'
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'tr_id', '') <> '' and coalesce(d->>'tr_st_id', '') <> ''
  on conflict (id) do update set
    student_no = excluded.student_no, batch_id = excluded.batch_id, campus_code = excluded.campus_code, dorm_campus_code = excluded.dorm_campus_code,
    courses = excluded.courses, dorms = excluded.dorms, start_date = excluded.start_date, finish_date = excluded.finish_date, weeks = excluded.weeks,
    state = excluded.state, state_name = excluded.state_name, country_code = excluded.country_code, agency_id = excluded.agency_id,
    agency_name = excluded.agency_name, agent_id = excluded.agent_id, agent_name = excluded.agent_name, branch = excluded.branch,
    deposit_state = excluded.deposit_state, deposit_due_date = excluded.deposit_due_date, departure_date = excluded.departure_date,
    return_date = excluded.return_date, pickup_type = excluded.pickup_type, pickup_place = excluded.pickup_place,
    room_clear = excluded.room_clear, point_clear = excluded.point_clear, agency_memo = excluded.agency_memo,
    branch_memo = excluded.branch_memo, invoiced_at = excluded.invoiced_at, legacy_id = excluded.legacy_id, updated_at = now();

  -- 연장(20261109030000_legacy_extend.sql 이 있을 때만)
  if to_regclass('public.legacy_extensions') is not null then
    insert into public.enrollment_extensions as x (id, enrollment_id, start_date, finish_date, weeks, memo, registered_at, legacy_id)
    select d->>'tt_id', d->>'tr_id', public.legacy_date(d->>'tt_start_date'), public.legacy_date(d->>'tt_finish_date'),
           public.legacy_int(d->>'tt_week'), coalesce(d->>'tt_memo', ''), public.legacy_ts(d->>'tt_insert_dt'), d->>'tt_id'
    from (select data as d from public.legacy_extensions) l
    where coalesce(d->>'tt_id', '') <> '' and exists (select 1 from public.enrollments e where e.id = d->>'tr_id')
    on conflict (id) do update set
      enrollment_id = excluded.enrollment_id, start_date = excluded.start_date, finish_date = excluded.finish_date, weeks = excluded.weeks,
      memo = excluded.memo, registered_at = excluded.registered_at, legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  return query
    select 'students'::text, count(*)::integer from public.students
    union all select 'batches', count(*)::integer from public.batches
    union all select 'enrollments', count(*)::integer from public.enrollments
    union all select 'enrollment_extensions', count(*)::integer from public.enrollment_extensions;
end
$$;
revoke execute on function public.load_core_from_legacy() from public, anon, authenticated;
grant execute on function public.load_core_from_legacy() to service_role;

-- ── 권한: 직원만 읽기, 쓰기는 서비스 키
do $$
declare t text;
begin
  foreach t in array array['students', 'batches', 'enrollments', 'enrollment_extensions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
  end loop;
end
$$;
revoke all on public.enrollment_periods from anon, authenticated;
grant select on public.enrollment_periods to authenticated, service_role;
