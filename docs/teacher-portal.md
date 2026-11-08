# 강사 포털 (LMS, `apps/teacher`)

JIC 포털 4개 포털 중 네 번째다(`docs/architecture.md`). 11/8 사용자 결정에 따라 **LMS = 강사 포털**이고, 이 저장소에서 만든다. 기준은 메뉴 검토표 'LMS' 시트와 원칙 L1~L10이다.

- **쓰는 사람**: 강사·체커·스케줄러·매니저(역할 `user_roles`), 그리고 직원(관리자 포털 계정)이다.
- **화면**: 휴대폰 기준이다(원칙 L7). 아래쪽 메뉴는 홈·학생·성적·자료실·더보기 5개다.
- **언어**: 한국어와 영어다(필리핀 강사). 브라우저 언어가 한국어면 한국어, 아니면 영어로 시작하고 위쪽 버튼으로 바꾼다. 문구는 `src/i18n.tsx` 한 곳에 있고 한국어가 기준이다.
- **주소**: JIC 포털 아래 `/teacher/`다. 관리자 포털·인트라넷과 같은 주소라 직원은 한 번 로그인으로 오간다(원칙 C6).
- **서버 코드**: 없다. 화면이 Supabase를 바로 부르고 권한은 RLS가 막는다. 강사용 학생 목록만 DB 함수(`lms_students`)로 받는다.

## 1차 화면 (11/8)

| 화면 | 내용 | 쓰기 |
| --- | --- | --- |
| 홈 | 오늘 날짜, 재학·30일 안 입학 인원(캠퍼스별), 최근 입력한 성적 | - |
| 학생 | 재학 / 30일 안 입학, 이름·학생번호·국적·코스 검색, 캠퍼스 필터 | - |
| 학생 상세 | 연수(캠퍼스·코스·기숙사·기간·배치), 성적 입력, 시험 종류별 성적 기록(CEFR 추정 레벨) | 강사 이상 |
| 성적 입력 | 학생 검색 → 시험 종류 → 영역별 점수(채운 칸만 저장) | 강사 이상 |
| 자료실 | 코스 → 교재 → 단원 → 자료(구글 드라이브 링크) 목차, 추가·삭제 | 강사 이상(삭제는 올린 사람·매니저) |
| 결석 신청 (홈 '오늘' + 더보기 › 날짜별) | 학생 포털에서 낸 결석 신청: 학생·캠퍼스·교시·종류(병결·공결·개인)·처리 상태. 사유 글은 보이지 않는다(원칙 L4 '출석에 사유 표시') | 보기만(승인은 인트라넷) |
| 더보기 › 시험 종류·CEFR | 시험 종류 추가·사용 중지, CEFR 대응 점수 입력 | 매니저·직원 |
| 더보기 › 강사 목록 | 강사 등록(이름, 부르는 이름, 캠퍼스, 업체 교사 번호), 퇴직·복직 | 매니저·직원 |

**준비 중**(더보기에 이유와 함께 표시, 원칙 C8):
- **업체 수업 시간표를 연결해야 함**(원칙 V1·V6): 출석 체크, 출석 확인·사유별 합계, 무단결석 목록, 수업 변경·옵션 클래스.
- **결석 신청 승인**: 지금은 인트라넷에서 한다(L4, 같은 DB 함수를 쓰게 할 예정).
- **결정이 필요함**: 그로스 리포트·Daily Recall(L10), 녹음(L9 보관 기간).

## 데이터 (`supabase/migrations/20261108200000_teacher_portal.sql`)

테이블 이름은 기획안 데이터 모델을 따른다.

