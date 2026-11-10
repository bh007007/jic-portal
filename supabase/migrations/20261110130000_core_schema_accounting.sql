-- 정규화 스키마 3단계: 회계 이력(학생별 회계 이력은 옮기기로 결정, HANDOFF 7장)과 기숙사 배정. 여러 번 실행해도 된다.
-- 1단계(20261110110000)·보강(20261110120000)과 같이 적용은 학원 계정 새 프로젝트에서(11/10 결정). 개인 계정 운영 DB에는 적용하지 않는다.
-- 열은 관리자 core 가 실제로 읽는 것만 둔다(11/10 core 를 돌려 읽는 열을 모아 확인, docs/schema.md). 받는 계좌 열(bk_*, *_acct_*)은 두지 않는다.
-- 채우기는 load_accounting_from_legacy()(서비스 키만): legacy_* → 이 표들. 다시 돌려도 같은 결과(upsert). 업체 번호(또는 legacy 행 id)를 키로 둔다.
-- 권한: 직원(is_staff())만 읽는다. 쓰기는 서비스 키뿐.

-- 연장 금액(연장 인보이스: 학생 가격 − 에이전시 공제, 연수 통화)과 입금. core 연장 입력을 정규화 표에서 만들 수 있게.
alter table public.enrollment_extensions add column if not exists price numeric(14, 2);
alter table public.enrollment_extensions add column if not exists paid numeric(14, 2);
alter table public.enrollment_extensions add column if not exists currency text not null default '';

-- 인보이스(업체 인보이스 목록, 연수당 하나). total 은 '가장 최근 인보이스 하나'의 금액이다(연장한 연수는 invoice_parts 합을 쓴다).
create table if not exists public.invoices (
  enrollment_id text primary key references public.enrollments (id) on delete cascade,
  currency text not null default '',
  total numeric(14, 2),          -- sum_ic_price 해외 총액
  paid numeric(14, 2),           -- sum_id_amount 입금 매칭
  local_total numeric(14, 2),    -- sum_tc_price 현지 청구(PHP)
  local_paid numeric(14, 2),     -- sum_td_amount 현지 납부(PHP)
  legacy_id text unique,
  updated_at timestamptz not null default now()
);

-- 인보이스별 합계(기본 1건 + 연장 건, 업체 inv_summary). id = '<연수>-<tt_id>', tt_id 0 = 기본.
create table if not exists public.invoice_parts (
  id text primary key,
  enrollment_id text not null references public.enrollments (id) on delete cascade,
  part_no text not null default '',            -- tt_id
  registered_at timestamptz,                   -- tt_insert_dt(연장 등록 시각, 기본은 비어 있음)
  weeks integer,
  start_date date,
  finish_date date,
  total numeric(14, 2),
  paid numeric(14, 2),
  local_total numeric(14, 2),
  local_paid numeric(14, 2),
  legacy_id text unique,
  updated_at timestamptz not null default now()
);
create index if not exists invoice_parts_enrollment on public.invoice_parts (enrollment_id);

-- 업체 Check Balance(연수별 청구·납부 합계, 연장 횟수). 업체가 계산한 값 그대로.
create table if not exists public.vendor_balances (
  enrollment_id text primary key references public.enrollments (id) on delete cascade,
  cost numeric(14, 2),
  payment numeric(14, 2),
  extend_count integer,
  legacy_id text unique,
  updated_at timestamptz not null default now()
);

-- 인보이스 항목: 학생 가격(student)·에이전시 공제(agency). 업체 inv_invoice_cost_st·_ag. id = legacy_invoice_items 행 id.
create table if not exists public.invoice_lines (
  id text primary key,
  enrollment_id text not null references public.enrollments (id) on delete cascade,
  side text not null check (side in ('student', 'agency')),
  version integer,                -- ic_ver(연수마다 최신 판만 쓴다)
  item_type text not null default '',
  item_name text not null default '',
  currency text not null default '',
  price numeric(14, 2),
  weeks integer,
  start_date date,
  end_date date,
  course_name text not null default '',
  dorm_name text not null default '',
  in_use boolean not null default true,     -- ic_use_yn ≠ N
  canceled boolean not null default false,  -- ic_cancel_yn = Y
  legacy_id text unique,
  updated_at timestamptz not null default now()
);
create index if not exists invoice_lines_enrollment on public.invoice_lines (enrollment_id);

