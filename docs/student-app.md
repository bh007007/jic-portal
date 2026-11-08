# 학생 앱 (`apps/student`)

학생이 휴대폰으로 쓰는 화면이다. 디자인은 `docs/design/StudentPortal.dc.html`(05, 390×844)을 따른다. 1차는 **로컬 개발 서버 전용**이고, 배포는 아래 '배포 전에 필요한 것'을 마친 뒤에 한다.

## 실행

```powershell
npm install
npm run student
```

브라우저에서 http://127.0.0.1:5176 을 연다(관리자 앱은 5173). 휴대폰 폭으로 보려면 개발자 도구의 기기 모드를 쓴다. 샘플 데이터로 실행하면 로그인 화면 아래에 시험용 학생번호·생년월일이 나온다.

## 화면

| 경로 | 화면 | 데이터 |
| --- | --- | --- |
| `/` | 홈: 학생증, 바로가기, 결석 신청 내역(최근 3건), 졸업 전 확인 | 학생·연수(재학 중 → 입학 예정 → 최근 순), 방 정리·포인트 정리 여부 |
| `/requests` | 신청: 결석·외박 신청 버튼, 결석·외박 신청 내역 | 결석·외박 신청 |
| `/requests/absence/new` | 결석 신청: 날짜, 종류(병결·공결·개인 사유), 교시(종일 또는 1~8), 사유(500자) | |
| `/requests/:id` | 결석 신청 상세(담당자 메모 포함), 대기 중이면 취소 | |
| `/requests/overnight/new` | 외박 신청: 출발일, 복귀일(박 수 표시), 사유(행선지 포함, 500자) | |
| `/requests/overnight/:id` | 외박 신청 상세(담당자 메모 포함), 대기 중이면 취소 | |
| `/me` | 내 정보: 학생 정보(이메일·연락처는 가림), 연수, 연수 이력, 로그아웃 | |
| `/timetable` | 시간표: 준비 중(추출본에 없음, LMS 연결 후) | |

- 졸업 전 확인은 재학 중인 연수의 종료일이 기준일로부터 14일 이내일 때만 보인다(관리자 앱의 '졸업임박'과 같은 기준). 디자인의 '귀국 항공편 등록'은 추출본에 귀국 항공편이 없어 뺐다.
- 문구는 기획안 P7에 따라 업체와 같은 **6개 언어**(한국어, English, 日本語, 简体中文, 繁體中文, Tiếng Việt)다. 오른쪽 위 선택 목록으로 바꾸고, 고른 언어는 기기에 기억한다. 처음에는 브라우저 언어를 따른다(zh-TW·zh-HK·번체는 繁體中文, 그 밖의 중국어는 简体中文, 목록에 없는 언어는 English). 자세한 내용은 아래 '다국어'.

## 다국어

- 사전은 `src/i18n/` 에 언어별 파일이 있다: `ko.ts`(키 목록 기준), `en.ts`, `jp.ts`, `ch.ts`(간체), `tw.ts`(번체, 대만식), `vi.ts`. 언어 목록·요일·`html lang`은 `src/i18n/langs.ts`.
- **jp·ch·tw·vi 는 Claude가 만든 초안이다. 원어민(현지 직원·에이전시) 검토를 받은 뒤 학생에게 연다.** 고칠 때는 그 언어 파일의 값만 바꾸면 된다.
- 문구를 더할 때는 `ko.ts`에 키를 넣으면, 다른 언어 파일에 빠진 키가 타입 검사(`npm run student:build`)에서 걸린다. `server/i18n.test.ts`가 언어마다 빈 문구가 없는지, `{n}`·`{t}` 같은 자리 표시가 한국어와 같은지 확인한다.
- 용어(초안 기준): 결석 신청 = 欠席申請 / 请假申请 / 請假申請 / Xin nghỉ học, 외박 = 外泊 / 外宿 / Ngủ ngoài, 교시 = 3限 / 第3节 / 第3節 / Tiết 3, 병결·공결·개인 사유 = 病欠·公欠·私用 / 病假·公假·事假 / Ốm·Việc chính thức·Việc cá nhân.
- 글꼴: 일본어·중국어는 한자를 한국식 글자꼴로 그리지 않도록 기기의 일본어·중국어 글꼴(Hiragino, PingFang, Microsoft YaHei 등)을 먼저 쓴다. 따로 내려받는 글꼴은 없다.
- 국적·코스명·기숙사 타입처럼 업체 데이터에서 오는 값은 번역하지 않는다. 국적은 지금 한국어(업체 `st_country_cd_name`)로 보인다. 업체 기준 코드에 6개 언어 이름이 있으므로(기획안 '기존 포털 분석'), 코드표를 추출하면 그 이름으로 바꾼다.

