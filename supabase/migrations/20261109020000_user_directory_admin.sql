-- 관리자 포털 '사용자·권한' 계정 목록을 관리자만 받게 한다(docs/roles.md: 사용자·권한은 관리자만, 오피스는 열 수 없다). 여러 번 실행해도 된다.
-- 20261108210000_user_directory.sql 과 같은 함수이고 조건만 is_staff() → is_admin()(20261109010000_roles.sql)으로 바꿨다.
-- 에이전시 표(agency_members)를 읽으므로 파트너 포털 마이그레이션 뒤에 실행한다(로컬 시험 서버 pg-supabase.mjs 는 이 파일을 올리지 않는다).

create or replace function public.user_directory(p_students boolean default false)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  staff_name text,      -- staff_users.name (관리자 포털 직원)
  staff_role text,      -- staff_users.role
  roles text[],         -- user_roles (강사 포털 역할, 캠퍼스가 있으면 '역할:캠퍼스')
  teacher_name text,    -- staff(강사 목록)에 이어진 이름
  agency text,          -- agency_members (에이전시 지점)
  guard_campus text,    -- guard_accounts (가드 공용 계정)
  student_no text       -- student_users
)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         su.name, su.role,
         coalesce((select array_agg(r.role || case when r.campus <> '' then ':' || r.campus else '' end order by r.role, r.campus)
                     from public.user_roles r where r.user_id = u.id), '{}'),
         (select s.name from public.staff s where s.user_id = u.id),
         (select am.agency_name || coalesce(' · ' || nullif(am.branch, ''), '') from public.agency_members am where am.user_id = u.id),
         (select g.campus from public.guard_accounts g where g.user_id = u.id),
         (select st.student_no from public.student_users st where st.user_id = u.id)
    from auth.users u
    left join public.staff_users su on su.user_id = u.id
   where public.is_admin()
     and (p_students or not exists (select 1 from public.student_users st where st.user_id = u.id))
   order by (su.user_id is null), u.email;
$$;

revoke execute on function public.user_directory(boolean) from public, anon;
grant execute on function public.user_directory(boolean) to authenticated, service_role;
