-- 가격표(PR #63, 관리자 기초관리 '가격표', 업체 추출 portal-extract-prices.js). 여러 번 실행해도 된다.
-- 표 8개(price_course·price_dorm·price_setting·promo·course_code·dorm_code·price_etc·comm_rule)를 표 하나에 둔다.
-- data._table 이 원래 표 이름이고, id 는 '<표>:<순번>'(업로드할 때마다 통째로 바꾼다). 열은 core.ts PRICE_COLUMNS 만 올린다.
-- legacy_* 와 같은 방식: 직원만 읽기, 서비스 키만 쓰기. 커미션 규칙(comm_rule)에 에이전시별 비율이 있어 공개하지 않는다.
-- 파트너 포털 견적 미리 채우기에 쓸 때는 공개할 열만 고른 함수를 따로 만든다(결정 대기).

create table if not exists public.legacy_prices (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_prices enable row level security;
drop policy if exists legacy_prices_staff_read on public.legacy_prices;
create policy legacy_prices_staff_read on public.legacy_prices for select to authenticated using (public.is_staff());
revoke all on public.legacy_prices from anon, authenticated;
grant select on public.legacy_prices to authenticated;
grant select, insert, update, delete on public.legacy_prices to service_role;
create index if not exists legacy_prices_table on public.legacy_prices ((data ->> '_table'));
