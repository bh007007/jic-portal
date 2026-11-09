-- 연수 청구 합계용 업체 원본(PR #51, 회계: 청구 합계 = 기본 + 연장 인보이스). 여러 번 실행해도 된다.
-- legacy_* 와 같은 방식: 원본 jsonb, 직원만 읽기, 서비스 키만 쓰기. 업로드 스크립트는 화면에 쓰는 열만 올린다
-- (apps/admin/server/core.ts INVOICE_SUMMARY_COLUMNS·BALANCE_COLUMNS).
--   legacy_invoice_summary: 인보이스별 합계(inv_summary, portal-extract-invoice-items.js). 한 연수에 기본 1건 + 연장 건. id = _tr_id-tt_id
--   legacy_balances: 업체 Check Balance(balance_load, portal-extract-balance.js)의 연수별 청구(cost)·납부(payment). id = tr_id
-- 연장한 연수의 legacy_invoices.sum_ic_price 는 가장 최근 인보이스 하나의 금액이라, 두 표가 있으면 core 가 이것으로 청구·미입금을 계산한다.

create table if not exists public.legacy_invoice_summary (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
create table if not exists public.legacy_balances (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());

do $$
declare t text;
begin
  foreach t in array array['legacy_invoice_summary', 'legacy_balances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;
