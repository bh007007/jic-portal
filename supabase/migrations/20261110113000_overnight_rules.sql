-- 외박 규칙(11/10 결정 I11, docs/leo-todo.md): 떠나는 날 하루 전까지 신청, 한 번에 최대 14박, 미성년(18세 미만)은 '보호자 동의 받음' 표시.
-- 규칙은 apps/student/server/requests.ts newOvernight 가 확인한다(학생 앱 서버). 여기서는 보호자 동의 표시를 남길 열만 더한다.
-- 학생이 신청할 때 넣을 수 있는 열에 더한다. 그전 기록은 false. 여러 번 실행해도 된다.
-- 20261108100000_student_intranet.sql 을 다시 실행하면 권한을 초기화하므로 이 파일도 이어서 다시 실행한다.
alter table public.overnight_permissions add column if not exists guardian_consent boolean not null default false;
grant insert (guardian_consent) on public.overnight_permissions to authenticated;