## 구조

```
apps/student/
├─ server/core.ts        /api/* 계산 (파일·네트워크 의존 없음)
├─ server/requests.ts    결석·외박 신청의 모양과 규칙 (인트라넷이 승인·반려에 같이 씀)
├─ server/core.test.ts   core 시험 (가짜 시계·메모리 저장소). 빌드할 때 함께 돈다
├─ server/i18n.test.ts   문구 시험 (6개 언어 키·자리 표시, 브라우저 언어)
├─ server/localData.ts   로컬: Vite 플러그인, 신청 파일 저장 (인트라넷도 같은 파일을 연다)
└─ src/                  화면 (React + Vite + TypeScript), 문구 src/i18n/
```

- 학생·연수 정보는 관리자 앱의 `apps/admin/server/core.ts`(`createDb` → `studentDetail`)와 `localData.ts`(`loadDir`)를 그대로 가져다 쓴다. 상태 분류(재학/입학 예정/졸업)가 관리자 앱과 같게 유지된다. 관리자 쪽에서 이 함수의 응답 모양을 바꾸면 `npm run student:build`가 타입 오류로 알려 준다.
- 학생에게는 필요한 항목만 골라 내보낸다. 메모(에이전시·회계·취소 등), 입금액·포인트 금액, 에이전시·납부 방법은 내보내지 않는다. 학생 앱의 `/api`에는 관리자 API가 없다.

### API

| 메서드·경로 | 내용 |
| --- | --- |
| `GET /api/meta` | 데이터 종류(샘플/추출본), 기준일. 샘플일 때만 시험용 학생 |
| `POST /api/login` | 로컬 전용. `{ stId, birthday: 'YYYYMMDD' }` 확인 |
| `GET /api/me` | 학생 정보, 대표 연수, 연수 이력, 졸업 전 확인 |
| `GET /api/absences` | 내 결석 신청, 신청 가능 기간, 교시 수 |
| `POST /api/absences` | 결석 신청 `{ date, kind, periods, reason }` |
| `POST /api/absences/:id/cancel` | 대기 중인 내 신청 취소 |
| `GET /api/overnights` | 내 외박 신청(박 수 포함), 신청 가능 기간 |
| `POST /api/overnights` | 외박 신청 `{ from, until, reason }` |
| `POST /api/overnights/:id/cancel` | 대기 중인 내 외박 신청 취소 |

결석 신청 규칙(서버에서 확인):

- 날짜는 재학 중이거나 입학 예정인 연수 기간 안. 연장으로 연수가 여러 개면 그중 하나에 들어가면 되고, 신청에는 그 연수 번호(`trId`)가 붙는다.
- 같은 날짜에 대기·승인 상태인 신청과 교시가 겹치면 거절한다(종일은 모든 교시와 겹친다). 취소·반려된 신청은 다시 낼 수 있다.
- 학생은 대기 중인 자기 신청만 취소할 수 있다. 승인·반려는 인트라넷 '신청 처리'에서 하고(`docs/intranet.md`), 담당자 메모가 신청 상세에 보인다. 결석 승인은 LMS가 생기면 그쪽으로 옮길 수 있다(같은 `requests.ts`를 쓰면 된다).

외박 신청 규칙(서버에서 확인):

- 출발일 밤부터 복귀일 전날 밤까지가 외박이다(11/8 출발, 11/10 복귀 = 2박). 복귀일은 출발일보다 뒤여야 한다.
- 출발일과 마지막 밤이 한 연수 기간 안에 들어가야 한다.
- 대기·승인 상태인 다른 외박과 밤이 겹치면 거절한다(복귀일 밤부터 새 외박은 겹치지 않는다).
- 승인된 외박의 밤은 인트라넷 통금 확인에서 빠지고, 가드 태블릿에 '외박 허용 ~복귀일'로 보인다.

### 로컬 저장과 로그인

