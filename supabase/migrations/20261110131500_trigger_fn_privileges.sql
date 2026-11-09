-- 트리거 함수의 실행 권한 거두기(11/10, Supabase 보안 진단 0028·0029).
-- 트리거 함수는 REST(/rest/v1/rpc)로 부를 일이 없는데, 기본값(PUBLIC 실행)이라 진단이 '로그인 전에도 부를 수 있음'으로 잡는다.
-- 트리거는 실행 권한과 상관없이 그대로 돈다(PostgreSQL 은 트리거를 만들 때만 확인한다). 시험: attendance_rls.mjs·partner_reco_rls.mjs 가
-- 이 파일을 먼저 적용한 뒤 출석 입력·마감, 지점 계정 고치기, 가입 신청이 그대로 되는지 본다.
-- 없는 함수는 건너뛴다(rls_auto_enable 은 Supabase 대시보드의 'RLS 자동 켜기'가 만든 이벤트 트리거 함수라 새 프로젝트에는 없을 수 있다).
-- 여러 번 실행해도 된다.
do $$
declare f text;
begin
  foreach f in array array[
    'public.handle_partner_signup()',     -- 에이전시 등록 신청(auth.users 추가 시)
    'public.guard_member_update()',       -- 지점 계정: 연락처·화면 설정만 본인이 고침
    'public.attendance_guard()',          -- 출석: 마감·앞날 막기, 체크한 사람 기록
    'public.attendance_closing_stamp()',  -- 출석 마감: 마감한 사람 기록
    'public.rls_auto_enable()'            -- 새 표 RLS 자동 켜기(이벤트 트리거)
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
