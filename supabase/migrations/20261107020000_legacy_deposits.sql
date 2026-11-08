-- 관리자 앱 '입금 매칭' 화면용 입금 원장(업체 dp_). legacy_* 와 같은 방식: 원본 jsonb, 직원만 읽기, 서비스 키만 쓰기.
create table if not exists public.legacy_deposits (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_deposits enable row level security;
drop policy if exists legacy_deposits_staff_read on public.legacy_deposits;
create policy legacy_deposits_staff_read on public.legacy_deposits for select to authenticated using (public.is_staff());
revoke all on public.legacy_deposits from anon, authenticated;
grant select on public.legacy_deposits to authenticated;
grant select, insert, update, delete on public.legacy_deposits to service_role;
