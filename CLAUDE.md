# JIC 포털 — 작업 메모 (Claude용)

처음이면 `HANDOFF.md`(현황·다음 할 일)와 `docs/plan.md`(기획안)를 먼저 읽는다. 전체 구조는 `docs/architecture.md`: 관리자(인트라넷 포함)·학생·에이전시·강사(LMS) **4개 포털, DB는 Supabase 하나**(11/8 사용자 결정). 새 화면·테이블은 이 넷 중 하나에 속한다. 주소 `/`는 포털 선택 첫 화면, 관리자 포털은 `/admin/`. 여러 Claude가 함께 작업하므로 `docs/collab.md`(담당·공용 파일·DB 규칙)를 지킨다.

## 데이터 규칙
- `data/`에는 실제 학생·에이전트 개인정보가 있다(Git 제외). 절대 커밋하지 않고, 내용을 출력하거나 외부 서비스로 보내지 않는다. 구조(열 이름, 건수)만 다룬다.
- `data-sample/`은 가짜 데이터다. 개발·테스트·스크린샷은 이것으로 한다. 재생성: `node scripts/make-sample-data.mjs`.
- 데이터는 당분간 하드디스크에만 둔다(2026-11-07 결정). Supabase 적재는 보안 점검 이후, 테스트 DB에는 샘플만.
- 업체 포털(jicportal.com)에서는 읽기 전용 `*_load` 조회 API만 호출한다. 구조와 주의점은 `docs/legacy-portal.md`.
  - 예외(2026-11-08 레오 허용): 인보이스 편집 화면이 여는 조회 `adm/tuition2/payment_select/<tr_id>`와 화면 GET `payment_edit/<tr_id>`. `scripts/extract/portal-extract-invoice-items.js`만 쓰고, 주소 허용 목록 밖은 부르지 않는다.
  - 예외(2026-11-10 레오 허용): Closing Status 조회 `adm/register/closing_v2_list`·`closing_v2_finish_list`·`closing_v2_check_stay`(등록 가능 여부 집계, 개인정보 없음). 구조는 `docs/legacy-portal-probes.md` 'Closing Status'.

