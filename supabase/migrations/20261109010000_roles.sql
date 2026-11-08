-- 역할별 권한표(docs/roles.md, 11/9 레오님 승인) 1단계. 여러 번 실행해도 된다.
-- 1) 직원을 관리자·오피스로 나눈다: user_roles 에 'office' 만 있으면 오피스, 아니면 관리자.
--    역할을 주기 전에는 지금 직원(staff_users)이 모두 관리자로 남는다(레오님 계정이 갑자기 막히지 않게).
-- 2) 강사 포털: 관리(시험 종류·강사 목록·출석 마감·사유 인정)는 매니저·관리자, 성적 입력·자료 등록은 강사·매니저·관리자.
--    체커·스케줄러·오피스는 읽기만('정할 것' 6: 체커는 성적을 넣지 않는다). 출석 입력·수업 만들기는 is_lms_manager 를 쓰므로 그대로 따라온다.
-- 3) 역할 주기(user_roles 쓰기)는 관리자만. 계정 목록(user_directory)은 20261109020000_user_directory_admin.sql.
-- 4) 강사 포털 내부 공지 보기('정할 것' 5): 인트라넷 표 권한은 건드리지 않고 게시 중인 공지만 함수로 준다.
-- 인트라넷 칸(패널티 점수표·접근 기록·매니저의 인트라넷)은 인트라넷 담당이 맡는다(docs/roles.md '적용 계획' 5).

-- ── 관리자: 직원이면서 admin 역할이 있거나 office 역할이 없는 사람
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() and (public.has_role(array['admin']) or not public.has_role(array['office']));
$$;

-- 강사 포털 관리: 매니저 또는 관리자(20261108200000_teacher_portal.sql 의 '직원 또는 매니저'에서 오피스를 뺐다)
create or replace function public.is_lms_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['manager']) or public.is_admin();
$$;

-- 성적 입력·자료 등록: 강사·매니저·관리자
create or replace function public.is_lms_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['teacher', 'manager']) or public.is_admin();
$$;

-- ── 성적: 입력·고치기·지우기는 강사·매니저·관리자(고치기·지우기는 쓴 사람이나 매니저·관리자). 읽기는 그대로(강사 포털 사용자, 학생 본인).
drop policy if exists test_results_insert on public.test_results;
create policy test_results_insert on public.test_results for insert to authenticated
  with check (public.is_lms_writer() and public.enrollment_of_student(enrollment_id, student_no));
drop policy if exists test_results_update on public.test_results;
create policy test_results_update on public.test_results for update to authenticated
  using (public.is_lms_writer() and (teacher_id = auth.uid() or public.is_lms_manager()))
  with check (public.is_lms_writer());
drop policy if exists test_results_delete on public.test_results;
create policy test_results_delete on public.test_results for delete to authenticated
  using (public.is_lms_writer() and (teacher_id = auth.uid() or public.is_lms_manager()));

-- ── 수업 자료: 등록은 강사·매니저·관리자, 고치기·지우기는 올린 사람이나 매니저·관리자. 읽기는 그대로.
drop policy if exists materials_insert on public.materials;
create policy materials_insert on public.materials for insert to authenticated with check (public.is_lms_writer());
drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials for update to authenticated
  using (public.is_lms_writer() and (created_by = auth.uid() or public.is_lms_manager())) with check (public.is_lms_writer());
drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials for delete to authenticated
  using (public.is_lms_writer() and (created_by = auth.uid() or public.is_lms_manager()));

-- ── 역할 주기·회수: 관리자만(읽기는 그대로: 본인과 직원)
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for insert to authenticated with check (public.is_admin());
drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated using (public.is_admin());

-- ── 강사 포털 내부 공지: 게시 중(종료일이 없거나 오늘 이후)이고 전체 공지이거나 내 캠퍼스 공지.
-- 내 캠퍼스는 역할(user_roles.campus, 빈칸이면 모든 캠퍼스)이나 강사 목록(staff.campus, 같은 캠퍼스만). 직원은 모두 본다.
create or replace function public.lms_notices()
returns table (id uuid, title text, content text, campus text, pinned boolean, until_date date, author_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.content, n.campus, n.pinned, n.until_date, n.author_name, n.created_at
    from public.internal_notices n
   where public.is_lms_user()
     and (n.until_date is null or n.until_date >= public.manila_today())
     and (n.campus = ''
          or public.is_staff()
          or exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.campus in ('', n.campus))
          or exists (select 1 from public.staff s where s.user_id = auth.uid() and s.campus = n.campus))
   order by n.pinned desc, n.created_at desc
   limit 100;
$$;

-- ── 함수 실행 권한: 익명은 막고, 로그인한 사용자와 서비스 키만(출석 판단 함수도 같이)
do $$
declare f text;
begin
  foreach f in array array['is_admin()', 'is_lms_manager()', 'is_lms_writer()', 'lms_notices()',
                           'teaches_session(uuid)', 'can_mark_attendance(uuid)', 'attendance_closed(date, text)', 'can_schedule()'] loop
    continue when to_regprocedure('public.' || f) is null; -- 출석 마이그레이션 전이면 건너뛴다
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$$;
