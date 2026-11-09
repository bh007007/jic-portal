-- 내부 공지 대상에 역할(11/10 결정 I14, docs/leo-todo.md): 빈 배열 = 모든 역할, 아니면 관리자·오피스·매니저 중 고른 역할.
-- 역할 대상은 보여 주는 범위다(비밀 범위가 아님). 관리자는 모든 공지를 보고, 오피스·매니저는 대상이 비었거나 자기 역할이 든 공지를
-- 본다(인트라넷 서버 apps/intranet/server/notices.ts). 읽기 권한(RLS)은 그대로다. 표 권한이 표 전체라 새 열도 같이 쓴다. 여러 번 실행해도 된다.
alter table public.internal_notices add column if not exists roles text[] not null default '{}';
alter table public.internal_notices drop constraint if exists internal_notices_roles_check;
alter table public.internal_notices add constraint internal_notices_roles_check check (roles <@ array['admin', 'office', 'manager']::text[]);