## 코드
- 관리자 앱: `apps/admin` (React 18 + Vite 5 + TypeScript, npm workspaces). 실행 `npm run admin` → http://127.0.0.1:5173, 검증 `npm run admin:build`(core 시험 `server/core.test.ts` 포함: 연장 종료일, 청구 합계, 연장·변경 목록).
- 파트너 포털: `apps/partner`. 실행 `npm run partner` → http://127.0.0.1:5175 (`apps/partner/.env.example`을 `.env.local`로 복사), 검증 `npm run partner:build`. 데이터는 전부 Supabase(테이블 이름은 기획안 '파트너' 그룹). 학생 정보는 저장하지 않는다(P3). 화면 문구는 `src/i18n.ts`. 기준 문서 `docs/partner-portal.md`.
- `/api/*` 계산은 `apps/admin/server/core.ts` 한 곳(파일·네트워크 의존 없음). 로컬은 `server/localData.ts`(Vite 플러그인, 데이터 폴더 우선순위 `JIC_DATA_DIR` → `data/tables` → `data-sample/tables`), 배포는 저장소 루트 `functions/api/[[path]].ts`(Cloudflare Pages Function, Supabase `legacy_*` 조회)가 같은 core를 쓴다. 화면은 두 환경에서 같은 응답을 받는다.
- 클라우드: Cloudflare Pages(루트에서 `npm run admin:build`, 출력 `apps/admin/dist`) + Supabase(Auth, `staff_users` + RLS). 설정 순서는 `docs/setup-cloud.md`. `VITE_SUPABASE_URL`이 없으면(로컬) 로그인 없이 동작한다. DB 변경은 `supabase/migrations`에 여러 번 실행해도 되는 SQL로 추가한다.
- 학생 앱: `apps/student` (모바일, 로컬 전용). 실행 `npm run student` → http://127.0.0.1:5176, 검증 `npm run student:build`. 학생·연수는 관리자 core의 `studentDetail`을 가져다 쓰고 학생에게 보일 항목만 고른다. 결석·외박 신청 규칙은 `server/requests.ts`, 생활 요청(업체 '요청사항')은 `server/lifeRequests.ts`, 학교 여행·액티비티(업체 'Outing > Travel')는 `server/trips.ts`, 출입 QR(카드키, 1분마다 바뀌는 서명 값)은 `server/keycard.ts`, 시간표(강사 포털 수업·출석 읽기, 주 단위)는 `server/timetable.ts`, 귀국 항공편·공항 이동 배차는 `server/departures.ts`(모두 인트라넷과 같이 씀, 신청·요청·항공편·여행 참가는 학생이, 처리·배차·여행 등록은 직원이 씀). 문구는 6개 언어 `src/i18n/*.ts`(키 기준 `ko.ts`, jp·ch·tw·vi는 원어민 검토 전 초안). 학생 계정은 `npm run student:accounts`(서비스 키, 기본 샘플·미리보기), 로그인은 `src/auth.ts`(`.env.local`에 Supabase 주소가 있으면 학생 계정, 없으면 학생번호+생년월일 로컬). 배포는 Workers `apps/student/worker`(같은 core, 저장소만 Supabase), 시험 `supabase/tests/student_worker_api.mjs`. 설명 `docs/student-app.md`.
- 인트라넷: `apps/intranet` (가드 태블릿 외출·귀가, 통금 확인, 패널티 승인·점수표, 결석·외박 신청·생활 요청 처리, 학교 여행, Student File, 상담 기록·접근 기록, 내부 공지, 가드 리포트, 귀국 일정, 로컬 전용). 상담 내용은 목록에 내보내지 않고 상세를 열 때마다 접근 기록을 남긴다. 실행 `npm run intranet` → http://127.0.0.1:5177, 검증 `npm run intranet:build`(core 시험 포함). 점수·경고 기준은 코드에 넣지 않고 점수표 화면에서 입력한다. 배포는 JIC 포털 Pages 프로젝트 안 `/intranet`(`npm run admin:build`가 같이 빌드, 서버 `functions/intranet` → `apps/intranet/worker`의 handleApi, 관리자 앱과 같은 로그인. 직원 로그인·가드 공용 계정은 가드 API만, 같은 core, 저장소는 Supabase·상담은 DB 함수), 시험 `supabase/tests/intranet_worker_api.mjs`. 통금 위반·무단결석 자동 확인은 `jic-intranet` Worker 크론(`apps/intranet/worker/cron.ts`, 매시 30분, 서비스 키). 설명 `docs/intranet.md`.
- 강사 포털(LMS): `apps/teacher` (휴대폰 기준, 원칙 L7). 실행 `npm run teacher` → http://127.0.0.1:5178(`apps/teacher/.env.example`을 `.env.local`로), 검증 `npm run teacher:build`. 서버 코드 없이 Supabase를 바로 쓰고 RLS가 막는다(역할 `user_roles`, `is_lms_user()`). 학생 목록은 `lms_students()` 함수로만 받는다(`legacy_*` 권한 그대로). 배포는 JIC 포털 Pages 안 `/teacher`(`npm run teacher:portal`, `functions/teacher`). 출석은 수업(`class_sessions`) × 학생(`attendance`), 입력자 판단은 `can_mark_attendance()` 하나. 시험 `supabase/tests/teacher_portal_rls.mjs`·`attendance_rls.mjs`. 설명 `docs/teacher-portal.md`.
- 연수(enrollment, 업체 `tr_`)와 학생(`st_`)은 다르다. 한 학생에 연수가 여러 건일 수 있다. 상태 분류(재학/입학 예정/졸업/취소)는 `core.ts`의 `statusOf`.
- 추출본에 없는 것: 침대 배정(업체 포털에 기록 없음). 화면에 추정값을 넣지 않는다.
- 인보이스 금액(2026-11-08 건수로 확인): 해외 총액 `sum_ic_price`, 입금 매칭 `sum_id_amount`, 현지 청구·납부 `sum_tc_price`·`sum_td_amount`(PHP). `sum_td_amount`는 해외 총액이 아니다. 미입금은 총액 − 입금 매칭을 미납·부분납에만 계산한다(`core.ts` invoiceAmounts). 단 `invoices.sum_ic_price`는 최근 인보이스 하나의 금액이라, 연수 청구 합계는 기본 + 연장 인보이스로 본다(2026-11-09: 인보이스별 합계 `inv_summary` → 업체 Check Balance `balance`의 cost·payment → 없으면 `invoices` 순, 업체 값과 4,991건 일치).
- 인보이스 항목(추가 추출, 열 목록 `docs/data-dictionary-invoice.md`): 학생 가격 `inv_invoice_cost_st`, 에이전시 공제 `inv_invoice_cost_ag`(커미션 등), 현지 비용·납부 `inv_etc`. 연수마다 최신 `ic_ver`만 쓰며 총액 = 학생 가격 − 공제(98% 일치). `inv_invoice_deposit`에는 받는 계좌 열이 있어 앱에서 읽지 않는다. 배포는 `legacy_invoice_items` 한 표에 세 표를 `_table`로 나눠 담는다(11/10, 가짜 샘플만).
- 연장(추가 추출 `extend`, 2026-11-09): 업체는 연장해도 `tr_finish_date`(원래 종료일)를 바꾸지 않고 연장 기간 `tt_*`를 따로 둔다. 그래서 종료일(`end`)과 재학 여부는 마지막 연장 종료일까지 본다(`core.ts` `finishOf`). 연장 표가 없는 배포에서는 아직 원래 종료일이다.
- 가격표(추가 추출 `price_*`·`promo`·`comm_rule`·`course_code`·`dorm_code`, 2026-11-09, 환율 `exchange_rate` 11/10, 개인정보 없음): 업체 '예상 금액' 화면 코드의 가격표와 기초코드·커미션·환율 목록(`docs/legacy-portal-probes.md`). 코스 가격은 `cc_week` 주 기준(대부분 4주), 기간별 값 `cs_*`는 4주 = 100. 환율은 통화쌍마다 시작일만 있어 다음 시작일 전날을 끝으로 본다. 관리자 기초관리 '가격표'(`core.ts` prices)가 읽는다. 배포(Supabase `legacy_prices`)에는 가짜 샘플만 있다(11/9).
- 디자인 원본: `docs/design/*.dc.html` (캔버스 형식, 텍스트로 읽어 참고). 스타일: Noto Sans KR 13px, 주색 #24427A, 로고 #D52B1E, 회색 검색 박스 + 표 위 진한 선. AI 느낌의 카드·배지·설명 문구는 쓰지 않는다.

## 환경
- Windows PowerShell 5.1: 한글이 든 `.ps1`은 UTF-8 BOM으로 저장해야 한다.
- 문서·UI 문구·커밋 메시지는 한국어로 쓴다.
