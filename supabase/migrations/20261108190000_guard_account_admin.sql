-- 가드 계정 관리(인트라넷 '가드 계정'): 직원이 출입구 가드 공용 계정을 만들고, 비밀번호를 바꾸고, 지운다.
-- 계정 작업은 서버(Pages Function)가 서비스 키로 Supabase Auth Admin API 와 guard_accounts 를 쓴다(apps/intranet/server/guardAccounts.ts).
-- 여기서는 그 작업을 접근 기록(audit_logs)에 남기는 함수만 더한다. 처리자는 로그인한 직원. 여러 번 실행해도 된다.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in ('view', 'create', 'update', 'followup_done', 'followup_reopen', 'account_create', 'password_reset', 'guard_create', 'guard_password', 'guard_delete'));

-- target_id = 출입구 이름, student_no 는 비워 둔다(학생 기록이 아님). campus = 그 출입구의 캠퍼스(맡은 캠퍼스 직원이 읽음).
create or replace function public.guard_account_audit(p_action text, p_label text, p_campus text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if p_action not in ('guard_create', 'guard_password', 'guard_delete') then raise exception 'invalid_action'; end if;
  if char_length(coalesce(trim(p_label), '')) not between 1 and 40 then raise exception 'invalid_label'; end if;
  insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus)
  values (auth.uid(), public.current_staff_name(), p_action, 'guard_account', trim(p_label), '', coalesce(p_campus, ''));
end $$;
revoke execute on function public.guard_account_audit(text, text, text) from public, anon;
grant execute on function public.guard_account_audit(text, text, text) to authenticated, service_role;
