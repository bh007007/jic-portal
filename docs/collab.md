# 작업 분담 (여러 Claude가 같은 저장소에서 일할 때)

작업을 시작하기 전에 이 문서를 읽는다. 학원 공식 계정으로 옮긴 뒤(`docs/accounts.md`, 11/9 결정)에는 소유 = JIC 어학원(레오님 Owner), 주 개발 = 썸머 매니저(PR 머지), 보조 = 레오님 개인 계정 Claude(이슈로 맡은 항목만 PR)다. 옮기면 아래 담당 표도 사람 기준으로 바꾼다. 담당 밖의 파일을 고쳐야 하면 먼저 PR 설명이나 사용자에게 알린다.

## 담당
| 영역 | 폴더·파일 | 담당 |
| --- | --- | --- |
| 관리자 앱 | `apps/admin` (특히 `server/core.ts`) | 레오 PC의 Claude |
| 파트너 포털 | `apps/partner` | 레오 PC의 Claude |
| 배포용 서버 | `functions/` (`functions/intranet/`은 인트라넷 담당) | 레오 PC의 Claude |
| 학생 앱 | `apps/student` | 다른 계정의 Claude |
| 인트라넷 | `apps/intranet` | 다른 계정의 Claude (11/8 사용자 진행 요청) |
| 강사 포털(LMS) | `apps/teacher`, `functions/teacher/` | 레오 PC의 Claude (11/8) |
| JIC 포털 첫 화면 | `apps/admin/src/pages/Hub.tsx`, `apps/admin/src/portals.ts` | 레오 PC의 Claude |
| DB 변경 | `supabase/migrations/` | 각자 자기 앱용 **새 파일만** 추가 |
| Supabase 적용, Cloudflare 배포, 업체 포털 추출 | 대시보드·레오 PC | 레오 PC의 Claude (계정 접근이 있는 쪽) |

## 함께 쓰는 파일 규칙
- **루트 `package.json`**: `scripts`에 자기 앱 줄만 더한다(`student`, `student:build` 등). 다른 줄은 고치지 않는다.
- **`package-lock.json`**: 충돌이 나면 main 쪽을 받은 뒤 `npm install`로 다시 만든다.
- **`.github/workflows/ci.yml`**: 자기 앱 빌드 줄 하나만 더한다.
- **`HANDOFF.md`, `README.md`**: 자기 앱 항목만 고친다. 표의 다른 줄은 그대로 둔다.
- **`data-sample/`**: `scripts/make-sample-data.mjs`로만 바꾼다. 새 필드는 별도 시드로 만들어 기존 학생·연수 값이 바뀌지 않게 한다.
- **학생 신청 공용 모듈**: 결석·외박 신청의 모양과 규칙은 `apps/student/server/requests.ts`, 생활 요청은 `apps/student/server/lifeRequests.ts`, 학교 여행은 `apps/student/server/trips.ts` 한 곳이다. 인트라넷이 승인·반려에 같이 쓰고, 로컬에서는 같은 파일(`.local-db/student`)을 연다. LMS가 결석 승인을 맡게 되면 같은 모듈을 쓴다.
- **학생 앱·인트라넷의 관리자 core 의존**: `apps/student`와 `apps/intranet`은 `apps/admin/server/core.ts`의 `createDb`·`studentDetail`과 `server/localData.ts`의 `loadDir`을 가져다 쓴다. 이 응답 모양을 바꾸면 `npm run student:build`도 확인한다(CI가 함께 빌드한다).
- **포털 구조(11/8 사용자 결정)**: 관리자(인트라넷 포함)·학생·에이전시·강사(LMS) 4개 포털, DB는 Supabase 하나. `docs/architecture.md`. 주소 `/` = JIC 포털 첫 화면(포털 선택), `/admin/` = 관리자 포털(11/8 옮김, 예전 주소 `/students` 등은 `/admin/…`로 넘어감), `/intranet/` = 인트라넷, `/teacher/` = 강사 포털 예정. 인트라넷의 '통합관리'(`/`)와 학생 상세 링크(`/students/…`)는 첫 화면·넘김으로 그대로 동작한다. 바로 가려면 `/admin/`으로 바꾼다.
- **인트라넷은 포털 주소 아래(`/intranet`)**: 루트 `admin:build`가 관리자 앱 빌드 뒤 인트라넷을 `apps/admin/dist/intranet`에 넣는다(11/8, Cloudflare 빌드 설정을 바꾸지 않으려고 인트라넷 담당이 이 줄에 더함). 관리자 앱의 출력 폴더나 `/intranet` 경로를 바꾸면 인트라넷 담당에게 알린다. 로그인 저장 키는 두 앱 모두 Supabase 기본값(같은 주소라 한 번 로그인).
- **개발 서버 포트**: 관리자 5173(샘플 데이터 실행 5174), 파트너 5175, 학생 5176, 인트라넷 5177. 새 앱은 5178부터.

