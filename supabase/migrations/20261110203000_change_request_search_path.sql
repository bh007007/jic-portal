-- Supabase 보안 진단 'Function Search Path Mutable'(11/10): search_path 를 고정하지 않은 public 함수에 빈 search_path 를 준다. 여러 번 실행해도 된다.
-- 모두 표를 읽지 않고 기본 함수만 쓰는 함수라 빈 search_path 로 둔다. 같은 규칙을 CI security_lint.mjs 7번이 모든 public 함수에 대해 본다.
-- - change_request_next_ok: 변경 요청 상태 길(20261110100000_change_requests.sql). 운영에 있다(진단에 나온 것).
-- - legacy_date·legacy_ts·legacy_int·legacy_num·enrollment_status: 정규화 표의 값 변환(20261110110000·120000·130000_core_schema*.sql).
--   학원 계정 새 프로젝트에서 적용하므로 운영에는 아직 없다.
-- 있는 함수만 바꾼다.
do $$
declare f text;
begin
  foreach f in array array['change_request_next_ok(text, text)', 'legacy_date(text)', 'legacy_ts(text)', 'legacy_int(text)', 'legacy_num(text)',
                           'enrollment_status(text, date, date, date)'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set search_path = %L', f, '');
    end if;
  end loop;
end $$;
