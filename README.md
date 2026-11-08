# JIC 포털

업체 포털(jicportal.com)을 대체할 JIC 자체 통합 시스템이다. 학생 포털, 파트너 포털, 인트라넷, LMS가 하나의 공용 DB를 쓴다.

- 기획안: [docs/plan.md](docs/plan.md) (원본은 [Claude 문서](https://claude.ai/artifact/9JTCwocjZJFqPjdDjvZEg2))
- 기존 업체 포털 구조와 조회 API: [docs/legacy-portal.md](docs/legacy-portal.md)
- 추출 데이터의 열 목록: [docs/data-dictionary.md](docs/data-dictionary.md)

## 지금 단계

실제 데이터는 하드디스크에만 두고 쓴다. 클라우드(Supabase)에는 샘플 데이터만 올리고, 실제 데이터는 보안 점검을 마친 뒤 정한다. 이 저장소(GitHub)에는 코드와 문서만 올라간다. 배포 설정은 [docs/setup-cloud.md](docs/setup-cloud.md).

```
portal/
├─ apps/admin/            관리자 화면 (React + Vite)
├─ apps/partner/          파트너 포털 (React + Vite + Supabase) · docs/partner-portal.md
├─ apps/student/          학생 앱 (모바일, 로컬 전용)
├─ apps/intranet/         인트라넷 (가드 태블릿·통금·패널티, 로컬 전용)
├─ functions/api/         배포용 /api 서버 (Cloudflare Pages Function → Supabase)
├─ supabase/migrations/   Supabase 테이블·권한 SQL
├─ .github/workflows/     빌드 확인, DB 반영
├─ docs/                  기획안, 업체 포털 분석, 데이터 사전, 클라우드 설정
├─ scripts/
│  ├─ extract/portal-extract.js   업체 포털에서 데이터 추출 (브라우저 콘솔)
│  └─ split-export.ps1            추출 파일 → 테이블별 NDJSON·CSV
└─ data/                  ← Git 제외. 실제 개인정보
   ├─ raw/                추출 원본 (.json.gz)
   └─ tables/             테이블별 파일 (엑셀은 .csv, 프로그램은 .ndjson)
```

## 관리자 화면 실행 (로컬)

`apps/admin`은 React + Vite 관리자 화면이다. 개발 서버가 `data/tables/*.ndjson`을 읽어 `/api/*`로 제공하며, 서버는 이 PC(127.0.0.1)에서만 열린다.

```powershell
npm install
npm run admin
```

브라우저에서 http://127.0.0.1:5173 을 연다. 화면: 대시보드, 재학생·입학 예정·졸업생 목록, 학생 상세, 입학 배치별 명단, 기숙사 배정 현황·방·침대 목록, 회계(인보이스·입금 매칭·포인트), 에이전시 목록·상세, 담당자 계정, 기초관리(코스·기숙사, 캠퍼스·배치). 목록 화면의 '엑셀 다운로드'는 현재 검색 조건 전체를 CSV(엑셀에서 바로 열림)로 받는다.

`data/tables`가 있어도 샘플로 보려면 `$env:JIC_DATA_DIR='data-sample/tables'; npm run admin`으로 실행한다(Claude 미리보기 설정 `admin-sample`, 포트 5174).

`data/tables`가 없으면 가짜 샘플 데이터(`data-sample/tables`)로 실행되고 오른쪽 위에 '샘플 데이터'가 표시된다. 인수인계 문서는 [HANDOFF.md](HANDOFF.md), 압축 파일은 `scripts/make-handoff.ps1`로 만든다.

- `/api/*` 계산은 `apps/admin/server/core.ts` 한 곳이다. 로컬은 `server/localData.ts`가 파일을, 배포는 `functions/api/[[path]].ts`가 Supabase를 읽어 같은 core에 넘긴다.
- 로컬에서는 로그인이 없다. 배포 주소(Cloudflare Pages)에서는 Supabase 직원 계정으로 로그인한다.
- 기준일은 추출 시각(`data/tables/meta.json`)이다. 다시 추출하고 분리하면 서버를 재시작해 반영한다.
- 추출본에 없는 항목: 방·침대 번호, 인보이스 총액. 추가 추출 후 화면에 붙인다. 회계 화면은 입금 매칭 합계(`sum_id_amount`)와 포인트 충전·사용 합계만 보여 주고 총액·미수금은 만들지 않는다.
- 입금 원장은 로컬에서는 `deposits.ndjson`, 배포에서는 `legacy_deposits`(받는 계좌 열 제외)를 읽는다. 비어 있으면 입금 매칭 > 입금 원장 탭에 '데이터 없음'이 표시된다.

## 학생 앱 실행 (로컬)

`apps/student`는 학생용 모바일 화면(홈, 결석·외박 신청, 신청 내역, 내 정보)이다. 관리자 앱과 같은 데이터 폴더를 읽고, 결석 신청은 `.local-db/`(Git 제외)에 저장한다.

```powershell
npm run student
```

http://127.0.0.1:5176 을 연다. 로그인은 학생번호 + 생년월일 8자리이며, 샘플 데이터로 실행하면 시험용 학생이 로그인 화면에 나온다. 자세한 내용은 [docs/student-app.md](docs/student-app.md), 두 작업 세션의 분담은 [docs/collab.md](docs/collab.md).

## 인트라넷 실행 (로컬)

`apps/intranet`은 직원용 화면과 경비실 가드 태블릿이다. 외출·귀가 기록, 통금 확인, 패널티 승인·점수표, 학생 결석·외박 신청 처리, 통금·근무자 설정이 있고, 기록은 `.local-db/`(Git 제외)에 저장한다.

```powershell
npm run intranet
```

http://127.0.0.1:5177 (가드 태블릿은 `/guard`). 자세한 내용은 [docs/intranet.md](docs/intranet.md).

## 데이터 다시 추출하기

1. Edge/Chrome에서 업체 포털 관리자 화면에 로그인한다.
2. F12 → Console에 [scripts/extract/portal-extract.js](scripts/extract/portal-extract.js)를 붙여 넣고 실행한다(약 15~20분).
3. 다운로드된 `jic_portal_export_YYYY-MM-DD.json.gz`를 `data/raw/`로 옮긴다.
4. 테이블로 나눈다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1
```

`data/tables/*.csv`는 엑셀에서 바로 열린다(UTF-8 BOM). `docs/data-dictionary.md`는 열 이름과 건수만 다시 만든다.

### 추가 추출 (포인트 잔액, 방·침대)

전체 추출에 없는 것만 받는 짧은 스크립트다(3~5분). 같은 방법으로 [scripts/extract/portal-extract-extra.js](scripts/extract/portal-extract-extra.js)를 콘솔에서 실행하고, 받은 `jic_portal_extra_YYYY-MM-DD.json.gz`를 `data/raw/`에 두고 `split-export.ps1`을 실행한다. 기존 표와 `meta.json`(기준일)은 그대로 두고 표만 더하며, 열 목록과 화면 구조는 `docs/data-dictionary-extra.md`에 쓴다. 콘솔에 '일부 단계가 비었습니다'가 나오면 파일은 그대로 두고 Claude에게 알린다(`data/tables/extra_meta.json`에 화면 구조가 남아 있어 다음 수정에 쓴다).

## 데이터 원칙

- `data/` 폴더와 `*.json.gz`는 `.gitignore`로 막혀 있다. 개인정보를 GitHub, OneDrive, 메신저로 옮기지 않는다.
- 비밀번호와 세션 토큰은 추출하지 않는다. 에이전트 비밀번호는 새 포털에서 재등록한다.
- 업체 포털에서는 읽기 전용 조회 API만 쓴다.
