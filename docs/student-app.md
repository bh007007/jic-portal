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
| `/requests` | 신청: 결석 신청 버튼, 신청 내역 전체 | 결석 신청 |
| `/requests/absence/new` | 결석 신청: 날짜, 종류(병결·공결·개인 사유), 교시(종일 또는 1~8), 사유(500자) | |
| `/requests/:id` | 신청 상세, 대기 중이면 취소 | |
| `/me` | 내 정보: 학생 정보(이메일·연락처는 가림), 연수, 연수 이력, 로그아웃 | |
| `/timetable` | 시간표: 준비 중(추출본에 없음, LMS 연결 후) | |

- 졸업 전 확인은 재학 중인 연수의 종료일이 기준일로부터 14일 이내일 때만 보인다(관리자 앱의 '졸업임박'과 같은 기준). 디자인의 '귀국 항공편 등록'은 추출본에 귀국 항공편이 없어 뺐다.
- 문구는 `src/i18n.tsx`에 한국어·영어로 있고, 오른쪽 위 버튼으로 바꾼다. 나머지 4개 언어(jp, ch, tw, vi)는 같은 파일에 사전을 추가하면 된다. 이름·국적·코스명처럼 데이터에서 오는 값은 번역하지 않는다.

## 구조

```
apps/student/
├─ server/core.ts        /api/* 계산 (파일·네트워크 의존 없음)
├─ server/localData.ts   로컬: Vite 플러그인, 결석 신청 파일 저장
└─ src/                  화면 (React + Vite + TypeScript)
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

결석 신청 규칙(서버에서 확인):

- 날짜는 재학 중이거나 입학 예정인 연수 기간 안. 연장으로 연수가 여러 개면 그중 하나에 들어가면 되고, 신청에는 그 연수 번호(`trId`)가 붙는다.
- 같은 날짜에 대기·승인 상태인 신청과 교시가 겹치면 거절한다(종일은 모든 교시와 겹친다). 취소·반려된 신청은 다시 낼 수 있다.
- 학생은 대기 중인 자기 신청만 취소할 수 있다. 승인·반려는 담당자 화면(LMS 또는 인트라넷, 미구현)에서 한다.

### 로컬 저장과 로그인

- 결석 신청은 저장소 루트 `.local-db/student/absences-sample.ndjson`(실제 추출본으로 실행하면 `absences-extract.ndjson`)에 쓴다. `.local-db/`는 Git에서 빠진다. 실제 데이터로 실행하면 학생 번호와 사유가 들어가므로 `data/`와 같이 다룬다.
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
-- RLS: 학생은 자기 student_no 행만 읽기·등록(status='pending'으로만), 취소는 대기 중인 자기 행만(함수로).
--      직원은 is_staff() 로 읽기, 승인·반려는 역할별 권한(HANDOFF 6-4)이 생긴 뒤 담당 역할만.
-- 기간·중복 확인은 enrollments 정규화 테이블이 생긴 뒤 트리거 또는 서버 함수로 옮긴다.
```

## 확인이 필요한 것

- 교시 수(지금 1~8, `server/core.ts`의 `PERIOD_COUNT`)와 캠퍼스별 차이. 시간표가 연결되면 그날 수업이 있는 교시만 보여 준다.
- 결석 종류(병결·공결·개인 사유)와 종류별 증빙(진단서 사진 등) 필요 여부.
- 신청 기한(지난 날짜를 며칠까지 받을지). 인트라넷 패널티 디자인에 '기한 후 신청 반려'가 있다. 지금은 연수 기간 안이면 모두 받는다.
- 승인 담당: LMS(교사)인지 인트라넷(매니저·오피스)인지.
- 학생 사진: 업체 포털의 `photo_url`은 업체 서버 주소라 쓰지 않았다. 사진 이관 방식 결정 후 붙인다.
