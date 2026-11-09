-- 인트라넷 역할 2단계 A(docs/roles.md, 11/9 레오님 승인 '인트라넷 담당에게 넘길 것'): 패널티 점수표 쓰기와 접근 기록 보기는 관리자만.
-- is_admin()(20261109010000_roles.sql) = 직원이면서 admin 역할이 있거나 office 역할이 없는 사람. 역할을 주기 전에는 모든 직원이 관리자다.
-- 오피스는 점수표를 읽기만 하고(승인할 때 점수를 가져온다) 접근 기록은 못 본다. 상담 기록 범위(staff_campuses)는 그대로다.
-- Student File 의 캠퍼스 범위(오피스는 맡은 캠퍼스만)는 인트라넷 서버(core.ts)가 막는다(외출·패널티 목록은 오피스도 모두 읽기라 표 권한은 그대로).
-- 20261108100000_student_intranet.sql 의 같은 이름 정책(rules_staff·stages_staff·audit_read)을 바꾼다. 그 파일을 다시 실행하면 이 파일도 다시 실행한다.
-- 여러 번 실행해도 된다.

-- 점수표: 직원 읽기, 고치기는 관리자(종류·단계 행은 고정이라 넣기·지우기 권한은 없다)
drop policy if exists rules_staff on public.penalty_rules;
create policy rules_staff on public.penalty_rules for select to authenticated using (public.is_staff());
drop policy if exists rules_admin_update on public.penalty_rules;
create policy rules_admin_update on public.penalty_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists stages_staff on public.penalty_stages;
create policy stages_staff on public.penalty_stages for select to authenticated using (public.is_staff());
drop policy if exists stages_admin_update on public.penalty_stages;
create policy stages_admin_update on public.penalty_stages for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 접근 기록: 관리자이면서 맡은 캠퍼스(staff_campuses)의 기록만. 남기는 것은 지금처럼 DB 함수만(상담·학생 계정·가드 계정)
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin() and public.staff_has_campus(campus));
