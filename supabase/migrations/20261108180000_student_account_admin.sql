-- 학생 계정 관리(인트라넷 '학생 계정'): 직원이 학생 앱 계정을 만들고 비밀번호를 생년월일로 되돌린다.
-- 계정 작업은 서버(Pages Function)가 서비스 키로 Supabase Auth Admin API 를 부른다(apps/student/server/accountAdmin.ts).
-- 여기서는 그 작업을 접근 기록(audit_logs)에 남기는 함수만 더한다. 처리자는 로그인한 직원(화면이 보내는 이름은 믿지 않는다).
-- 함께: Supabase 보안 점검이 알린 함수 search_path 고정(manila_today, near_now). 여러 번 실행해도 된다.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in ('view', 'create', 'update', 'followup_done', 'followup_reopen', 'account_create', 'password_reset'));

create or replace function public.student_account_audit(p_action text, p_student_no text, p_campus text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if p_action not in ('account_create', 'password_reset') then raise exception 'invalid_action'; end if;
  if coalesce(p_student_no, '') !~ '^\d{1,12}$' then raise exception 'invalid_student'; end if;
  insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus)
  values (auth.uid(), public.current_staff_name(), p_action, 'student_account', p_student_no, p_student_no, coalesce(p_campus, ''));
end $$;
revoke execute on function public.student_account_audit(text, text, text) from public, anon;
grant execute on function public.student_account_audit(text, text, text) to authenticated, service_role;

alter function public.manila_today() set search_path = public;
alter function public.near_now(timestamptz) set search_path = public;
