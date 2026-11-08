-- 외박·여행 신청: 업체 'Outing > Travel'(기획안 'Travel → 여행 신청과 외박 허용')에 맞춰 외박 신청에 여행 정보를 더한다.
-- 행선지·숙소·비상 연락처·같이 가는 학생. 규칙(행선지·연락처 필수, 동행 10명까지)은 apps/student/server/requests.ts 가 확인하고,
-- 그전 기록은 빈 값으로 둔다. 학생이 넣을 수 있는 열에 새 열을 더한다. 여러 번 실행해도 된다.
-- 20261108100000 을 다시 실행하면 권한을 초기화하므로 이 파일도 이어서 다시 실행한다.
alter table public.overnight_permissions add column if not exists destination text not null default '' check (char_length(destination) <= 100);
alter table public.overnight_permissions add column if not exists accommodation text not null default '' check (char_length(accommodation) <= 100);
alter table public.overnight_permissions add column if not exists contact text not null default '' check (char_length(contact) <= 30);
alter table public.overnight_permissions add column if not exists companions text[] not null default '{}' check (cardinality(companions) <= 10);

grant insert (destination, accommodation, contact, companions) on public.overnight_permissions to authenticated;
