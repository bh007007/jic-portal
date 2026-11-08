# JIC 포털 개발 인수인계 (썸머 매니저용)

업체 포털(jicportal.com)을 대체할 JIC 자체 통합 시스템이다. 지금은 **관리자 화면(대시보드·학생·기숙사·회계·에이전시·기초관리)** 이 동작하고, 나머지 화면은 디자인까지 되어 있다. 이 폴더를 Claude Code로 열면 Claude가 `CLAUDE.md`를 읽고 맥락을 이어받는다.

## 1. 처음 실행하기 (10분)

1. Node.js 20 이상 설치: https://nodejs.org (LTS) 또는 PowerShell에서 `winget install OpenJS.NodeJS.LTS`
2. 압축을 원하는 폴더에 푼다 (예: `C:\Users\<이름>\jic-portal`).
3. 그 폴더에서 터미널을 열고 실행:

   ```powershell
   npm install
   npm run admin
   ```

4. 브라우저에서 http://127.0.0.1:5173 을 연다. 오른쪽 위에 **샘플 데이터** 표시가 보이면 정상이다.

압축에는 실제 학생 데이터가 없다. 가짜 샘플 데이터(`data-sample/`, 학생 224명)로 화면이 돌아간다.

## 2. Claude Code로 이어서 개발하기

- Claude 데스크톱 앱 → Code → 폴더 열기로 이 폴더를 연다. (터미널이면 폴더에서 `claude`)
- Claude는 `CLAUDE.md`(작업 규칙)와 이 문서를 읽고 시작한다. 첫 요청 예시:
  - "HANDOFF.md 읽고 지금 상태를 요약해 줘. 그다음 '다음 할 일' 1번부터 진행하자."
  - "docs/design/PartnerHome.dc.html 디자인대로 파트너 포털 홈을 apps/partner 로 만들어 줘."
  - "에이전시 목록 화면을 관리자 앱에 추가해 줘. 데이터는 agencies.ndjson, agents.ndjson."
- 작업 전 브랜치를 만들고, 끝나면 커밋한다. 원격 저장소는 비공개 GitHub `bh007007/jic-portal` (접근 권한은 레오에게 요청).

## 3. 폴더 구조

```
jic-portal/
├─ HANDOFF.md            ← 이 문서
├─ CLAUDE.md             ← Claude가 읽는 작업 규칙
├─ README.md             ← 실행·데이터 추출 방법
├─ apps/admin/           ← 관리자 앱 (React + Vite + TypeScript)
│  ├─ server/core.ts        /api/* 계산 (로컬·배포 공통)
│  ├─ server/localData.ts   로컬: ndjson 파일 → core
│  └─ src/pages/            Dashboard, Students, StudentDetail, Arrivals, Dorm, Invoices, Deposits,
│                           Points, Agencies, AgencyDetail, Agents, Codes, Batches, Login
├─ apps/partner/         ← 파트너 포털 (React + Vite, 데이터는 전부 Supabase) · docs/partner-portal.md
├─ apps/student/         ← 학생 앱 (모바일, 로컬 전용) · docs/student-app.md
├─ apps/intranet/        ← 인트라넷 (가드 태블릿·통금·패널티, 로컬 전용) · docs/intranet.md
├─ functions/api/        ← 배포: Cloudflare Pages Function (Supabase → core)
├─ supabase/migrations/  ← Supabase 테이블·RLS SQL
├─ .github/workflows/    ← 빌드 확인(ci), DB 반영(supabase-migrate)
├─ data-sample/tables/   ← 가짜 샘플 데이터 (scripts/make-sample-data.mjs 로 재생성)
├─ data/                 ← 실제 추출 데이터 자리 (Git 제외, 압축에 없음)
├─ docs/
│  ├─ plan.md               전체 기획안 (아키텍처·DB 이관·로드맵·리스크)
│  ├─ legacy-portal.md      업체 포털 메뉴·테이블 약어·조회 API
│  ├─ data-dictionary.md    추출 데이터 열 목록 (값 없음)
│  └─ design/               화면 디자인 원본 9개 (.dc.html)
└─ scripts/
   ├─ extract/portal-extract.js   업체 포털 데이터 추출 (브라우저 콘솔)
   ├─ split-export.ps1            추출 파일 → 테이블별 NDJSON·CSV
   └─ make-sample-data.mjs        샘플 데이터 생성
```

## 4. 지금까지 된 것