- 결석·외박 신청은 저장소 루트 `.local-db/student/absences-sample.ndjson`, `overnights-sample.ndjson`(실제 추출본으로 실행하면 `-extract`)에 쓴다. 인트라넷 개발 서버도 같은 파일을 열어 승인·반려한다. `.local-db/`는 Git에서 빠진다. 실제 데이터로 실행하면 학생 번호와 사유가 들어가므로 `data/`와 같이 다룬다.
- 승인·반려 화면을 보고 싶으면 이 파일에서 `status`를 `approved`/`rejected`로, `decidedAt`·`comment`를 채우면 된다(읽을 때마다 파일을 다시 읽는다).
- 로그인은 학생번호 + 생년월일(기획안 V4의 초기 비밀번호)로 확인하고, 학생 번호를 이 탭(sessionStorage)에 두고 `X-Student-Id` 헤더로 보낸다. **127.0.0.1에서만 열리는 개발 서버용 방식이다.** 배포 빌드에는 `/api`가 없어 이 로그인이 나가지 않는다.

## 배포 전에 필요한 것

1. **정규화 스키마**(HANDOFF 6-3): 학생은 `legacy_*`(직원만 읽기)를 읽을 수 없다. 학생 본인 행만 읽히는 `students`·`enrollments` 테이블과 RLS가 있어야 홈·내 정보를 배포에서 보여 줄 수 있다.
2. **학생 계정**: Supabase Auth 사용자와 학생 번호를 잇는 테이블, 계정 생성은 서버(Worker)에서만, 첫 로그인 때 비밀번호 변경 강제(V4). 로그인 화면과 `src/api.ts`의 헤더를 Supabase 토큰으로 바꾼다.
3. **결석 신청 테이블**: 아래 초안을 LMS 담당자와 맞춘 뒤 `supabase/migrations`에 새 파일로 넣는다(규칙은 `docs/collab.md` '데이터베이스 규칙'). 학생 계정 방식이 열린 결정이라 초안 단계에서는 넣지 않았다.
4. **Cloudflare Pages 프로젝트**: 관리자 앱과 별도 프로젝트로 만든다(빌드 `npm run student:build`, 출력 `apps/student/dist`).

### 결석 신청 테이블 초안 (확정 전)

설계표 공동 개발 약속(snake_case, `student_no`, `created_at`·`updated_at`·`created_by`)과 기획안의 연수 번호(`enrollment_id`)를 따른다.

```sql
-- 학생 계정: Supabase Auth 사용자 ↔ 학생 번호. 쓰기는 서비스 키(Worker)만.
-- staff_users + is_staff(), agency_members + is_partner() 와 같은 방식으로 is_student() / current_student_no() 함수를 둔다.
-- 계정은 서버에서 만든다. 가입 화면을 쓰게 되면 메타데이터 portal='student'로 구분한다(on_partner_signup 트리거는 'partner'만 처리).
create table if not exists public.student_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  student_no text not null unique,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null,
  absence_date date not null,
  periods smallint[] not null default '{}',            -- 빈 배열 = 종일
  kind text not null check (kind in ('sick', 'official', 'personal')),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  staff_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
-- 외박(기획안 '생활' 그룹 overnight_permissions). 열은 absence_requests 와 같고 날짜만 다르다.
create table if not exists public.overnight_permissions (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null,
  leave_date date not null,                              -- 첫 밤
  return_date date not null check (return_date > leave_date),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  staff_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
-- RLS: 학생은 자기 student_no 행만 읽기·등록(status='pending'으로만), 취소는 대기 중인 자기 행만(함수로).
--      직원은 is_staff() 로 읽기, 승인·반려는 역할별 권한(HANDOFF 6-4)이 생긴 뒤 담당 역할만.
-- 기간·중복 확인은 enrollments 정규화 테이블이 생긴 뒤 트리거 또는 서버 함수로 옮긴다.
```

## 확인이 필요한 것

- 교시 수(지금 1~8, `server/core.ts`의 `PERIOD_COUNT`)와 캠퍼스별 차이. 시간표가 연결되면 그날 수업이 있는 교시만 보여 준다.
- 결석 종류(병결·공결·개인 사유)와 종류별 증빙(진단서 사진 등) 필요 여부.
- 신청 기한(지난 날짜를 며칠까지 받을지). 인트라넷 패널티 디자인에 '기한 후 신청 반려'가 있다. 지금은 연수 기간 안이면 모두 받는다.
- 결석 승인 담당: 지금은 인트라넷 '신청 처리'. LMS(교사)로 옮길지.
- 학생 사진: 업체 포털의 `photo_url`은 업체 서버 주소라 쓰지 않았다. 사진 이관 방식 결정 후 붙인다.
- 외박: 며칠 전까지 신청해야 하는지, 최대 박 수, 보호자 동의·연락처가 필요한지. 지금은 연수 기간 안이면 받는다.
