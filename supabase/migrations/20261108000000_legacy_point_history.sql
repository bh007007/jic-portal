-- 관리자 앱 포인트 잔액·내역용 업체 포인트 원장(point_history). legacy_* 와 같은 방식: 원본 jsonb, 직원만 읽기, 서비스 키만 쓰기.
-- 업로드 스크립트는 화면에 쓰는 열(tr_id, type, dt, point, php, ec_name, nickname, memo, campus)만 올린다.
create table if not exists public.legacy_point_history (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_point_history enable row level security;
drop policy if exists legacy_point_history_staff_read on public.legacy_point_history;
create policy legacy_point_history_staff_read on public.legacy_point_history for select to authenticated using (public.is_staff());
revoke all on public.legacy_point_history from anon, authenticated;
grant select on public.legacy_point_history to authenticated;
grant select, insert, update, delete on public.legacy_point_history to service_role;
