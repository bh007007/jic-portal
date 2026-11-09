-- 정규화 스키마 1단계 보강: 관리자 core 가 연수 행에서 읽는 열을 마저 더한다(docs/schema.md '5단계 어댑터'). 여러 번 실행해도 된다.
-- 1단계(20261110110000_core_schema.sql)와 같이 적용은 학원 계정 새 프로젝트에서. 그 파일을 다시 실행하면 load_core_from_legacy() 가
-- 예전 것으로 돌아가므로 이 파일도 다시 실행한다.
-- 더하는 것: 통화, 인보이스 국적 이름, 메모(학생·은행·회계·지점 영문), 취소·연수 중 취소·연기·퇴교 날짜와 메모, 픽업 항공편, 납부 상태 코드,
-- 에이전시 영문 이름, 학생 국적 코드, 추가 기수 여부. 업체 연수 행의 학생 열(이름·국적·성별 이름)은 실제 데이터 5,534건 모두 학생 행과 같아(11/10 확인)
-- 따로 두지 않고 students 에서 가져온다. 여권·연락처 같은 업체 연수 열은 화면이 쓰지 않아 옮기지 않는다.

-- 날짜 바꾸기: 모양은 맞아도 없는 날짜(0000-00-00 등, 실제 추출본에 있음)는 null 로(1단계 함수는 여기서 오류가 났다)
create or replace function public.legacy_date(v text) returns date language plpgsql immutable as $$
begin
  if v !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return substr(v, 1, 10)::date;
exception when others then
  return null;
end
$$;
create or replace function public.legacy_ts(v text) returns timestamptz language plpgsql immutable as $$
begin
  if v !~ '^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$' then return null; end if;
  return v::timestamp at time zone 'Asia/Manila';
exception when others then
  return null;
end
$$;

alter table public.students add column if not exists country_code text not null default '';     -- st_country(VIE·KOR …)
alter table public.batches add column if not exists is_extra boolean not null default false;     -- sd_extra_yn(추가 기수)

alter table public.enrollments add column if not exists currency text not null default '';        -- tr_currency(USD·JPY·KRW)
alter table public.enrollments add column if not exists country_name text not null default '';    -- tr_st_country_name(인보이스 국적 영문)
alter table public.enrollments add column if not exists deposit_state_code text not null default ''; -- tr_deposit_state(NONE·PART·FULL)
alter table public.enrollments add column if not exists agency_name_en text not null default '';
alter table public.enrollments add column if not exists student_memo text not null default '';    -- tr_st_memo
alter table public.enrollments add column if not exists bank_memo text not null default '';       -- tr_bank_memo
alter table public.enrollments add column if not exists account_memo text not null default '';    -- tr_acct_memo(회계 메모)
alter table public.enrollments add column if not exists branch_memo_en text not null default '';  -- tr_br_memo_en
alter table public.enrollments add column if not exists cancel_at timestamptz;                     -- tr_cancel_dt(캔슬)
alter table public.enrollments add column if not exists cancel_memo text not null default '';
alter table public.enrollments add column if not exists cancel_train_at timestamptz;               -- tr_cancel_train_dt(연수 중 취소)
alter table public.enrollments add column if not exists cancel_train_memo text not null default '';
alter table public.enrollments add column if not exists postpone_at timestamptz;                   -- tr_postpone_dt(연기)
alter table public.enrollments add column if not exists postpone_memo text not null default '';
alter table public.enrollments add column if not exists expel_at timestamptz;                      -- tr_expel_dt(퇴교)
alter table public.enrollments add column if not exists expel_memo text not null default '';
alter table public.enrollments add column if not exists pickup_flight text not null default '';
alter table public.enrollments add column if not exists pickup_flight_num text not null default '';
alter table public.enrollments add column if not exists pickup_arrival_at timestamptz;             -- tr_pick_flight_arrival
alter table public.enrollments add column if not exists pickup_terminal text not null default '';
alter table public.enrollments add column if not exists pickup_remark text not null default '';

