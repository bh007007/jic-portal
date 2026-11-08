# 레오님 할 일과 결정할 것

Claude가 대신할 수 없는 일(키·비밀번호 입력, 계정 만들기, 결정)을 모아 둔다. 끝난 항목은 지운다. 마지막 갱신 2026-11-09 아침.

## 머지 대기 PR (밤사이 머지는 권한 확인에 막혀 레오님이 해 주셔야 함)

PR이 CI를 통과하면 GitHub에서 **Merge pull request**를 누르거나 Claude에게 "머지"라고 말씀해 주세요. 머지하면 Cloudflare가 자동으로 배포한다. #38(인보이스 항목)은 11/9에 main에 들어갔고, 아래 세 PR에 합쳐 두었다(충돌 없음, 빌드 통과).

머지 전에 미리 보기:
- 첫 화면 https://feat-portal-hub.jic-portal-916.pages.dev/ (#37).
- 강사 포털 미리 보기 `/teacher/`는 Pages 빌드 명령을 바꾼 뒤에 열린다(아래 '머지할 때 같이 할 일').

| PR | 내용 | 순서 |
| --- | --- | --- |
| [#37](https://github.com/bh007007/jic-portal/pull/37) | JIC 포털 첫 화면(4개 포털 선택), 관리자 포털 `/admin`, 구조 문서, 이 목록 | 1 |
| [#39](https://github.com/bh007007/jic-portal/pull/39) | 강사 포털(LMS) 1차 `/teacher`: 학생(결석 신청 기록 포함)·성적(한 명씩·여러 명 한 번에)·자료실·시험 종류·강사 목록. #37 위에 쌓음 | 2 (#37 다음) |
| [#40](https://github.com/bh007007/jic-portal/pull/40) | 관리자 포털 '사용자·권한'(계정 목록, 강사 포털 역할 주기·회수), 기초관리 '휴일'(학생수 달력·강사 포털 홈에 표시), 학생 상세의 강사 포털 성적. #39 위에 쌓음 | 3 |
| [#42](https://github.com/bh007007/jic-portal/pull/42) | 강사 포털 출석 체크(날짜별 수업 → 학생별 출석·결석·지각, 모두 출석, 결석 신청 표시), 매니저 마감·사유 인정, 업체 출석 추출 스크립트. #40 위에 쌓음 | 4 (#40 다음) |
| [#44](https://github.com/bh007007/jic-portal/pull/44) | 권한표(docs/roles.md) 1단계: 관리자·오피스 구분, 사용자·권한은 관리자만, 강사 포털 성적·자료는 강사·매니저·관리자(체커·스케줄러·오피스 읽기만), 강사 포털 내부 공지. #42 위에 쌓음 | 5 (#42 다음) |
| (밤사이 추가되는 PR은 여기에 적는다) | | |

## 머지할 때 같이 할 일 (밤사이 권한 확인에 막힘: Supabase 적용·Cloudflare 설정은 배포로 분류됨)

말씀만 주시면 Claude가 한다("적용하기", "Cloudflare 바꿔").
- **Supabase 마이그레이션 적용**(새 테이블·함수만, 순서대로):
  - `supabase/migrations/20261108200000_teacher_portal.sql`(#39).
  - `supabase/migrations/20261108210000_user_directory.sql`(#40). 권한 시험 13개 통과.
  - `supabase/migrations/20261108220000_lms_absences.sql`(#39, 강사용 결석 신청 보기). #39 두 파일의 권한 시험 46개 통과.
  - `supabase/migrations/20261108230000_holidays.sql`(#40, 관리자 포털 기초관리 > 휴일. 직원만 쓰고 모든 포털이 읽음). 권한 시험 통과(#40 두 파일 합쳐 22개).
  - `supabase/migrations/20261109000000_attendance.sql`(출석 PR, 교실·수업·출석·마감 표 4개와 함수). 권한 시험 56개 통과. 표만 만들고 데이터는 넣지 않는다(업체 출석은 보안 점검 뒤).
  - `supabase/migrations/20261109010000_roles.sql`, `20261109020000_user_directory_admin.sql`(역할 PR, 함수·정책만). 권한 시험 50 + 35개 통과. 적용해도 지금 직원은 모두 관리자로 남는다(오피스 역할을 줄 때부터 나뉜다).
- **Cloudflare Pages 빌드 명령**: `npm run portal:build && npm run teacher:portal --if-present`로 바꾼다(#39 강사 포털을 `/teacher`에 넣음). `--if-present`라 머지 전에 바꿔도 깨지지 않는다.
- **강사 시험 계정**: 강사 포털을 보려면 Supabase Auth에 강사 계정이 하나 있어야 한다. 직원 계정(레오님)은 역할 없이도 들어가진다. 강사 계정이 필요하면 `docs/teacher-portal.md` '강사 계정 만들기'를 따른다.

## 직접 해 주셔야 하는 일

| # | 할 일 | 어디서 | 왜 |
| --- | --- | --- | --- |
| 1 | **학생 포털 서비스 키** | Cloudflare → Workers → `jic-student` → Settings → Variables and Secrets → Add → Secret. 이름 `SUPABASE_SERVICE_ROLE_KEY`, 값은 Supabase → Project Settings → API Keys의 secret 키 | 없으면 학생 포털 `/api`가 `server_config` 오류를 낸다. 11/8 밤 기준으로 아직 빠져 있다 |
| 2 | **JIC 포털(Pages) 서비스 키** | Cloudflare → Workers & Pages → `jic-portal`(Pages) → Settings → Variables and secrets → Add. Type은 **Secret**, 이름은 위와 같다 | 가드 태블릿(`/intranet/guard`)이 쓴다 |
| 3 | 가드 공용 계정 | Supabase → Authentication → Users → Add user(출입구마다 하나, Auto Confirm). 만든 사용자 id를 Claude에게 알려 준다 | Claude가 `guard_accounts`에 출입구를 잇는다 |
| 4 | 직원 이름·담당 캠퍼스 | Supabase SQL Editor 또는 Claude에게 이름을 알려 준다 | 처리자 이름(`staff_users.name`)과 상담 기록 열람 범위(`staff_campuses`)에 쓴다 |
| 4-1 | 오피스 직원 역할 주기(역할 PR 적용 뒤) | 관리자 포털 → 기초관리 → 사용자·권한 → 그 직원 줄에서 '오피스' 주기(캠퍼스 선택) | 권한표대로 오피스는 사용자·권한을 못 열고 강사 포털은 읽기만 한다. 주지 않으면 모든 직원이 관리자다 |
| 5 | 에이전시 가입 허용 | Supabase → Authentication → Sign In / Providers → **Allow new users to sign up** 켜기 | 에이전시 포털 등록 신청 |
| 6 | 학생 포털 로그인 시험 | https://jic-student.bh007007.workers.dev 에서 샘플 학생번호 + 생년월일 8자리로 로그인한다. 값은 `data-sample/tables/students.ndjson`의 `st_id`·`st_birthday`(가짜 데이터). 1번을 마친 뒤 한다 | 첫 로그인 → 비밀번호 변경 → 홈 |
| 7-1 | 업체 포털 연장·변경 추출 | 업체 포털에 로그인한 브라우저의 Console에 `scripts/extract/portal-extract-extend.js`를 붙여 넣는다(2~5분, 읽기 전용). 받은 파일은 `data/raw/`로 옮긴다 | 관리자 포털 '연장 현황'·'변경 이력'(업체 마케팅 > 연장현황, 신입·연장·복귀·변경) |
| 7 | 업체 포털 출석 추출 | 업체 포털(jicportal.com)에 관리자로 로그인한 브라우저의 Console에 `scripts/extract/portal-extract-attendance.js`를 붙여 넣는다(지난 90일, 5~15분, 읽기 전용, 비밀번호·급여·계좌·메모 열은 받지 않음). 받은 파일은 `data/raw/`로 옮긴다 | 강사 포털 출석을 업체 기록으로 이어 가려면(교사·교실·출석·마감). LMS 구조 조사는 11/9 회계 세션이 마쳤다 |

## 결정할 것

| # | 결정 | Claude 제안 |
| --- | --- | --- |
| 1 | **`jic-intranet` Worker 지우기** (11/8에 만들었는데 인트라넷이 Pages `/intranet`으로 옮겨 안 쓴다. 서비스 키가 들어 있다) | 지운다. 되돌릴 수 없어 확인을 받는다 |
| 2 | 강사 포털 계정을 직원 계정과 같은 체계로 둘지 | 같은 로그인(원칙 C6)으로 두고, 강사·체커·스케줄러·매니저는 `user_roles` 표(기획안 이름)의 역할로 나눈다. 관리자 포털 데이터(회계 등)는 보이지 않는다. 이렇게 만들었다(#39, 역할 주기는 #40 '사용자·권한') |
| 2-1 | **에이전시 관리 화면을 관리자 포털로 옮길지**. 지금은 직원이 에이전시 포털 안 `/admin`에서 가입 승인·회원·추천 규칙·콘텐츠·자료실·공지·방문 신청·통계·설정을 한다 | 옮긴다. 4개 포털 구조(직원 일 = 관리자 포털)에 맞고, 직원이 한 번 로그인으로 처리한다. 화면 9개(약 830줄)를 관리자 포털 '에이전시' 메뉴로 옮기고 에이전시 포털에서는 뺀다 |
| 2-2 | 강사 포털 언어 | 한국어·영어 둘 다 넣었다. 브라우저 언어가 한국어면 한국어, 아니면 영어로 시작한다. 필리핀 강사 기준으로 영어를 기본으로 할지 정한다 |
| 3 | **11/9 승인(초안 그대로)**, 1단계 적용(역할 PR). 역할 9개 권한표(원칙 C5) | 남은 것: 인트라넷 칸(인트라넷 담당), 스케줄러·매니저의 관리자 포털 읽기. `docs/roles.md` '적용 상태' |
| 6 | 회사 도메인 | 연결하면 `admin.`·`student.`·`agency.`·`teacher.`로 모은다(`docs/architecture.md`) |
| 7 | CEFR 대응 기준과 코스별 시험 주기(L3), 녹음 보관 기간(L9), 수업 자료 학생 공개(L8) | 화면에서 입력할 수 있게 빈칸으로 둔다. 기준이 정해지면 채운다 |
| 8 | 패널티 위반별 점수·경고 기준 | 인트라넷 점수표 화면에서 입력한다(코드에 넣지 않음) |
| 9 | Supabase 회사 계정·Pro 요금제(원칙 C1·C11), 실제 데이터 업로드 전 보안 점검(C12) | 대표 승인 대기 |

## 지금 상태 (요약)

- 첫 화면 https://jic-portal-916.pages.dev 에서 4개 포털을 고른다(관리자 `/admin/`, 인트라넷 `/intranet/`).
- 학생 포털·에이전시 포털은 Workers 주소에 있다. 강사 포털(LMS) 1차는 #39(머지·적용 뒤 `/teacher/`)에 있다.
- Supabase에는 샘플 데이터만 있다(11/8 다시 올림). 학생 샘플 계정은 91개다.