-- 현지 비용 청구(tc_*)·납부(td_*), PHP. 업체 inv_etc. 청구 하나에 납부가 여러 줄일 수 있다.
create table if not exists public.local_charges (
  id text primary key,
  enrollment_id text not null references public.enrollments (id) on delete cascade,
  charge_no text not null default '',       -- tc_id
  charge_type text not null default '',     -- ec_type
  charge_name text not null default '',     -- tc_type_name
  currency text not null default '',
  price numeric(14, 2),
  rest_amount numeric(14, 2),
  payment_no text not null default '',      -- td_id
  payment_currency text not null default '',
  payment_amount numeric(14, 2),
  paid_at timestamptz,                      -- td_deposit_dt
  legacy_id text unique,
  updated_at timestamptz not null default now()
);
create index if not exists local_charges_enrollment on public.local_charges (enrollment_id);

-- 입금 원장(업체 입금액 매칭). 받는 계좌 열은 두지 않는다.
create table if not exists public.deposits (
  id text primary key,                      -- dp_id
  deposited_at timestamptz,
  payer_name text not null default '',
  memo text not null default '',
  currency text not null default '',
  amount numeric(14, 2),
  fee numeric(14, 2),
  amount_total numeric(14, 2),
  confirmed boolean not null default false, -- dp_confirm_yn
  in_use boolean not null default true,     -- dp_use_yn ≠ N
  matched_count integer,                    -- cnt
  matched_amount numeric(14, 2),            -- sum_id_amount
  matched_currency text not null default '',
  matched_agency text not null default '',  -- match_ag_name
  balance numeric(14, 2),
  legacy_id text unique,
  updated_at timestamptz not null default now()
);

-- 포인트 원장(D 충전, U 사용, 1포인트 = 1페소). id = legacy_point_history 행 id.
create table if not exists public.point_ledger (
  id text primary key,
  enrollment_id text not null references public.enrollments (id) on delete cascade,
  kind text not null default '',            -- type D·U
  at timestamptz,
  points numeric(14, 2),
  item_name text not null default '',       -- ec_name(사용 항목)
  staff_name text not null default '',      -- nickname(입력한 직원)
  memo text not null default '',
  legacy_id text unique,
  updated_at timestamptz not null default now()
);
create index if not exists point_ledger_enrollment on public.point_ledger (enrollment_id, at);

-- 기숙사 배정(연수당 대표 한 줄, 업체 dorm_assignments).
create table if not exists public.enrollment_dorms (
  enrollment_id text primary key references public.enrollments (id) on delete cascade,
  dorm_name text not null default '',
  dorm_short text not null default '',
  dorm_type text not null default '',       -- NONROOM = 기숙사 밖
  campus_name text not null default '',
  campus_code text not null default '',
  start_date date,
  end_date date,
  weeks integer,
  canceled boolean not null default false,
  legacy_id text unique,
  updated_at timestamptz not null default now()
);

-- 숫자 바꾸기(빈 값·잘못된 값은 null)
create or replace function public.legacy_num(v text) returns numeric language plpgsql immutable as $$
begin
  if v is null or v !~ '^\s*-?\d+(\.\d+)?\s*$' then return null; end if;
  return trim(v)::numeric;
exception when others then
  return null;
end
$$;

