-- 인트라넷 결정 반영(docs/leo-todo.md, 11/9 레오님 결정):
--   I4 가드 계정(만들기·비밀번호·지우기)은 관리자만. 학생 계정은 지금처럼 직원(관리자·오피스) 모두.
--   I5 강사 포털 매니저의 무단결석 승인·반려는 맡은 캠퍼스(user_roles manager 의 campus, 빈칸이면 모든 캠퍼스)만.
-- 인트라넷 서버(apps/intranet/server/core.ts)가 같은 범위로 먼저 막고, 여기서 DB 도 같은 범위만 허용한다.
-- 매니저의 무단결석 후보 넣기·지우기(화면을 열 때의 정리)는 캠퍼스를 가리지 않는다(대기 건만, 20261109100000_intranet_manager.sql 그대로).
-- 20261108190000_guard_account_admin.sql 또는 20261109100000_intranet_manager.sql 을 다시 실행하면 이 파일도 다시 실행한다. 여러 번 실행해도 된다.

-- ── 매니저가 그 캠퍼스를 맡았는지(역할의 캠퍼스가 빈칸이면 모든 캠퍼스)
create or replace function public.intranet_manager_campus_ok(p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role = 'manager' and (r.campus = '' or r.campus = p_campus));
$$;
revoke execute on function public.intranet_manager_campus_ok(text) from public, anon;
grant execute on function public.intranet_manager_campus_ok(text) to authenticated, service_role;

-- ── I5: 매니저의 패널티 승인·반려는 무단결석이면서 맡은 캠퍼스만(읽기는 그대로 모두)
drop policy if exists penalties_manager_decide on public.penalties;
create policy penalties_manager_decide on public.penalties for update to authenticated
  using (public.is_intranet_manager() and kind = 'absence' and public.intranet_manager_campus_ok(campus))
  with check (public.is_intranet_manager() and kind = 'absence' and public.intranet_manager_campus_ok(campus));

-- ── I4: 가드 계정 작업 기록은 관리자만 남긴다(20261108190000_guard_account_admin.sql 의 같은 함수에서 is_staff → is_admin 만 바꿨다)
create or replace function public.guard_account_audit(p_action text, p_label text, p_campus text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_action not in ('guard_create', 'guard_password', 'guard_delete') then raise exception 'invalid_action'; end if;
  if char_length(coalesce(trim(p_label), '')) not between 1 and 40 then raise exception 'invalid_label'; end if;
  insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus)
  values (auth.uid(), public.current_staff_name(), p_action, 'guard_account', trim(p_label), '', coalesce(p_campus, ''));
end $$;
revoke execute on function public.guard_account_audit(text, text, text) from public, anon;
grant execute on function public.guard_account_audit(text, text, text) to authenticated, service_role;
