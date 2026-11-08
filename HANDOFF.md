# JIC 포털 개발 인수인계 (썸머 매니저용)

업체 포털(jicportal.com)을 대체할 JIC 자체 통합 시스템이다. 지금은 **관리자 화면(대시보드·학생·기숙사·회계·에이전시·기초관리·통계)** 이 동작하고, 나머지 화면은 디자인까지 되어 있다. 이 폴더를 Claude Code로 열면 Claude가 `CLAUDE.md`를 읽고 맥락을 이어받는다.

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
│                           Points, Agencies, AgencyDetail, Agents, Codes, Batches, StudentCalendar,
│                           Registrations, Cancellations, Memos, Login
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
| 관리자 앱: 대시보드, 재학생·입학 예정·졸업생 목록, 학생 상세, 입학 배치별 명단(픽업·항공편, 배치 구성: 국적·성별·코스·기숙사·나이·에이전시), 기숙사 타입별 현황, 에이전시 목록·상세, 담당자 계정, 목록 엑셀(CSV) 다운로드 | 동작 (로컬 데이터 / 배포 주소는 샘플) |
| 관리자 앱 회계: 인보이스(연수별 통화·납부 상태·입금 매칭 합계·포인트), 입금 매칭(미납·부분납 연수 입학일 순, 입금 원장), 포인트(재학생 잔액, 졸업 예정자 정산) | 동작 (11/8). 입금 원장은 `legacy_deposits`로 배포에도 연결(샘플 재업로드 후 보임) |
| 관리자 앱 기초관리: 코스·기숙사(캠퍼스별 학생 수), 캠퍼스·배치(배치 일정·캠퍼스별 인원) | 동작 (11/8), 읽기 전용 |
| 관리자 앱 통계·마케팅: 학생수 달력(날짜별 재원·입국·귀국, 명단), 등록 현황(배치·월 × 인보이스 국적, 첫 인보이스·입국일 기준, 에이전시 검색, 작년 비교), 중단·연기 현황(+ 입학 전 캔슬), 체크 메모(에이전시·마케팅·아카데미 메모) | 동작 (11/8). 학생수·등록 합계를 업체 포털 같은 화면과 대조해 일치 확인(`docs/legacy-portal.md`) |
| 파트너 포털 1차 (`apps/partner`, 사이트맵 0.1~12.7): 공개 대시보드, 로그인·등록 신청·승인, 상담 6단계·학습계획서, 캠퍼스·코스, 견적·공실·등록 링크, 자료실, 공지·프로모션, 방문 신청, JIC 관리자 화면 | 배포 (11/8): https://jic-partner.bh007007.workers.dev (Cloudflare Workers, main 자동 배포). Supabase 테이블·권한 반영·시험 완료. `docs/partner-portal.md` |
| 학생 앱 1차 (`apps/student`): 홈, 결석·외박(여행 정보 포함) 신청·취소, 생활 요청(시설 수리·ID 카드 재발급 등), 학교 여행·액티비티 참가 신청, 출입 QR(1분마다 바뀌는 카드키 QR), 귀국 항공편 등록, 신청 내역(담당자 메모), 내 정보 (6개 언어: 한국어·영어, 일본어·중국어 간체·번체·베트남어는 원어민 검토 전 초안) | 동작 (11/8, 로컬 전용 `npm run student`). 배포는 학생 계정·정규화 스키마 이후. `docs/student-app.md` |
| 인트라넷 1차 (`apps/intranet`): 가드 태블릿 외출·귀가(카드키 QR 카메라 읽기)·사건 리포트, 외출·귀가 기록·통금 확인, 패널티 승인(통금 위반 자동 후보)·점수표, 결석·외박 신청 처리(외박 승인 밤은 통금 제외), 생활 요청 처리, 학교 여행 등록·참가 명단(1박 이상은 참가자 외박 허용), Student File(학생별 생활 기록), 상담 기록(확인할 일)·접근 기록, 내부 공지(읽음 확인), 귀국 일정·공항 이동 배차, 통금·근무자 설정 | 동작 (11/8, 로컬 전용 `npm run intranet`). 점수·경고 기준은 미정이라 비워 둠. `docs/intranet.md` |
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
     - 11/8 추가 추출로 확인했다.
       - `point_history_all`(날짜 조건 없이)도 14,439건으로 같다. 6월 이후 기록이 없는 건 날짜 조건 때문이 아니다.
       - `point_balance`(Point > Balance, 잔액 조건을 비우면 연수 5,002건)에서 **재학생 281명은 모두 충전 0·잔액 0**이다. 업체 포털은 현지 비용을 졸업 때 한 번에 정산 기록한다.
       - 잔액이 남은 것은 졸업생 14건과 취소 1건뿐이다. 포인트 화면에 '잔액 남은 졸업생' 탭을 추가했다(정산·환불 확인용).
   - 입금 원장(`deposits`, 679건)은 `legacy_deposits` 테이블과 `functions/api` 읽기를 추가했다. 업로드 스크립트는 계좌 열(`bk_*`, `*_acct_bank/num/owner`)을 빼고 올린다. `balance`는 업체 포털 값을 그대로 보여 준다(97건은 `dp_amount_total - sum_id_amount`와 다르다, 매칭 통화가 다른 경우로 보임).
   - 코스의 캠퍼스는 연수의 첫 코스 캠퍼스(`first_co_ca_code`) 기준이다. 기숙사는 이름 끝 "(P)" 같은 표시로 캠퍼스를 정한다.
   - 에이전시 담당자 이메일은 지금 가려서 보여 준다. 역할별 권한(4번)이 생기면 관리자에게만 전체 표시.
