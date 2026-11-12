-- 옛 학비표 함수 정리(11/12): 에이전시 학비표·상담 ④⑤는 견적과 같은 승인 가격 버전(price_books, CL-038 11/12·CL-066, #143)을 읽는다.
-- partner_tuition()(20261110173500, 20261110193000 에서 대표만으로 고침)은 업체 가격표(legacy_prices)를 에이전시에게 내주던 함수이고
-- 이제 어느 화면도 부르지 않는다. 로그인한 계정이 부를 수 있는 SECURITY DEFINER 함수를 하나 줄인다.
-- legacy_prices 는 그대로 직원만 읽는다(관리자 '가격표 › 업체 가격표(참고)'). 여러 번 실행해도 된다.

drop function if exists public.partner_tuition();
