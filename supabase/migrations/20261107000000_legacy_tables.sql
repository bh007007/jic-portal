-- 업체 포털 추출본을 원본 그대로 담는 legacy_* 테이블.
-- 각 행 = 원본 레코드 1개(data jsonb). 정규화된 테이블은 다음 단계에서 만든다(docs/plan.md 데이터 모델).
-- 쓰기는 서비스 키(업로드 스크립트)만, 읽기는 staff_users 에 등록된 직원만 가능하다.
-- SQL Editor에서 먼저 실행했다가 나중에 supabase db push 로 다시 실행돼도 문제없도록 여러 번 실행 가능하게 쓴다.
-- 프로젝트는 'Automatically expose new tables'를 끄고 만들었으므로 권한(grant)을 여기서 직접 준다.

create table if not exists public.staff_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin',
  name text,
  created_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;
drop policy if exists staff_users_self_read on public.staff_users;
create policy staff_users_self_read on public.staff_users
  for select to authenticated using (user_id = auth.uid());
revoke all on public.staff_users from anon, authenticated;
grant select on public.staff_users to authenticated;
grant select, insert, update, delete on public.staff_users to service_role;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid());
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'legacy_students', 'legacy_enrollments', 'legacy_invoices',
    'legacy_dorm_assignments', 'legacy_agencies', 'legacy_agents', 'legacy_meta'
  ] loop
    execute format(
      'create table if not exists public.%I (id text primary key, data jsonb not null, loaded_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;
