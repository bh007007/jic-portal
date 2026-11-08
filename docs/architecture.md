# JIC 포털 구조 (2026-11-08)

JIC 포털은 사용자 종류로 나눈 **4개 포털**과 **하나의 DB**로 이루어진다(사용자 결정 2026-11-08, 원칙 C1·C2·C5·C6). 새 화면과 테이블은 반드시 이 넷 중 하나에 속한다.

| 포털 | 쓰는 사람 | 주소 (지금) | 코드 | 로그인 계정 표 | 상태 |
| --- | --- | --- | --- | --- | --- |
| **첫 화면** | 모두 | `/` (https://jic-portal-916.pages.dev) | `apps/admin/src/pages/Hub.tsx` | 없음(각 포털로 이동) | 동작 |
| 1. **관리자 포털** (인트라넷 포함) | 직원·관리자, 가드(태블릿) | `/admin/`, 인트라넷 `/intranet/`, 가드 태블릿 `/intranet/guard` | `apps/admin`, `apps/intranet`, `functions/` | `staff_users`, `guard_accounts` | 동작 |
| 2. **학생 포털** | 재학생·입학 예정 학생 | https://jic-student.bh007007.workers.dev | `apps/student` | `student_users` | 배포(11/8) |
| 3. **에이전시 포털** | 유학원·에이전시 지점 | https://jic-partner.bh007007.workers.dev | `apps/partner`(코드 이름 partner) | `agency_members` | 배포(11/8) |
| 4. **강사 포털 (LMS)** | 강사·체커·스케줄러·매니저 | `/teacher/` | `apps/teacher` (`docs/teacher-portal.md`) | `user_roles`(teacher·checker·scheduler·manager), 직원 | 1차(11/8): 학생·성적·자료실·시험 종류·강사 목록. 출석은 업체 시간표 연결 뒤 |

## DB 하나

- Supabase 프로젝트 `jic-portal`(ref `isayrrexurledojngqbx`, 싱가포르) 하나에 모든 테이블과 로그인 계정이 있다. 포털마다 DB나 프로젝트를 따로 만들지 않는다.
- 같은 데이터는 한 곳에서만 쓴다(원칙 C2). 예: 결석 신청은 학생 포털이 쓰고, 승인은 직원 화면이 쓴다. 출석·시험 결과는 강사 포털(LMS)이 쓴다(원칙 L1).
- 로그인 계정은 Supabase Auth 하나다. 사용자 종류는 계정 표로 나눈다. 한 사람이 여러 표에 있을 수 있다.
  - 직원 `staff_users` / `is_staff()`. 역할 세분화는 HANDOFF 6-4(원칙 C5의 9개 역할)이고, 화면별 권한표 초안은 `docs/roles.md`다.
  - 학생 `student_users` / `is_student()`. 학생번호@students.jic.internal, 첫 로그인 때 비밀번호를 바꾼다.
  - 에이전시 `agency_members` / `is_partner()`. 가입 신청 뒤 관리자가 승인한다.
  - 가드 `guard_accounts` / `is_guard()`. 출입구마다 공용 계정이다.
  - 강사 포털 `user_roles`(teacher·checker·scheduler·manager) / `is_lms_user()`·`is_lms_manager()`. 기획안의 역할 표이고, 나중에 다른 사용자 종류도 여기로 모을 수 있다(결정 대기, `docs/leo-todo.md`).
- 업체 포털 원본은 아직 `legacy_*`(jsonb 그대로)이다. 정규화 스키마(HANDOFF 6-3)로 옮겨야 "한 DB"가 완성된다. 에이전시 포털의 `campuses`·`courses`도 그때 관리자 쪽 기준 데이터와 합친다.

## 주소와 로그인

- 관리자 포털·인트라넷·강사 포털은 Cloudflare Pages 프로젝트 `jic-portal` 하나의 주소 아래에 둔다.
  - 같은 주소라 직원은 한 번 로그인으로 오간다(원칙 C6, Supabase 로그인 저장 키 공유).
  - 빌드는 `npm run admin:build`이다(관리자 앱 + 인트라넷 `/intranet`, PR #36). `portal:build`도 같은 명령이다. Cloudflare Pages 빌드 명령은 11/8에 `npm run portal:build`로 바꿔 두었고, 결과는 같다.
- 학생·에이전시 포털은 Cloudflare Workers(`jic-student`, `jic-partner`)이다. Pages 프로젝트는 같은 저장소로 하나만 만들 수 있다.
- 회사 도메인을 연결하면 `admin.` · `student.` · `agency.` · `teacher.` 처럼 한 도메인 아래로 모으고, 첫 화면의 `VITE_STUDENT_URL`·`VITE_PARTNER_URL`·`VITE_TEACHER_URL`만 바꾼다.
- 관리자 포털은 11/8부터 `/admin/` 아래다. 예전 주소(`/students` 등)는 `/admin/…`로 넘어간다.

## 정리할 것

- `jic-intranet` Worker(11/8 만듦)는 쓰지 않는다. 인트라넷이 Pages 안 `/intranet`으로 옮겨졌다(PR #35). 서비스 키가 들어 있어 지우는 것이 좋다(사용자 확인 뒤).
- 강사 포털(LMS)을 만들기 전에 업체 포털의 수업 시간표·출석·강사 화면 구조를 조사해야 한다(원칙 V1·V6). 1차 범위는 메뉴 검토표 'LMS' 시트를 따른다(출석 체크, 출석 확인, 무단결석 목록, 성적, 수업 자료 목차, 휴대폰 기준 화면 L7).
