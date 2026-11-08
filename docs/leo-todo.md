# 레오님 할 일과 결정할 것

Claude가 대신할 수 없는 일(키·비밀번호 입력, 계정 만들기, 결정)을 모아 둔다. 끝난 항목은 지운다. 마지막 갱신 2026-11-08 밤.

## 머지 대기 PR (밤사이 머지는 권한 확인에 막혀 레오님이 해 주셔야 함)

PR이 CI를 통과하면 GitHub에서 **Merge pull request**를 누르거나 Claude에게 "머지"라고 말씀해 주세요. 머지하면 Cloudflare가 자동으로 배포한다.

| PR | 내용 | 순서 |
| --- | --- | --- |
| [#37](https://github.com/bh007007/jic-portal/pull/37) | JIC 포털 첫 화면(4개 포털 선택), 관리자 포털 `/admin`, 구조 문서, 이 목록 | 1 |
| [#39](https://github.com/bh007007/jic-portal/pull/39) | 강사 포털(LMS) 1차 `/teacher`: 학생·성적·자료실·시험 종류·강사 목록. #37 위에 쌓음 | 2 (#37 다음) |
| (밤사이 추가되는 PR은 여기에 적는다) | | |

## 머지할 때 같이 할 일 (밤사이 권한 확인에 막힘: Supabase 적용·Cloudflare 설정은 배포로 분류됨)

말씀만 주시면 Claude가 한다("적용하기", "Cloudflare 바꿔").
- **Supabase 마이그레이션 적용**: `supabase/migrations/20261108200000_teacher_portal.sql`(#39). 새 테이블·함수만 만든다. 권한 시험 38개 통과.
- **Cloudflare Pages 빌드 명령**: `npm run portal:build && npm run teacher:portal --if-present`로 바꾼다(#39 강사 포털을 `/teacher`에 넣음). `--if-present`라 머지 전에 바꿔도 깨지지 않는다.
- **강사 시험 계정**: 강사 포털을 보려면 Supabase Auth에 강사 계정이 하나 있어야 한다. 직원 계정(레오님)은 역할 없이도 들어가진다. 강사 계정이 필요하면 `docs/teacher-portal.md` '강사 계정 만들기'를 따른다.

## 직접 해 주셔야 하는 일

| # | 할 일 | 어디서 | 왜 |
| --- | --- | --- | --- |
| 1 | **학생 포털 서비스 키** | Cloudflare → Workers → `jic-student` → Settings → Variables and Secrets → Add → Secret. 이름 `SUPABASE_SERVICE_ROLE_KEY`, 값은 Supabase → Project Settings → API Keys의 secret 키 | 없으면 학생 포털 `/api`가 `server_config` 오류를 낸다. 11/8 밤 기준으로 아직 빠져 있다 |
| 2 | **JIC 포털(Pages) 서비스 키** | Cloudflare → Workers & Pages → `jic-portal`(Pages) → Settings → Variables and secrets → Add. Type은 **Secret**, 이름은 위와 같다 | 가드 태블릿(`/intranet/guard`)이 쓴다 |
| 3 | 가드 공용 계정 | Supabase → Authentication → Users → Add user(출입구마다 하나, Auto Confirm). 만든 사용자 id를 Claude에게 알려 준다 | Claude가 `guard_accounts`에 출입구를 잇는다 |
| 4 | 직원 이름·담당 캠퍼스 | Supabase SQL Editor 또는 Claude에게 이름을 알려 준다 | 처리자 이름(`staff_users.name`)과 상담 기록 열람 범위(`staff_campuses`)에 쓴다 |
| 5 | 에이전시 가입 허용 | Supabase → Authentication → Sign In / Providers → **Allow new users to sign up** 켜기 | 에이전시 포털 등록 신청 |
| 6 | 학생 포털 로그인 시험 | https://jic-student.bh007007.workers.dev 에서 샘플 학생번호 + 생년월일 8자리로 로그인한다. 값은 `data-sample/tables/students.ndjson`의 `st_id`·`st_birthday`(가짜 데이터). 1번을 마친 뒤 한다 | 첫 로그인 → 비밀번호 변경 → 홈 |
| 7 | (다른 세션이 못 하면) 업체 포털 LMS 구조 조사 | 업체 포털에 로그인한 브라우저의 Console에 `scripts/extract/portal-probe-lms.js`를 붙여 넣는다. 받은 파일은 `data/raw/`로 옮긴다 | 강사 포털의 시간표·출석을 업체 데이터로 채우려면 구조가 필요하다 |

## 결정할 것

| # | 결정 | Claude 제안 |
| --- | --- | --- |
| 1 | **`jic-intranet` Worker 지우기** (11/8에 만들었는데 인트라넷이 Pages `/intranet`으로 옮겨 안 쓴다. 서비스 키가 들어 있다) | 지운다. 되돌릴 수 없어 확인을 받는다 |
| 2 | 강사 포털 계정을 직원 계정과 같은 체계로 둘지 | 같은 로그인(원칙 C6)으로 두고, 강사·체커·스케줄러는 `lms_members` 표의 역할로 나눈다. 관리자 포털 데이터(회계 등)는 보이지 않는다. 일단 이렇게 만들고 있다 |
| 3 | 역할 9개 권한표(원칙 C5: 학생, 선생님, 체커, 스케줄러, 매니저, 오피스, 관리자, 가드, 에이전시 지점) | 화면별 읽기/쓰기 표를 만들어 보고한다. 지금은 직원이면 관리자 포털을 모두 본다 |
| 4 | 결석 승인 화면 위치(원칙 L4는 LMS의 매니저, 지금은 인트라넷에 있음) | 승인 기능은 DB 함수 하나로 두고, 두 화면 모두에서 같은 함수를 부른다 |
| 5 | 출석 입력자(선생님 또는 체커, 메뉴 검토표 미결정) | 둘 다 입력할 수 있게 하고, 마감은 매니저가 한다 |
| 6 | 회사 도메인 | 연결하면 `admin.`·`student.`·`agency.`·`teacher.`로 모은다(`docs/architecture.md`) |
| 7 | CEFR 대응 기준과 코스별 시험 주기(L3), 녹음 보관 기간(L9), 수업 자료 학생 공개(L8) | 화면에서 입력할 수 있게 빈칸으로 둔다. 기준이 정해지면 채운다 |
| 8 | 패널티 위반별 점수·경고 기준 | 인트라넷 점수표 화면에서 입력한다(코드에 넣지 않음) |
| 9 | Supabase 회사 계정·Pro 요금제(원칙 C1·C11), 실제 데이터 업로드 전 보안 점검(C12) | 대표 승인 대기 |

## 지금 상태 (요약)

- 첫 화면 https://jic-portal-916.pages.dev 에서 4개 포털을 고른다(관리자 `/admin/`, 인트라넷 `/intranet/`).
- 학생 포털·에이전시 포털은 Workers 주소에 있다. 강사 포털(LMS)은 만드는 중이다.
- Supabase에는 샘플 데이터만 있다(11/8 다시 올림). 학생 샘플 계정은 91개다.