create or replace function public.load_core_from_legacy()
returns table (tbl text, row_count integer)
language plpgsql security definer set search_path = public as $$
begin
  insert into public.students as s (student_no, name, last_name, first_name, birthday, gender, country, country_code, email, phone, language, vip_level, legacy_id)
  select d->>'st_id', coalesce(d->>'st_name', ''), coalesce(d->>'st_last_name', ''), coalesce(d->>'st_first_name', ''),
         public.legacy_date(d->>'st_birthday'), upper(coalesce(d->>'st_gender', '')), coalesce(d->>'st_country_cd_name', ''),
         -- 국적 코드: 학생 행에 없으면(가짜 샘플) 그 학생 연수 행의 학생 국적 코드(같은 학생 열)
         coalesce(nullif(d->>'st_country', ''), (select x.data->>'st_country' from public.legacy_enrollments x where x.data->>'tr_st_id' = d->>'st_id' and coalesce(x.data->>'st_country', '') <> '' limit 1), ''),
         coalesce(d->>'st_email', ''), coalesce(d->>'st_cell', ''), coalesce(d->>'st_lang_name', ''), coalesce(d->>'st_vip_level', ''), d->>'st_id'
  from (select data as d from public.legacy_students) l
  where coalesce(d->>'st_id', '') <> ''
  on conflict (student_no) do update set
    name = excluded.name, last_name = excluded.last_name, first_name = excluded.first_name, birthday = excluded.birthday,
    gender = excluded.gender, country = excluded.country, country_code = excluded.country_code, email = excluded.email, phone = excluded.phone,
    language = excluded.language, vip_level = excluded.vip_level, legacy_id = excluded.legacy_id, updated_at = now();

  -- 학생 목록에 없는 학생의 연수: 연수 행의 학생 열로 학생을 만든다(연수가 빠지지 않게)
  insert into public.students (student_no, name, last_name, first_name, country, country_code, legacy_id)
  select distinct on (d->>'tr_st_id') d->>'tr_st_id', coalesce(d->>'st_name', ''), coalesce(d->>'st_last_name', ''), coalesce(d->>'st_first_name', ''),
         coalesce(d->>'st_country_name', ''), coalesce(d->>'st_country', ''), d->>'tr_st_id'
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'tr_st_id', '') <> ''
  on conflict (student_no) do nothing;

  insert into public.batches as b (id, departure_date, start_date, is_extra)
  select distinct on (d->>'sd_name') d->>'sd_name', public.legacy_date(d->>'sd_departure_date'), public.legacy_date(d->>'sd_start_date'),
         upper(coalesce(d->>'sd_extra_yn', '')) = 'Y'
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'sd_name', '') <> ''
  order by d->>'sd_name', d->>'sd_start_date' desc nulls last
  on conflict (id) do update set departure_date = excluded.departure_date, start_date = excluded.start_date, is_extra = excluded.is_extra, updated_at = now();

  insert into public.enrollments as e (id, student_no, batch_id, campus_code, dorm_campus_code, courses, dorms, start_date, finish_date, weeks,
    state, state_name, country_code, country_name, currency, agency_id, agency_name, agency_name_en, agent_id, agent_name, branch,
    deposit_state, deposit_state_code, deposit_due_date, departure_date, return_date,
    pickup_type, pickup_place, pickup_flight, pickup_flight_num, pickup_arrival_at, pickup_terminal, pickup_remark,
    room_clear, point_clear, agency_memo, branch_memo, branch_memo_en, student_memo, bank_memo, account_memo,
    cancel_at, cancel_memo, cancel_train_at, cancel_train_memo, postpone_at, postpone_memo, expel_at, expel_memo,
    invoiced_at, legacy_id)
  select d->>'tr_id', d->>'tr_st_id', nullif(d->>'sd_name', ''), coalesce(d->>'first_co_ca_code', ''), coalesce(d->>'first_do_ca_code', ''),
         coalesce(d->>'courses', ''), coalesce(d->>'dorms', ''), public.legacy_date(d->>'tr_start_date'), public.legacy_date(d->>'tr_finish_date'),
         public.legacy_int(d->>'tr_total_week'), coalesce(d->>'tr_state', ''), coalesce(d->>'tr_state_name', ''),
         coalesce(d->>'tr_st_country', ''), coalesce(d->>'tr_st_country_name', ''), coalesce(d->>'tr_currency', ''),
         coalesce(d->>'ag_id', ''), coalesce(d->>'ag_name', ''), coalesce(d->>'ag_name_en', ''), coalesce(d->>'tr_am_id', ''), coalesce(d->>'am_name', ''), coalesce(d->>'am_branch', ''),
         coalesce(d->>'tr_deposit_name', ''), coalesce(d->>'tr_deposit_state', ''), public.legacy_date(d->>'tr_deposit_due_date'),
         public.legacy_date(d->>'tr_departure_date'), public.legacy_date(d->>'tr_return_date'),
         coalesce(d->>'tr_pick_type', ''), coalesce(d->>'tr_pick_place', ''), coalesce(d->>'tr_pick_flight', ''), coalesce(d->>'tr_pick_flight_num', ''),
         public.legacy_ts(d->>'tr_pick_flight_arrival'), coalesce(d->>'tr_pick_terminal', ''), coalesce(d->>'tr_pick_remark', ''),
         upper(coalesce(d->>'tr_room_clear_yn', '')) = 'Y', upper(coalesce(d->>'tr_point_clear_yn', '')) = 'Y',
         coalesce(d->>'tr_ag_memo', ''), coalesce(d->>'tr_br_memo', ''), coalesce(d->>'tr_br_memo_en', ''), coalesce(d->>'tr_st_memo', ''),
         coalesce(d->>'tr_bank_memo', ''), coalesce(d->>'tr_acct_memo', ''),
         public.legacy_ts(d->>'tr_cancel_dt'), coalesce(d->>'tr_cancel_memo', ''), public.legacy_ts(d->>'tr_cancel_train_dt'), coalesce(d->>'tr_cancel_train_memo', ''),
         public.legacy_ts(d->>'tr_postpone_dt'), coalesce(d->>'tr_postpone_memo', ''), public.legacy_ts(d->>'tr_expel_dt'), coalesce(d->>'tr_expel_memo', ''),
         public.legacy_ts(d->>'tr_invoice_dt'), d->>'tr_id'
  from (select data as d from public.legacy_enrollments) l
  where coalesce(d->>'tr_id', '') <> '' and coalesce(d->>'tr_st_id', '') <> ''
  on conflict (id) do update set
    student_no = excluded.student_no, batch_id = excluded.batch_id, campus_code = excluded.campus_code, dorm_campus_code = excluded.dorm_campus_code,
    courses = excluded.courses, dorms = excluded.dorms, start_date = excluded.start_date, finish_date = excluded.finish_date, weeks = excluded.weeks,
    state = excluded.state, state_name = excluded.state_name, country_code = excluded.country_code, country_name = excluded.country_name,
    currency = excluded.currency, agency_id = excluded.agency_id, agency_name = excluded.agency_name, agency_name_en = excluded.agency_name_en,
    agent_id = excluded.agent_id, agent_name = excluded.agent_name, branch = excluded.branch,
    deposit_state = excluded.deposit_state, deposit_state_code = excluded.deposit_state_code, deposit_due_date = excluded.deposit_due_date,
    departure_date = excluded.departure_date, return_date = excluded.return_date,
    pickup_type = excluded.pickup_type, pickup_place = excluded.pickup_place, pickup_flight = excluded.pickup_flight,
    pickup_flight_num = excluded.pickup_flight_num, pickup_arrival_at = excluded.pickup_arrival_at, pickup_terminal = excluded.pickup_terminal,
    pickup_remark = excluded.pickup_remark, room_clear = excluded.room_clear, point_clear = excluded.point_clear,
    agency_memo = excluded.agency_memo, branch_memo = excluded.branch_memo, branch_memo_en = excluded.branch_memo_en,
    student_memo = excluded.student_memo, bank_memo = excluded.bank_memo, account_memo = excluded.account_memo,
    cancel_at = excluded.cancel_at, cancel_memo = excluded.cancel_memo, cancel_train_at = excluded.cancel_train_at,
    cancel_train_memo = excluded.cancel_train_memo, postpone_at = excluded.postpone_at, postpone_memo = excluded.postpone_memo,
    expel_at = excluded.expel_at, expel_memo = excluded.expel_memo, invoiced_at = excluded.invoiced_at, legacy_id = excluded.legacy_id, updated_at = now();

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