2. **추가 추출 결과 (11/8 실행)**: `portal-extract-extra.js`와, 검색 조건을 맞춘 `portal-extract-rooms-points.js`로 받았다.
   - **방·침대**: Premium만 등록되어 있다(방 74개, 침대 184개, 건물 2동, 1~4층). Challenger·MCO는 0개다. 관리자 앱 '기숙사 > 방·침대 관리'(`/rooms`)에 목록으로 붙였다.
   - **침대 배정**: 업체 포털에 기록이 없다. 오늘 입실자 295명(체크인 화면 `checkin_v3_load`) 모두 침대 사용이 0이고, 학생별 방 조회(`checkin_v3_student_rooms`)도 모두 비어 있다.
     - 그래서 디자인(04) 방·침대 배정판은 데이터를 옮겨 올 수 없다. 새 시스템에서 배정을 입력하는 기능으로 만든다.
     - 타입별 침대 수와 입실 인원이 맞지 않는 곳이 있어서(예: R2 (Bal) 침대 24개, 입실 32명) 공실은 계산해 보여 주지 않는다.
   - 인보이스 금액(PR #24, 회계 세션 담당): 인보이스 총액은 기존 추출본의 `sum_ic_price`에 있다(완납 594건 중 541건이 입금 매칭 합계 = 총액). 현지 청구·납부는 `sum_tc_price`·`sum_td_amount`다. 항목별 상세 금액은 업체 회계 화면(현지 인보이스 납부·Check Balance·Payment Report) 조사 스크립트 실행 뒤 추출한다.
   - 다음: 연장 기록(`adm/train3/extend` → `extend_load`, `tt_*` 열)과 신입·연장·복귀·변경 탭(`freshman_load_*`). 받으면 '연장 현황'과 변경 이력 화면을 만든다.
3. **Supabase 정규화 스키마**: 지금은 `legacy_*`(원본 레코드 jsonb)를 통째로 읽어 계산한다. `docs/plan.md`의 데이터 모델 기준으로 학생·연수(enrollments)·배치·기숙사 테이블을 만들고 `functions/api`를 조건 조회로 바꾼다. 실제 데이터를 올리기 전에 필수. 테스트 DB에는 샘플 데이터만.
4. **역할별 권한**: 지금은 `staff_users`에 있으면 전부 읽기. 역할 9개(학생, 선생님, 체커, 스케줄러, 매니저, 오피스, 관리자, 가드, 에이전시 지점)로 RLS 세분화.
5. **파트너 포털 마무리**: Cloudflare Workers(`jic-partner`, `apps/partner/wrangler.jsonc`) 배포, 추천 조건표 승인본 입력(관리자 > 추천 규칙), 캠퍼스·코스 내용과 링크 입력(관리자 > 콘텐츠·설정). 결정 대기(견적 미리 채우기, 방문 신청 담당, Agent Hub 관계)는 `docs/partner-portal.md`. 다음은 2차 My Students(지점 계정 `legacy_am_id` ↔ 연수 `tr_am_id`).
6. **학생 앱**: 1차(결석 신청) 완료. 테이블·권한 마이그레이션 완료(11/8, 시험 `supabase/tests/student_intranet_rls.mjs`). 학생 계정 생성 스크립트(`npm run student:accounts`)와 Supabase 로그인·첫 비밀번호 변경 화면 완료(11/8). 배포 서버(Workers `jic-student`, 신청 저장소를 Supabase로) 코드 완료(11/8). 남은 것은 Cloudflare `jic-student` 설정(`docs/student-app.md` '배포'), 시간표(LMS 연결 후), `docs/student-app.md`의 확인 필요 사항. **인트라넷**: 1차 완료(신청 처리·외박 허용·가드 리포트 포함). 배포는 JIC 포털 Pages 프로젝트 안 `/intranet`(11/8 결정, 한 번 로그인, 서버 `functions/intranet`). 남은 것은 Pages Secret `SUPABASE_SERVICE_ROLE_KEY`(가드 태블릿용)·가드 계정·`staff_campuses` 입력(`docs/intranet.md` '배포'), 통금 직후 크론, 무단결석(LMS 출석) 후보, `docs/intranet.md`의 확인 필요 사항.
7. **서버 작업**: 정기 동기화·알림 같은 예약 작업은 Cloudflare Workers(크론). 화면 배포와 빌드 확인은 이미 연결됨.

## 7. 결정이 필요한 것

- 회계·포인트·POS를 JIC 포털로 옮길지, 업체에 남길지 (학생별 회계 이력 데이터는 옮기기로 결정)
- 패널티 위반별 점수·경고 기준점·소멸 시점
- 학생 계정 생성 담당(누가 언제 스크립트를 실행할지)
- 에이전시 계정을 직원·학생과 같은 로그인 체계에 둘지
- 대표 승인: 공용 DB(Supabase 회사 계정)와 업체 포털 대체 방향
- 전체 목록과 추천(대표 보고용): [JIC 포털 결정 요청 사항](https://claude.ai/artifact/7o7BNFFXZfeoA32VfApR5L) (Claude 문서, 2026-11-08)

11/8 결정(레오): 학생 계정은 학생번호+생년월일로 미리 만들고 첫 로그인 때 비밀번호 변경, 가드는 출입구마다 공용 계정 + 근무자 이름 선택, 상담 기록은 같은 캠퍼스 직원만 열람. 테이블·권한은 `supabase/migrations/20261108100000_student_intranet.sql`.

## 8. 지켜야 할 원칙

- 데이터마다 쓰는 곳은 한 곳, 나머지는 읽기만 (기획안 C2).
- 확인되지 않은 가격·공실·성과는 표시하지 않는다 (C8).
- 업체 포털에서는 읽기 전용 조회 API만 쓴다. 저장·삭제 주소는 호출하지 않는다.
- 비밀번호(`*_pw`)·세션 토큰은 추출하지 않는다. 에이전트 비밀번호는 새 포털에서 재등록.