| 테이블 | 뜻 | 읽기 | 쓰기 |
| --- | --- | --- | --- |
| `user_roles` | 역할(teacher·checker·scheduler·manager·office·admin, 캠퍼스) | 본인, 직원 | 직원 |
| `staff` | 강사 목록(로그인 계정 없이도, 업체 교사 번호 `legacy_id`) | 강사 포털 사용자 | 매니저·직원 |
| `test_types` | 시험 종류(척도·범위·단위·영역). IELTS·TOEIC만 기본으로 넣음 | 강사 포털 사용자, 학생 | 매니저·직원 |
| `cefr_mappings` | 시험 종류별 CEFR 하한 점수(JIC 기준 추정 레벨, L3 미결정이라 비어 있음) | 강사 포털 사용자, 학생 | 매니저·직원 |
| `test_results` | 성적(학생번호·연수·시험 종류·날짜·영역·점수). 범위·단위·영역·날짜는 트리거가 확인하고, 기록자 이름은 서버가 넣는다 | 강사 포털 사용자, 학생 본인 | 강사 이상(고치기·지우기는 쓴 사람·매니저) |
| `materials` | 수업 자료 목차(https 링크만). 학생 공개는 미결정이라 기본 비공개 | 강사 포털 사용자 | 강사 이상(고치기·지우기는 올린 사람·매니저) |

함수는 다음과 같다.
- `has_role(역할[])`, `is_lms_user()`(강사·체커·스케줄러·매니저 또는 직원), `is_lms_manager()`(매니저 또는 직원).
- `my_roles()`, `current_lms_name()`.
- `lms_students(날짜)`: 재학·30일 안 입학 연수의 화면용 열만 준다. 연락처·여권·금액은 주지 않는다. `legacy_*` 권한은 넓히지 않았다.
- `lms_absences(시작, 끝)`(`20261108220000_lms_absences.sql`): 결석 신청 중 취소되지 않은 것을 학생·캠퍼스·교시·종류·상태만 준다. 기간은 31일 안이다.

권한 시험은 `supabase/tests/teacher_portal_rls.mjs`(46개)이고 CI가 돌린다.

## 강사 계정 만들기 (관리자 포털 '사용자·권한' 화면이 생길 때까지)

1. Supabase → Authentication → Users → **Add user**: 이메일, 비밀번호, Auto Confirm.
2. SQL Editor에서 역할과 강사 목록을 잇는다.

   ```sql
   insert into public.user_roles (user_id, role) values ('<사용자 id>', 'teacher') on conflict do nothing;
   insert into public.staff (user_id, name, nickname, campus) values ('<사용자 id>', '이름', 'Teacher …', 'Premium');
   ```

   역할은 `teacher`·`checker`·`scheduler`·`manager` 중에서 고른다. 매니저는 시험 종류·강사 목록을 관리한다. 관리자 포털 직원(`staff_users`)은 역할 없이도 강사 포털을 쓴다.

## 실행

- **로컬**: `apps/teacher/.env.example` → `.env.local`, `npm run teacher` → http://127.0.0.1:5178. 데이터는 Supabase에 있다.
- **로컬 시험 서버로 화면 보기**:
  - `node supabase/tests/pg-supabase.mjs 54321`(가짜 Supabase, 샘플 데이터)로 띄운다.
  - `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anon-key npm run teacher`로 실행한다.
  - 시험 계정은 `/__user`·`/__sql`로 만든다. 11/8에 이 방식으로 로그인·홈·학생·성적 입력·자료 추가를 확인했다.
- **검증**: `npm run teacher:build`.
- **배포**: Cloudflare Pages 빌드 명령 끝에 `npm run teacher:portal`을 붙인다. 11/8에 `npm run portal:build && npm run teacher:portal --if-present`로 바꿔 두었다(머지 전에도 깨지지 않게 `--if-present`).
  - 출력은 `apps/admin/dist/teacher`다.
  - `functions/teacher/[[path]].ts`가 `/teacher/…` 화면 주소에 강사 포털 `index.html`을 준다.

## 다음

- 업체 포털 수업 시간표·출석·교사 구조 조사(`scripts/extract/portal-probe-lms.js`, 레오님 브라우저) → 추출 → `class_sessions`·`class_enrollments`·`attendance`.
- 그 뒤에 출석 체크(휴대폰), 출석 확인, 무단결석 목록(인트라넷 패널티로 넘김)을 만든다.
- 학생 포털에 내 성적·CEFR 성장선(원칙 L2)을 보인다. 학생 앱 담당과 맞춘다. `test_results`는 학생 본인이 읽을 수 있다.
