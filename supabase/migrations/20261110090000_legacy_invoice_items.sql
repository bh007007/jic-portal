-- 인보이스 항목(PR #38, 학생 상세 '인보이스 항목' 표, 업체 추출 portal-extract-invoice-items.js). 여러 번 실행해도 된다.
-- 표 3개를 표 하나에 둔다. data._table 이 원래 표 이름이고, id 는 '<표>:<순번>'(업로드할 때마다 통째로 바꾼다).
--   inv_invoice_cost_st: 학생 가격 항목(코스·기숙사·등록비 등, 해외 통화)
--   inv_invoice_cost_ag: 에이전시 공제 항목(커미션·에이전시 등록비·바우처)
--   inv_etc: 현지 비용 청구(tc_*)·납부(td_*), PHP
-- 열은 apps/admin/server/core.ts INVOICE_ITEM_COLUMNS·LOCAL_COST_COLUMNS 만 올린다.
-- 받는 계좌 열이 있는 입금 표(inv_invoice_deposit)는 올리지 않는다.
-- legacy_* 와 같은 방식: 직원만 읽기, 서비스 키만 쓰기.

create table if not exists public.legacy_invoice_items (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_invoice_items enable row level security;
drop policy if exists legacy_invoice_items_staff_read on public.legacy_invoice_items;
create policy legacy_invoice_items_staff_read on public.legacy_invoice_items for select to authenticated using (public.is_staff());
revoke all on public.legacy_invoice_items from anon, authenticated;
grant select on public.legacy_invoice_items to authenticated;
grant select, insert, update, delete on public.legacy_invoice_items to service_role;
create index if not exists legacy_invoice_items_table on public.legacy_invoice_items ((data ->> '_table'));
