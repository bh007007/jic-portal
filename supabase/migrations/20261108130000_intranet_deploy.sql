-- 인트라넷 배포 서버(apps/intranet/worker)용 보충. 여러 번 실행해도 된다.
-- 20261108100000_student_intranet.sql 을 다시 실행하면 권한을 초기화하므로 이 파일도 이어서 다시 실행한다.

-- 처리자 이름: 승인·반려·배차의 처리자는 사용자 id(decided_by)로 남는다. 직원 화면에 이름을 보이려고
-- 직원끼리는 직원 이름 목록을 읽게 한다(staff_users 는 본인 행만 읽히고, 이 RLS 는 바꾸지 않는다).
create or replace function public.staff_directory()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, coalesce(nullif(s.name, ''), s.user_id::text) from public.staff_users s where public.is_staff();
$$;
revoke execute on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated, service_role;

-- 가드 태블릿: 외출 기록과 가드 리포트의 번호(id)를 서버가 정해 넣는다(귀가를 같은 번호로 찍고, 리포트 번호로 패널티 후보를 만든다).
grant insert (id) on public.outings to authenticated;
grant insert (id) on public.incident_reports to authenticated;