create or replace function public.load_accounting_from_legacy()
returns table (tbl text, row_count integer)
language plpgsql security definer set search_path = public as $$
begin
  -- 연수(1단계)가 먼저 있어야 한다. 연수에 없는 행은 건너뛴다.
  if to_regclass('public.legacy_extensions') is not null then
    update public.enrollment_extensions x set price = public.legacy_num(l.data->>'sum_price'), paid = public.legacy_num(l.data->>'sum_amount'),
      currency = coalesce(l.data->>'tr_currency', ''), updated_at = now()
    from public.legacy_extensions l where l.data->>'tt_id' = x.id;
  end if;

  insert into public.invoices as i (enrollment_id, currency, total, paid, local_total, local_paid, legacy_id)
  select d->>'tr_id', coalesce(d->>'tr_currency', ''), public.legacy_num(d->>'sum_ic_price'), public.legacy_num(d->>'sum_id_amount'),
         public.legacy_num(d->>'sum_tc_price'), public.legacy_num(d->>'sum_td_amount'), d->>'tr_id'
  from (select data as d from public.legacy_invoices) l
  where exists (select 1 from public.enrollments e where e.id = d->>'tr_id')
  on conflict (enrollment_id) do update set currency = excluded.currency, total = excluded.total, paid = excluded.paid,
    local_total = excluded.local_total, local_paid = excluded.local_paid, legacy_id = excluded.legacy_id, updated_at = now();

  if to_regclass('public.legacy_invoice_summary') is not null then
    insert into public.invoice_parts as p (id, enrollment_id, part_no, registered_at, weeks, start_date, finish_date, total, paid, local_total, local_paid, legacy_id)
    select l.id, d->>'_tr_id', coalesce(d->>'tt_id', ''), public.legacy_ts(d->>'tt_insert_dt'), public.legacy_int(d->>'week'),
           public.legacy_date(d->>'start_date'), public.legacy_date(d->>'finish_date'), public.legacy_num(d->>'sum_ic_price'), public.legacy_num(d->>'sum_id_amount'),
           public.legacy_num(d->>'sum_tc_price'), public.legacy_num(d->>'sum_td_amount'), l.id
    from (select id, data as d from public.legacy_invoice_summary) l
    where exists (select 1 from public.enrollments e where e.id = d->>'_tr_id')
    on conflict (id) do update set enrollment_id = excluded.enrollment_id, part_no = excluded.part_no, registered_at = excluded.registered_at,
      weeks = excluded.weeks, start_date = excluded.start_date, finish_date = excluded.finish_date, total = excluded.total, paid = excluded.paid,
      local_total = excluded.local_total, local_paid = excluded.local_paid, legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  if to_regclass('public.legacy_balances') is not null then
    insert into public.vendor_balances as b (enrollment_id, cost, payment, extend_count, legacy_id)
    select d->>'tr_id', public.legacy_num(d->>'cost'), public.legacy_num(d->>'payment'), public.legacy_int(d->>'extend_count'), d->>'tr_id'
    from (select data as d from public.legacy_balances) l
    where exists (select 1 from public.enrollments e where e.id = d->>'tr_id')
    on conflict (enrollment_id) do update set cost = excluded.cost, payment = excluded.payment, extend_count = excluded.extend_count,
      legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  if to_regclass('public.legacy_invoice_items') is not null then
    insert into public.invoice_lines as x (id, enrollment_id, side, version, item_type, item_name, currency, price, weeks, start_date, end_date,
      course_name, dorm_name, in_use, canceled, legacy_id)
    select l.id, d->>'_tr_id', case when d->>'_table' = 'inv_invoice_cost_ag' then 'agency' else 'student' end, public.legacy_int(d->>'ic_ver'),
           coalesce(d->>'ic_type', ''), coalesce(d->>'ic_type_name', ''), coalesce(d->>'ic_currency', ''), public.legacy_num(d->>'ic_price'),
           public.legacy_int(d->>'ic_week'), public.legacy_date(d->>'ic_departure_date'), public.legacy_date(d->>'ic_return_date'),
           coalesce(d->>'co_name', ''), coalesce(d->>'do_name', ''), upper(coalesce(d->>'ic_use_yn', '')) <> 'N', upper(coalesce(d->>'ic_cancel_yn', '')) = 'Y', l.id
    from (select id, data as d from public.legacy_invoice_items) l
    where d->>'_table' in ('inv_invoice_cost_st', 'inv_invoice_cost_ag') and exists (select 1 from public.enrollments e where e.id = d->>'_tr_id')
    on conflict (id) do update set enrollment_id = excluded.enrollment_id, side = excluded.side, version = excluded.version, item_type = excluded.item_type,
      item_name = excluded.item_name, currency = excluded.currency, price = excluded.price, weeks = excluded.weeks, start_date = excluded.start_date,
      end_date = excluded.end_date, course_name = excluded.course_name, dorm_name = excluded.dorm_name, in_use = excluded.in_use,
      canceled = excluded.canceled, legacy_id = excluded.legacy_id, updated_at = now();

    insert into public.local_charges as c (id, enrollment_id, charge_no, charge_type, charge_name, currency, price, rest_amount,
      payment_no, payment_currency, payment_amount, paid_at, legacy_id)
    select l.id, d->>'_tr_id', coalesce(d->>'tc_id', ''), coalesce(d->>'ec_type', ''), coalesce(d->>'tc_type_name', ''), coalesce(d->>'tc_currency', ''),
           public.legacy_num(d->>'tc_price'), public.legacy_num(d->>'rest_amount'), coalesce(d->>'td_id', ''), coalesce(d->>'td_currency', ''),
           public.legacy_num(d->>'td_amount'), public.legacy_ts(d->>'td_deposit_dt'), l.id
    from (select id, data as d from public.legacy_invoice_items) l
    where d->>'_table' = 'inv_etc' and exists (select 1 from public.enrollments e where e.id = d->>'_tr_id')
    on conflict (id) do update set enrollment_id = excluded.enrollment_id, charge_no = excluded.charge_no, charge_type = excluded.charge_type,
      charge_name = excluded.charge_name, currency = excluded.currency, price = excluded.price, rest_amount = excluded.rest_amount,
      payment_no = excluded.payment_no, payment_currency = excluded.payment_currency, payment_amount = excluded.payment_amount,
      paid_at = excluded.paid_at, legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  if to_regclass('public.legacy_deposits') is not null then
    insert into public.deposits as dp (id, deposited_at, payer_name, memo, currency, amount, fee, amount_total, confirmed, in_use,
      matched_count, matched_amount, matched_currency, matched_agency, balance, legacy_id)
    select d->>'dp_id', public.legacy_ts(d->>'dp_deposit_dt'), coalesce(d->>'dp_name', ''), coalesce(d->>'dp_memo', ''), coalesce(d->>'dp_currency', ''),
           public.legacy_num(d->>'dp_amount'), public.legacy_num(d->>'dp_fee'), public.legacy_num(d->>'dp_amount_total'),
           upper(coalesce(d->>'dp_confirm_yn', '')) = 'Y', upper(coalesce(d->>'dp_use_yn', '')) <> 'N',
           public.legacy_int(d->>'cnt'), public.legacy_num(d->>'sum_id_amount'), coalesce(d->>'id_currency', ''), coalesce(d->>'match_ag_name', ''),
           public.legacy_num(d->>'balance'), d->>'dp_id'
    from (select data as d from public.legacy_deposits) l
    where coalesce(d->>'dp_id', '') <> ''
    on conflict (id) do update set deposited_at = excluded.deposited_at, payer_name = excluded.payer_name, memo = excluded.memo,
      currency = excluded.currency, amount = excluded.amount, fee = excluded.fee, amount_total = excluded.amount_total, confirmed = excluded.confirmed,
      in_use = excluded.in_use, matched_count = excluded.matched_count, matched_amount = excluded.matched_amount,
      matched_currency = excluded.matched_currency, matched_agency = excluded.matched_agency, balance = excluded.balance,
      legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  if to_regclass('public.legacy_point_history') is not null then
    insert into public.point_ledger as pl (id, enrollment_id, kind, at, points, item_name, staff_name, memo, legacy_id)
    select l.id, d->>'tr_id', upper(coalesce(d->>'type', '')), public.legacy_ts(d->>'dt'), public.legacy_num(d->>'point'),
           coalesce(d->>'ec_name', ''), coalesce(d->>'nickname', ''), coalesce(d->>'memo', ''), l.id
    from (select id, data as d from public.legacy_point_history) l
    where exists (select 1 from public.enrollments e where e.id = d->>'tr_id')
    on conflict (id) do update set enrollment_id = excluded.enrollment_id, kind = excluded.kind, at = excluded.at, points = excluded.points,
      item_name = excluded.item_name, staff_name = excluded.staff_name, memo = excluded.memo, legacy_id = excluded.legacy_id, updated_at = now();
  end if;

  insert into public.enrollment_dorms as ed (enrollment_id, dorm_name, dorm_short, dorm_type, campus_name, campus_code, start_date, end_date, weeks, canceled, legacy_id)
  select d->>'tr_id', coalesce(d->>'do_name', ''), coalesce(d->>'do_name_short', ''), coalesce(d->>'do_type', ''), coalesce(d->>'ca_name', ''),
         coalesce(d->>'ca_code', ''), public.legacy_date(d->>'ic_departure_date'), public.legacy_date(d->>'ic_return_date'),
         public.legacy_int(d->>'ic_week'), upper(coalesce(d->>'ic_cancel_yn', '')) = 'Y', d->>'tr_id'
  from (select data as d from public.legacy_dorm_assignments) l
  where exists (select 1 from public.enrollments e where e.id = d->>'tr_id')
  on conflict (enrollment_id) do update set dorm_name = excluded.dorm_name, dorm_short = excluded.dorm_short, dorm_type = excluded.dorm_type,
    campus_name = excluded.campus_name, campus_code = excluded.campus_code, start_date = excluded.start_date, end_date = excluded.end_date,
    weeks = excluded.weeks, canceled = excluded.canceled, legacy_id = excluded.legacy_id, updated_at = now();

  return query
    select 'invoices'::text, count(*)::integer from public.invoices
    union all select 'invoice_parts', count(*)::integer from public.invoice_parts
    union all select 'vendor_balances', count(*)::integer from public.vendor_balances
    union all select 'invoice_lines', count(*)::integer from public.invoice_lines
    union all select 'local_charges', count(*)::integer from public.local_charges
    union all select 'deposits', count(*)::integer from public.deposits
    union all select 'point_ledger', count(*)::integer from public.point_ledger
    union all select 'enrollment_dorms', count(*)::integer from public.enrollment_dorms;
end
$$;
revoke execute on function public.load_accounting_from_legacy() from public, anon, authenticated;
grant execute on function public.load_accounting_from_legacy() to service_role;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_parts', 'vendor_balances', 'invoice_lines', 'local_charges', 'deposits', 'point_ledger', 'enrollment_dorms'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
  end loop;
end
$$;
