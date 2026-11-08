-- 학생 앱 배포 서버(apps/student/worker)용: 결석·외박 신청 번호(id)를 서버가 만들어 넣을 수 있게 한다.
-- 학생 앱 core 는 신청을 만들 때 번호(UUID)를 정하고 그 번호로 화면에 돌려준다(apps/student/server/requests.ts).
-- 20261108100000_student_intranet.sql 은 학생이 넣을 열만 열어 두었는데 id 가 빠져 있었다. 다른 열·정책은 그대로.
-- 여러 번 실행해도 된다(grant 는 같은 권한을 다시 줘도 그대로). 20261108100000 을 다시 실행하면 권한을 초기화하므로 이 파일도 이어서 다시 실행한다.
grant insert (id) on public.absence_requests to authenticated;
grant insert (id) on public.overnight_permissions to authenticated;
