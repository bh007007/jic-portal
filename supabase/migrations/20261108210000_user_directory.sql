-- 관리자 포털 '사용자·권한' 화면용 계정 목록(직원만). 여러 번 실행해도 된다.
-- 로그인 계정(auth.users)과 사용자 종류별 표(staff_users·user_roles·staff·agency_members·guard_accounts·student_users)를 한 줄로 모아 보여 준다.
-- 역할 부여·회수는 user_roles RLS(직원만 쓰기, 20261108200000_teacher_portal.sql)로 화면이 바로 한다. 계정 만들기는 서비스 키(서버)만.
-- 학생 계정은 수가 많고 학생번호@students.jic.internal 이라 기본으로 빼고, p_students = true 일 때만 넣는다.

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
   where public.is_staff()
     and (p_students or not exists (select 1 from public.student_users st where st.user_id = u.id))
   order by (su.user_id is null), u.email;
$$;

revoke execute on function public.user_directory(boolean) from public, anon;
grant execute on function public.user_directory(boolean) to authenticated, service_role;
