# JIC 포털 개발 인수인계 (썸머 매니저용)

업체 포털(jicportal.com)을 대체할 JIC 자체 통합 시스템이다. 지금은 **관리자 화면 1차(대시보드·학생·기숙사)** 가 동작하고, 나머지 화면은 디자인까지 되어 있다. 이 폴더를 Claude Code로 열면 Claude가 `CLAUDE.md`를 읽고 맥락을 이어받는다.

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
│  └─ src/pages/            Dashboard, Students, StudentDetail, Dorm, Login
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
| 학생 앱, 파트너 포털, 인트라넷 | 디자인만 |
| Supabase 테이블(`legacy_*` 원본 jsonb)·직원 로그인·Cloudflare Pages 배포 | 동작 중 (11/7): https://jic-portal-916.pages.dev , Supabase `jic-portal`(Singapore). 샘플 데이터만. 계정은 레오에게 요청. 설정 순서 `docs/setup-cloud.md` |

## 5. 실제 데이터로 실행하기 (권한 있는 사람만)

실제 데이터에는 여권·연락처·계좌 같은 개인정보가 있다. 메신저·이메일·클라우드로 주고받지 않는다.

1. 업체 포털 관리자 계정으로 Edge/Chrome에 로그인한다.
2. F12 → Console에 `scripts/extract/portal-extract.js` 내용을 붙여 넣고 실행한다 (15~20분).
3. 받은 `jic_portal_export_YYYY-MM-DD.json.gz`를 `data/raw/`에 두고 `powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1` 실행.
4. `npm run admin`을 다시 시작하면 `data/tables`를 자동으로 읽는다 (배지가 '로컬 데이터'로 바뀜).

## 6. 다음 할 일 (우선순위 순)

1. **관리자 앱 다음 화면**: 회계(인보이스·입금 매칭·포인트, 추출본에 있는 입금·포인트 합계 범위에서), 기초관리(코스·기숙사, 캠퍼스·배치). 에이전시 담당자 이메일은 지금 가려서 보여 준다. 역할별 권한(4번)이 생기면 관리자에게만 전체 표시.
2. **추가 추출**: 방·침대 배정(체크인 화면 `checkin_v3_student_rooms`, `room_bed_v2_load`)과 인보이스 상세 금액. 추출 스크립트에 단계 추가 → 기숙사 화면을 디자인(04)의 방·침대 보드로 교체.
3. **Supabase 정규화 스키마**: 지금은 `legacy_*`(원본 레코드 jsonb)를 통째로 읽어 계산한다. `docs/plan.md`의 데이터 모델 기준으로 학생·연수(enrollments)·배치·기숙사 테이블을 만들고 `functions/api`를 조건 조회로 바꾼다. 실제 데이터를 올리기 전에 필수. 테스트 DB에는 샘플 데이터만.
4. **역할별 권한**: 지금은 `staff_users`에 있으면 전부 읽기. 역할 9개(학생, 선생님, 체커, 스케줄러, 매니저, 오피스, 관리자, 가드, 에이전시 지점)로 RLS 세분화.
5. **파트너 포털 1차** (`apps/partner`): 홈·상담·캠퍼스·자료실·공지. 학생 개인정보 저장 금지, 가격·공실은 링크만.
6. **학생 앱**: 결석 신청부터. **인트라넷**: 패널티 승인, 가드 외출·귀가.
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
