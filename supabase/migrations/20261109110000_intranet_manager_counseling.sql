-- 인트라넷 역할 2단계 C(docs/roles.md, 11/9 레오님 승인 '인트라넷' 표의 상담 기록 = 캠퍼스): 강사 포털 매니저도 맡은 캠퍼스의 상담 기록을 쓴다.
-- 직원은 지금처럼 staff_campuses(맡은 캠퍼스), 매니저는 매니저 역할의 캠퍼스(user_roles manager, 빈칸이면 모든 캠퍼스)다.
-- 처리자 이름은 직원 이름(staff_users.name), 없으면 강사 목록 이름(current_lms_name). 직원의 이름은 그대로다.
-- 20261108100000_student_intranet.sql 의 상담 함수 6개를 같은 내용으로 다시 만들고 범위·이름 조건만 바꿨다. 그 파일을 다시 실행하면 이 파일도 다시 실행한다.
-- 접근 기록 읽기(관리자만, 20261109070000_intranet_roles.sql)는 그대로다. 여러 번 실행해도 된다.

-- ── 상담 기록을 열 수 있는 캠퍼스: 직원(맡은 캠퍼스) 또는 매니저(역할의 캠퍼스)
create or replace function public.counseling_campus_ok(p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.staff_has_campus(p_campus)
      or (not public.is_staff() and exists (
            select 1 from public.user_roles r
             where r.user_id = auth.uid() and r.role = 'manager' and (r.campus = '' or r.campus = p_campus)));
$$;
-- 상담·접근 기록에 남길 이름: 직원 이름, 없으면 강사 목록 이름(매니저)
create or replace function public.counseling_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_name(), public.current_lms_name());
$$;

create or replace function public.counseling_audit(p_action text, n public.counseling_notes)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, actor_name, action, target_id, student_no, campus)
  values (auth.uid(), public.counseling_actor_name(), p_action, n.id::text, n.student_no, n.campus);
$$;

-- 목록: 내용 없이. 맡은 캠퍼스만.
create or replace function public.counseling_list()
returns table (id uuid, student_no text, campus text, counsel_date date, title text, author_name text,
               follow_up_due date, follow_up_done boolean, follow_up_done_at timestamptz, follow_up_done_by text,
               created_at timestamptz, updated_at timestamptz, updated_by text)
language sql stable security definer set search_path = public as $$
  select n.id, n.student_no, n.campus, n.counsel_date, n.title, n.author_name, n.follow_up_due, n.follow_up_done,
         n.follow_up_done_at, n.follow_up_done_by, n.created_at, n.updated_at, n.updated_by
    from public.counseling_notes n
   where public.counseling_campus_ok(n.campus)
   order by n.counsel_date desc, n.created_at desc;
$$;

-- 상세: 내용까지. 열 때마다 '열람'을 남긴다(같은 사람이 10초 안에 다시 열면 한 번으로).
create or replace function public.counseling_open(p_id uuid)
returns setof public.counseling_notes language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id;
  if not found or not public.counseling_campus_ok(n.campus) then raise exception 'not_found'; end if;
  if not exists (select 1 from public.audit_logs a where a.target_id = p_id::text and a.actor_id = auth.uid() and a.action = 'view' and a.at > now() - interval '10 seconds') then
    perform public.counseling_audit('view', n);
  end if;
  return next n;
end $$;

create or replace function public.counseling_create(p_student_no text, p_campus text, p_date date, p_title text, p_content text, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  if not public.counseling_campus_ok(p_campus) then raise exception 'campus_not_allowed'; end if;
  if p_date > public.manila_today() then raise exception 'invalid_date'; end if;
  insert into public.counseling_notes (student_no, campus, counsel_date, title, content, follow_up_due, author_id, author_name, updated_by)
  values (p_student_no, p_campus, p_date, trim(p_title), trim(p_content), p_due, auth.uid(), public.counseling_actor_name(), public.counseling_actor_name())
  returning * into n;
  perform public.counseling_audit('create', n);
  return n.id;
end $$;

-- 수정: 기한을 바꾸면 후속 조치를 다시 연다.
create or replace function public.counseling_update(p_id uuid, p_date date, p_title text, p_content text, p_due date default null)
returns void language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id for update;
  if not found or not public.counseling_campus_ok(n.campus) then raise exception 'not_found'; end if;
  if p_date > public.manila_today() then raise exception 'invalid_date'; end if;
  update public.counseling_notes
     set counsel_date = p_date, title = trim(p_title), content = trim(p_content), follow_up_due = p_due,
         follow_up_done = case when p_due is distinct from n.follow_up_due then false else follow_up_done end,
         follow_up_done_at = case when p_due is distinct from n.follow_up_due then null else follow_up_done_at end,
         follow_up_done_by = case when p_due is distinct from n.follow_up_due then null else follow_up_done_by end,
         updated_at = now(), updated_by = public.counseling_actor_name()
   where id = p_id
  returning * into n;
  perform public.counseling_audit('update', n);
end $$;

create or replace function public.counseling_followup(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare n public.counseling_notes;
begin
  select * into n from public.counseling_notes where id = p_id for update;
  if not found or not public.counseling_campus_ok(n.campus) then raise exception 'not_found'; end if;
  if n.follow_up_due is null then raise exception 'no_followup'; end if;
  if n.follow_up_done = p_done then return; end if;
  update public.counseling_notes
     set follow_up_done = p_done,
         follow_up_done_at = case when p_done then now() else null end,
         follow_up_done_by = case when p_done then public.counseling_actor_name() else null end
   where id = p_id
  returning * into n;
  perform public.counseling_audit(case when p_done then 'followup_done' else 'followup_reopen' end, n);
end $$;

-- ── 함수 실행 권한: 익명은 막고, 로그인한 사용자와 서비스 키만(새 판단 함수 2개. 상담 함수 6개는 다시 만들어도 권한이 남는다)
revoke execute on function public.counseling_campus_ok(text) from public, anon;
grant execute on function public.counseling_campus_ok(text) to authenticated, service_role;
revoke execute on function public.counseling_actor_name() from public, anon;
grant execute on function public.counseling_actor_name() to authenticated, service_role;
revoke execute on function public.counseling_audit(text, public.counseling_notes) from public, anon, authenticated;
