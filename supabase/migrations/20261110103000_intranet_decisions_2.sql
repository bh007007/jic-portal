-- 인트라넷 결정 반영 2(docs/leo-todo.md, 11/10 레오님 결정):
--   I16 직원이 맡은 캠퍼스를 user_roles 한 곳으로 합친다. 관리자는 모든 캠퍼스, 오피스는 오피스 역할의 캠퍼스(빈칸이면 모든 캠퍼스).
--       staff_has_campus() 하나만 바꾸면 상담 기록(counseling_campus_ok)과 접근 기록 읽기(audit_read)가 같이 따라온다. staff_campuses 표는 더 쓰지 않는다(지우지는 않음).
--   I7 패널티 점수표에 '폭력'·'무단외출'을 따로 둔다(가드 리포트의 같은 종류가 이 종류로 후보가 된다). 점수는 점수표 화면에서 넣는다.
-- 20261108100000_student_intranet.sql 을 다시 실행하면 이 파일도 다시 실행한다(staff_has_campus 가 예전으로 돌아가므로). 여러 번 실행해도 된다.

-- ── I16: 직원이 그 캠퍼스를 맡는지(상담 기록·접근 기록 범위). 20261108100000 의 같은 함수를 user_roles 기준으로 바꿨다.
create or replace function public.staff_has_campus(p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()
     and (public.is_admin()
          or exists (select 1 from public.user_roles r
                      where r.user_id = auth.uid() and r.role = 'office' and (r.campus = '' or r.campus = p_campus)));
$$;

-- ── I7: 위반 종류 '폭력'·'무단외출'(점수·승인 권한은 비워 둔다). '기타'는 맨 뒤로.
insert into public.penalty_rules (code, name, sort) values ('violence', '폭력', 4), ('unauthorized', '무단외출', 5)
on conflict (code) do nothing;
update public.penalty_rules set sort = 6 where code = 'other' and sort <> 6;