| 항목 | 상태 |
| --- | --- |
| 기획안, 업체 포털 구조 분석 | 완료 (`docs/plan.md`, `docs/legacy-portal.md`) |
| 업체 포털 데이터 추출 | 완료 (11/7, 학생 5,537 · 연수 5,534 · 에이전시 651 등). 원본은 레오 PC에만 있음 |
| 화면 디자인 9개 | 완료 (`docs/design/`) |
| 관리자 앱: 대시보드, 재학생·입학 예정·졸업생 목록, 학생 상세, 입학 배치별 명단(픽업·항공편), 기숙사 타입별 현황, 에이전시 목록·상세, 담당자 계정, 목록 엑셀(CSV) 다운로드 | 동작 (로컬 데이터 / 배포 주소는 샘플) |
| 관리자 앱 회계: 인보이스(연수별 통화·납부 상태·입금 매칭 합계·포인트), 입금 매칭(미납·부분납 연수 입학일 순, 입금 원장), 포인트(재학생 잔액, 졸업 예정자 정산) | 동작 (11/8). 입금 원장은 `legacy_deposits`로 배포에도 연결(샘플 재업로드 후 보임) |
| 관리자 앱 기초관리: 코스·기숙사(캠퍼스별 학생 수), 캠퍼스·배치(배치 일정·캠퍼스별 인원) | 동작 (11/8), 읽기 전용 |
| 파트너 포털 1차 (`apps/partner`, 사이트맵 0.1~12.7): 공개 대시보드, 로그인·등록 신청·승인, 상담 6단계·학습계획서, 캠퍼스·코스, 견적·공실·등록 링크, 자료실, 공지·프로모션, 방문 신청, JIC 관리자 화면 | 배포 (11/8): https://jic-partner.bh007007.workers.dev (Cloudflare Workers, main 자동 배포). Supabase 테이블·권한 반영·시험 완료. `docs/partner-portal.md` |
| 학생 앱 1차 (`apps/student`): 홈, 결석·외박 신청·취소, 신청 내역(담당자 메모), 내 정보 (한국어·영어) | 동작 (11/8, 로컬 전용 `npm run student`). 배포는 학생 계정·정규화 스키마 이후. `docs/student-app.md` |
| 인트라넷 1차 (`apps/intranet`): 가드 태블릿 외출·귀가, 외출·귀가 기록·통금 확인, 패널티 승인(통금 위반 자동 후보)·점수표, 결석·외박 신청 처리(외박 승인 밤은 통금 제외), Student File(학생별 생활 기록), 상담 기록(확인할 일)·접근 기록, 내부 공지(읽음 확인), 통금·근무자 설정 | 동작 (11/8, 로컬 전용 `npm run intranet`). 점수·경고 기준은 미정이라 비워 둠. `docs/intranet.md` |
| Supabase 테이블(`legacy_*` 원본 jsonb)·직원 로그인·Cloudflare Pages 배포 | 동작 중 (11/7): https://jic-portal-916.pages.dev , Supabase `jic-portal`(Singapore). 샘플 데이터만. 계정은 레오에게 요청. 설정 순서 `docs/setup-cloud.md` |

## 5. 실제 데이터로 실행하기 (권한 있는 사람만)

실제 데이터에는 여권·연락처·계좌 같은 개인정보가 있다. 메신저·이메일·클라우드로 주고받지 않는다.

1. 업체 포털 관리자 계정으로 Edge/Chrome에 로그인한다.
2. F12 → Console에 `scripts/extract/portal-extract.js` 내용을 붙여 넣고 실행한다 (15~20분).
3. 받은 `jic_portal_export_YYYY-MM-DD.json.gz`를 `data/raw/`에 두고 `powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1` 실행.
4. `npm run admin`을 다시 시작하면 `data/tables`를 자동으로 읽는다 (배지가 '로컬 데이터'로 바뀜).

## 6. 다음 할 일 (우선순위 순)

1. **회계 화면 데이터 보강** (화면은 11/8 완료): 추출본을 건수로 확인한 결과
   - 재학·입학 예정 연수의 `sum_pd_point`·`sum_pu_point`는 모두 0이고 `tr_point_clear_yn`·`tr_room_clear_yn`이 Y인 연수는 0건이다. 그래서 실제 데이터에서 포인트 > 재학생 잔액은 전부 0, 졸업 예정자 정산은 전원 '미처리'로 나온다.
   - `point_history`(14,439건)를 붙였다(11/8, 학생 상세의 '포인트 내역' 표, 포인트 합계는 원장 우선).
     - `type` D는 항목명 없이 충전, U는 현지 비용 항목(`ec_name`: Maintenance, Laundry, Utility, SSP, Visa, Deposit, pick-up 등) 사용이다. 1포인트는 1페소(`point`=`php`)다.
     - 다만 추출본의 1,228개 연수는 졸업생(1,180)과 취소 연수(48)뿐이고, 1,212건은 충전액과 사용액이 같다. 연수별 D 합계 = `sum_pd_point`, U 합계 = `sum_pu_point`(1,227건 모두 일치)라 인보이스 포인트 값과 같은 정보다. 기록은 2024-09~2026-06뿐이다.
     - 재학생 잔액은 이 데이터로 알 수 없다. 2번 추가 추출의 `point_balance`(Point > Balance)로 붙이고, 6월 이후 기록이 없는 것이 날짜 조건 때문인지는 같은 스크립트의 `point_history_all`로 확인한다. 정산 여부 표시도 같이 확인한다.
   - 입금 원장(`deposits`, 679건)은 `legacy_deposits` 테이블과 `functions/api` 읽기를 추가했다. 업로드 스크립트는 계좌 열(`bk_*`, `*_acct_bank/num/owner`)을 빼고 올린다. `balance`는 업체 포털 값을 그대로 보여 준다(97건은 `dp_amount_total - sum_id_amount`와 다르다, 매칭 통화가 다른 경우로 보임).
   - 코스의 캠퍼스는 연수의 첫 코스 캠퍼스(`first_co_ca_code`) 기준이다. 기숙사는 이름 끝 "(P)" 같은 표시로 캠퍼스를 정한다.
   - 에이전시 담당자 이메일은 지금 가려서 보여 준다. 역할별 권한(4번)이 생기면 관리자에게만 전체 표시.