## 데이터베이스 규칙
- 마이그레이션 파일 이름은 `YYYYMMDDHHMMSS_설명.sql`로 하고, main에 있는 마지막 파일보다 뒤 시각을 쓴다.
- 여러 번 실행해도 되게 쓴다(`if not exists`, `drop policy if exists`, `on conflict do nothing`).
- **한 파일만 다시 돌리지 않는다.** 뒤 파일이 같은 함수·정책을 `create or replace`로 고친 경우가 있어(예: `teacher_portal` 뒤의 `attendance`·`roles`·`lms_students_extend`), 앞 파일만 다시 돌리면 옛 정의로 돌아간다. 다시 돌릴 때는 그 파일부터 끝까지 파일 이름 순서대로 돌린다(11/9 운영에서 실제로 생겨 바로잡음).
- 프로젝트는 'Automatically expose new tables'가 꺼져 있다. 새 테이블마다 `grant`를 직접 쓰고 RLS를 켠다.
- 이미 있는 권한 함수는 `is_staff()`(직원)와 `is_partner()`(승인된 에이전시 지점)다. 새 역할은 새 함수로 만든다(예: `is_student()`). 기존 함수의 뜻은 바꾸지 않는다.
- 학생 앱·인트라넷이 더한 권한 함수: `is_student()`·`current_student_no()`(학생), `is_guard()`·`current_guard_campus()`(가드 공용 계정), `staff_has_campus(캠퍼스)`(직원이 맡은 캠퍼스, `staff_campuses`). `20261108100000_student_intranet.sql`. 직원끼리 이름을 보는 `staff_directory()`(`20261108130000_intranet_deploy.sql`, `staff_users` RLS 는 그대로). 학생 계정 만들기·초기화 접근 기록 `student_account_audit()`(`20261108180000_student_account_admin.sql`), 가드 계정 접근 기록 `guard_account_audit()`(`20261108190000_guard_account_admin.sql`). 인트라넷 패널티 점수표 고치기·접근 기록 읽기는 관리자만(`is_admin()`, `20261109070000_intranet_roles.sql`이 `20261108100000`의 `rules_staff`·`stages_staff`·`audit_read` 정책을 바꾼다. 그 파일을 다시 실행하면 이 파일도 다시 실행한다). 상담 범위 `counseling_campus_ok(캠퍼스)`·이름 `counseling_actor_name()`(`20261109110000_intranet_manager_counseling.sql`이 `20261108100000`의 상담 함수 6개를 다시 만든다. 그 파일을 다시 실행하면 이 파일도 다시 실행한다). 인트라넷 매니저(강사 포털 manager)에게 여는 범위 `is_intranet_manager()`(`20261109100000_intranet_manager.sql`, `decide_absence_requests`·`intranet_absence_marks`·`staff_directory`도 매니저까지 넓힘. 앞 파일들을 다시 실행하면 이 파일도 다시 실행한다). 매니저가 맡은 캠퍼스 `intranet_manager_campus_ok(캠퍼스)`(`20261109170000_intranet_decisions.sql`이 `20261109100000`의 `penalties_manager_decide` 정책과 `20261108190000`의 `guard_account_audit()`(관리자만)를 바꾼다. 그 파일들을 다시 실행하면 이 파일도 다시 실행한다). 학생 앱 시간표 `student_timetable(시작, 끝)`(학생 본인 수업·출석만, 강사 메모 제외, `20261109140000_student_timetable.sql`, 강사 포털 표 권한은 그대로). 인트라넷 무단결석 후보용 결석 읽기 `intranet_absence_marks(시작, 끝)`(직원만, 강사 포털 `attendance`는 읽기만, 패널티 출처에 `attendance` 추가, `20261109050000_absence_penalties.sql`), 자동 확인(크론)용 `intranet_absence_marks_service(시작, 끝)`(서비스 키만, `20261109180000_intranet_cron.sql`). `audit_logs` 종류 목록은 두 파일이 같은 목록을 쓴다(어느 쪽을 다시 실행해도 지워지지 않게).
- 강사 포털(LMS)이 더한 권한 함수: `has_role(역할[])`, `is_lms_user()`(강사·체커·스케줄러·매니저 또는 직원), `is_lms_manager()`(매니저 또는 직원), `my_roles()`, `current_lms_name()`, 강사용 학생 목록 `lms_students(날짜)`(`legacy_*` 권한은 그대로), 강사용 결석 신청 보기 `lms_absences(시작, 끝)`(사유 글 제외, `20261108220000_lms_absences.sql`). 역할 표 `user_roles`(기획안 이름). `20261108200000_teacher_portal.sql`. 성적 `test_results`는 학생 본인도 읽는다(학생 포털에서 쓸 수 있음).
- 관리자 포털 '사용자·권한' 화면: `user_directory(학생 포함 여부)`(직원만, 로그인 계정과 사용자 종류별 표를 한 줄로). `20261108210000_user_directory.sql`. 직원 이름 고치기 `staff_set_name(사용자, 이름)`(관리자만, `20261109120000_staff_name.sql`).
- 휴일 `holidays`(업체 기초코드관리 > 휴일): 관리자 포털 직원만 쓰고 로그인한 모든 포털이 읽는다. 캠퍼스 `''` = 모든 캠퍼스. 출석·달력에서 쉬는 날을 볼 때 이 표를 쓴다. `20261108230000_holidays.sql`.
- 권한 시험은 `supabase/tests/*.mjs`에 둔다. PGlite(Postgres WebAssembly)에 Supabase 흉내를 만들어 역할별로 읽기·쓰기를 확인한다(의존성에 넣지 않고 `npm i --no-save`로 임시 설치). CI가 함께 돌리므로 `legacy_tables`처럼 시험이 쓰는 마이그레이션을 바꾸면 결과를 확인한다. `pg-supabase.mjs`는 Supabase Auth·REST를 흉내 내는 시험 서버다.
- `legacy_*`(업체 원본)는 직원만 읽는다. 다른 앱을 위해 이 RLS를 넓히지 않는다. 필요하면 security definer 함수나 그 앱용 테이블을 만든다.
- `auth.users`에는 `on_partner_signup` 트리거가 있다. 메타데이터 `portal='partner'`일 때만 동작한다. 다른 앱은 다른 `portal` 값을 쓴다.
- 기획안(`docs/plan.md` 데이터 모델)의 테이블 이름을 따른다(원칙 C10).

## 브랜치·PR
- 브랜치 하나에 한 영역만 담는다(`feat/student-…`, `feat/partner-…`, `feat/admin-…`).
- 시작 전과 PR 전에 최신 main을 받는다.
- PR 설명에 Supabase에 적용할 마이그레이션 파일 이름을 적는다. 적용은 레오 PC의 Claude가 한다.
- 실제 학생 데이터(`data/`)는 레오 PC에만 있다. 다른 곳에서는 `data-sample/`로만 개발한다.

## 열린 결정 (진행 전에 사용자 확인)
- 학생 계정 생성 담당(방식은 11/8 결정: 학생 번호와 생년월일로 미리 생성, 첫 로그인 때 비밀번호 변경, 원칙 V4)
- 정규화 스키마(`docs/plan.md`)로 옮기는 시점. `core.ts`와 `functions/`를 크게 바꾸므로 관리자 앱 담당이 진행한다.
