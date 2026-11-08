-- 관리자 앱 '방·침대 목록'용 업체 방관리(rooms, 방마다 beds 배열). legacy_* 와 같은 방식: 원본 jsonb, 직원만 읽기, 서비스 키만 쓰기.
create table if not exists public.legacy_rooms (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_rooms enable row level security;
drop policy if exists legacy_rooms_staff_read on public.legacy_rooms;
create policy legacy_rooms_staff_read on public.legacy_rooms for select to authenticated using (public.is_staff());
revoke all on public.legacy_rooms from anon, authenticated;
grant select on public.legacy_rooms to authenticated;
grant select, insert, update, delete on public.legacy_rooms to service_role;