2. **추가 추출 실행** (스크립트 준비됨 11/8, 레오가 실행): `scripts/extract/portal-extract-extra.js`가 포인트 잔액(`point_balance`), 날짜 조건 없는 포인트 이력(`point_history_all`), 방·침대 목록(`rooms`), 오늘 기준 방·침대 배정(`bed_board`)을 받고, 인보이스 상세·방 상태 화면의 조회 주소를 기록한다. 업체 화면의 검색 조건을 직접 볼 수 없어 화면 HTML에서 검색 항목과 주소를 찾아 쓴다(가짜 포털로만 시험함). 실행 후 `docs/data-dictionary-extra.md`를 보고 → 포인트 화면을 `point_balance`로 바꾸고, 기숙사 화면을 디자인(04)의 방·침대 보드로 교체한다. 비는 단계가 있으면 `data/tables/extra_meta.json`의 화면 구조로 검색 조건을 고쳐 다시 받는다. 인보이스 상세 금액은 그다음.
3. **Supabase 정규화 스키마**: 지금은 `legacy_*`(원본 레코드 jsonb)를 통째로 읽어 계산한다. `docs/plan.md`의 데이터 모델 기준으로 학생·연수(enrollments)·배치·기숙사 테이블을 만들고 `functions/api`를 조건 조회로 바꾼다. 실제 데이터를 올리기 전에 필수. 테스트 DB에는 샘플 데이터만.
4. **역할별 권한**: 지금은 `staff_users`에 있으면 전부 읽기. 역할 9개(학생, 선생님, 체커, 스케줄러, 매니저, 오피스, 관리자, 가드, 에이전시 지점)로 RLS 세분화.
5. **파트너 포털 마무리**: Cloudflare Workers(`jic-partner`, `apps/partner/wrangler.jsonc`) 배포, 추천 조건표 승인본 입력(관리자 > 추천 규칙), 캠퍼스·코스 내용과 링크 입력(관리자 > 콘텐츠·설정). 결정 대기(견적 미리 채우기, 방문 신청 담당, Agent Hub 관계)는 `docs/partner-portal.md`. 다음은 2차 My Students(지점 계정 `legacy_am_id` ↔ 연수 `tr_am_id`).
6. **학생 앱**: 1차(결석 신청) 완료. 남은 것은 학생 계정·배포, 시간표(LMS 연결 후), `docs/student-app.md`의 확인 필요 사항. **인트라넷**: 1차 완료(신청 처리·외박 허용 포함). 남은 것은 직원·가드 계정과 배포, 무단결석(LMS 출석)·가드 리포트 후보, `docs/intranet.md`의 확인 필요 사항.
7. **서버 작업**: 정기 동기화·알림 같은 예약 작업은 Cloudflare Workers(크론). 화면 배포와 빌드 확인은 이미 연결됨.

## 7. 결정이 필요한 것

- 회계·포인트·POS를 JIC 포털로 옮길지, 업체에 남길지 (학생별 회계 이력 데이터는 옮기기로 결정)
- 패널티 위반별 점수·경고 기준점·소멸 시점
- 가드 계정 방식 (근무자별 / 경비실 공용)
- 에이전시 계정을 직원·학생과 같은 로그인 체계에 둘지
- 대표 승인: 공용 DB(Supabase 회사 계정)와 업체 포털 대체 방향

## 8. 지켜야 할 원칙

- 데이터마다 쓰는 곳은 한 곳, 나머지는 읽기만 (기획안 C2).
- 확인되지 않은 가격·공실·성과는 표시하지 않는다 (C8).
- 업체 포털에서는 읽기 전용 조회 API만 쓴다. 저장·삭제 주소는 호출하지 않는다.
- 비밀번호(`*_pw`)·세션 토큰은 추출하지 않는다. 에이전트 비밀번호는 새 포털에서 재등록.
