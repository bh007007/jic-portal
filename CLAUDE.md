# JIC 포털 — 작업 메모 (Claude용)

처음이면 `HANDOFF.md`(현황·다음 할 일)와 `docs/plan.md`(기획안)를 먼저 읽는다. 여러 Claude가 함께 작업하므로 `docs/collab.md`(담당·공용 파일·DB 규칙)를 지킨다.

## 데이터 규칙
- `data/`에는 실제 학생·에이전트 개인정보가 있다(Git 제외). 절대 커밋하지 않고, 내용을 출력하거나 외부 서비스로 보내지 않는다. 구조(열 이름, 건수)만 다룬다.
- `data-sample/`은 가짜 데이터다. 개발·테스트·스크린샷은 이것으로 한다. 재생성: `node scripts/make-sample-data.mjs`.
- 데이터는 당분간 하드디스크에만 둔다(2026-11-07 결정). Supabase 적재는 보안 점검 이후, 테스트 DB에는 샘플만.
- 업체 포털(jicportal.com)에서는 읽기 전용 `*_load` 조회 API만 호출한다. 구조와 주의점은 `docs/legacy-portal.md`.

## 코드
- 관리자 앱: `apps/admin` (React 18 + Vite 5 + TypeScript, npm workspaces). 실행 `npm run admin` → http://127.0.0.1:5173, 검증 `npm run admin:build`.
- 파트너 포털: `apps/partner`. 실행 `npm run partner` → http://127.0.0.1:5175 (`apps/partner/.env.example`을 `.env.local`로 복사), 검증 `npm run partner:build`. 데이터는 전부 Supabase(테이블 이름은 기획안 '파트너' 그룹). 학생 정보는 저장하지 않는다(P3). 화면 문구는 `src/i18n.ts`. 기준 문서 `docs/partner-portal.md`.
- `/api/*` 계산은 `apps/admin/server/core.ts` 한 곳(파일·네트워크 의존 없음). 로컬은 `server/localData.ts`(Vite 플러그인, 데이터 폴더 우선순위 `JIC_DATA_DIR` → `data/tables` → `data-sample/tables`), 배포는 저장소 루트 `functions/api/[[path]].ts`(Cloudflare Pages Function, Supabase `legacy_*` 조회)가 같은 core를 쓴다. 화면은 두 환경에서 같은 응답을 받는다.
- 클라우드: Cloudflare Pages(루트에서 `npm run admin:build`, 출력 `apps/admin/dist`) + Supabase(Auth, `staff_users` + RLS). 설정 순서는 `docs/setup-cloud.md`. `VITE_SUPABASE_URL`이 없으면(로컬) 로그인 없이 동작한다. DB 변경은 `supabase/migrations`에 여러 번 실행해도 되는 SQL로 추가한다.
- 학생 앱: `apps/student` (모바일, 로컬 전용). 실행 `npm run student` → http://127.0.0.1:5176, 검증 `npm run student:build`. 학생·연수는 관리자 core의 `studentDetail`을 가져다 쓰고 학생에게 보일 항목만 고른다. 설명 `docs/student-app.md`.
- 연수(enrollment, 업체 `tr_`)와 학생(`st_`)은 다르다. 한 학생에 연수가 여러 건일 수 있다. 상태 분류(재학/입학 예정/졸업/취소)는 `core.ts`의 `statusOf`.
- 추출본에 없는 것: 방·침대 번호, 인보이스 총액(`sum_td_amount`는 총액이 아님). 화면에 추정값을 넣지 않는다.
- 디자인 원본: `docs/design/*.dc.html` (캔버스 형식, 텍스트로 읽어 참고). 스타일: Noto Sans KR 13px, 주색 #24427A, 로고 #D52B1E, 회색 검색 박스 + 표 위 진한 선. AI 느낌의 카드·배지·설명 문구는 쓰지 않는다.

## 환경
- Windows PowerShell 5.1: 한글이 든 `.ps1`은 UTF-8 BOM으로 저장해야 한다.
- 문서·UI 문구·커밋 메시지는 한국어로 쓴다.
