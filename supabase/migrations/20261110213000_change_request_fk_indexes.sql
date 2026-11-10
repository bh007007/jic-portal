-- Supabase 성능 진단 'Unindexed foreign keys'(11/10): 관리자 앱 변경 요청 표(20261110100000_change_requests.sql)의 처리한 사람 열에 인덱스.
-- 사용자를 지울 때 이 표를 훑지 않게 한다. 20261110143500_perf_policies_indexes.sql 과 같은 방식. 여러 번 실행해도 된다.
create index if not exists change_requests_created_by on public.change_requests (created_by);
create index if not exists change_requests_updated_by on public.change_requests (updated_by);
create index if not exists change_requests_decided_by on public.change_requests (decided_by);
create index if not exists change_request_log_actor on public.change_request_log (actor);
