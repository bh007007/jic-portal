# 정규화 스키마 (legacy → 화면용 표)

지금 배포 화면은 업체 원본 표 `legacy_*`(행마다 jsonb)를 요청 때마다 통째로 읽어 계산한다(`functions/api/[[path]].ts`). 실제 데이터(학생 5천여 명)를 올리기 전에, 기획안 'DB 이관 전략'의 두 층 구조대로 화면이 읽을 정규화 표를 만들고 조건 조회로 바꾼다.

**적용 시점(11/10 레오님 결정)**: 코드는 지금 만들고, 적용은 학원 계정의 새 Supabase 프로젝트를 만들 때 처음부터 한다(`docs/accounts.md`). 지금 개인 계정 운영 DB에는 적용하지 않아도 된다. 적용해도 빈 표라 화면은 그대로다.

## 원칙

- **두 층**: `legacy_*`는 업체 추출본 그대로(다시 맞춰 보기용). 화면용 표는 설계표 이름(snake_case, `student_no`, `created_at`·`updated_at`)을 쓴다.
- **업체 번호를 키로**: 학생 `student_no` = `st_id`, 연수 `enrollments.id` = `tr_id`, 연장 `id` = `tt_id`. 다른 포털 표(학생 계정 `student_users.student_no`, 출석·성적, 변경 요청 `tr_id`)가 이미 이 번호를 쓰므로 바꾸지 않는다. 업체에서 온 행에는 `legacy_id`를 남긴다.
- **채우기는 SQL 한 곳**: `load_core_from_legacy()`(서비스 키만)가 `legacy_*`를 읽어 upsert한다. 다시 돌려도 같은 결과다. 원본에서 사라진 행은 지우지 않는다(다른 표가 가리킬 수 있어서).
- **규칙은 core와 같게**: 종료일(연장 반영)·상태는 `apps/admin/server/core.ts`의 `finishOf`·`statusOf`와 같은 규칙을 뷰·함수로 둔다(`enrollment_periods`, `enrollment_status()`). 시험이 샘플 전체로 맞춰 본다.
- **권한**: 직원(`is_staff()`)만 읽는다. 쓰기는 서비스 키뿐이다. 모듈을 JIC 포털로 넘길 때(기획안 '모듈별 전환') 그 표의 쓰기 정책을 더한다.

## 1단계: 학생·연수 (`20261110110000_core_schema.sql`, 11/10)

| 표 | 키 | 업체 원본 | 주요 열 |
| --- | --- | --- | --- |
| `students` | `student_no` | `legacy_students`(st_*) | 이름·성·이름, 생일, 성별(M·F), 국적 이름, 이메일, 전화, 언어, VIP 등급 |
| `batches` | `id` = 기수 이름(sd_name) | 연수 행의 sd_* | 출국일, 입학일 |
| `enrollments` | `id` = tr_id | `legacy_enrollments`(tr_*) | 학생, 기수, 캠퍼스 코드, 코스·기숙사 요약, 시작·원래 종료일, 주 수, 업체 상태(코드·이름), 인보이스 국적, 에이전시·담당자·지점, 납부 상태·기한, 출국·귀국일, 픽업, 방·포인트 정산 여부, 메모, 인보이스 시각 |
| `enrollment_extensions` | `id` = tt_id | `legacy_extensions`(tt_*) | 연수, 시작·종료일, 주 수, 메모, 등록 시각 |
| 뷰 `enrollment_periods` | | | 종료일 = 원래 종료일과 마지막 연장 종료일 중 늦은 날, 연장 횟수 |
| 함수 `enrollment_status(상태 이름, 시작, 종료, 기준일)` | | | cancelled·upcoming·current·graduated·other |

- 학생 목록에 없는 학생의 연수는 연수 행의 이름으로 학생을 만든다(연수가 빠지지 않게).
- 업체 시각(`tr_invoice_dt` 등)은 필리핀 시각으로 읽는다. 빈 값·잘못된 값은 null, 글자 열의 빈 값은 ''.
- 이름이 겹치는 표: `campuses`·`courses`는 파트너 포털 소개 내용(20261107010000)이다. 그래서 1단계 연수에는 업체 캠퍼스 코드(`PREMIUM` 등)와 코스 요약을 글자로 둔다. 기준 코드는 2단계에서 정한다.
- 시험 `supabase/tests/core_schema.mjs`(28개): 샘플 건수, 값 바꾸기, 연수 239건의 종료일·상태가 core 규칙과 모두 같음, 두 번 돌려도 같음, 직원만 읽기.

### 1단계 보강과 5단계 어댑터 (`20261110120000_core_schema_more.sql`, 11/10)

- 관리자 core가 연수 행에서 읽는 열을 마저 더했다: 통화, 인보이스 국적 영문, 납부 상태 코드, 에이전시 영문, 메모(학생·은행·회계·지점 영문), 취소·연수 중 취소·연기·퇴교 날짜와 메모, 픽업 항공편, 학생 국적 코드, 추가 기수 여부. `load_core_from_legacy()`는 이 파일의 것이 최신이다(1단계 파일을 다시 실행하면 이 파일도 다시 실행).
- 업체 연수 행의 학생 열(이름·국적·성별 이름)과 `am_ag_id`는 실제 데이터 5,534건 모두 학생 행·에이전시 번호와 같아 따로 두지 않는다. 여권·연락처 같은 연수 열은 화면이 쓰지 않아 옮기지 않는다.
- 없는 날짜(`0000-00-00`, 실제 추출본의 납부 기한 3건·픽업 도착 2건)는 null. core도 이 값을 빈 값으로 본다(전에는 '기한 지남'으로 셌다).
- 어댑터 `apps/admin/server/normalized.ts`: 정규화 행(REST JSON) → core가 받는 업체 원본 모양. 연장은 연장 인보이스 금액이 있어 3단계까지 `legacy_extensions`를 그대로 쓴다.
- 배포 읽기(`functions/api`): `enrollments` 표가 채워져 있으면 학생·연수를 정규화 표에서 어댑터로 읽고, 표가 없거나 비어 있으면(지금 운영) `legacy_*`를 읽는다. 둘 다 번호 순.
- 시험 `supabase/tests/core_schema_adapter.mjs`: 정규화 경로와 legacy 경로의 응답을 목록 26개 + 학생 상세 전부 + 에이전시 상세로 비교한다. 가짜 샘플(CI)과 실제 추출본(로컬, 값 출력 없이 건수만, 11/10: 학생 상세 5,537명·에이전시 30곳) 모두 같았다.

## 3단계: 회계 이력·기숙사 배정 (`20261110130000_core_schema_accounting.sql`, 11/10)

학생별 회계 이력은 옮기기로 정해져 있다(HANDOFF 7장). 운영 화면(쓰기)을 옮길지는 따로 정한다. 열은 관리자 core가 실제로 읽는 것만 두었다(core를 실제 데이터로 돌려 입력 표마다 읽은 열 이름을 모아 정함).

| 표 | 키 | 업체 원본 | 주요 열 |
| --- | --- | --- | --- |
| `invoices` | 연수 | `legacy_invoices` | 통화, 해외 총액·입금 매칭, 현지 청구·납부(PHP). 총액은 '최근 인보이스 하나'의 금액 |
| `invoice_parts` | `<연수>-<tt_id>` | `legacy_invoice_summary` | 기본 + 연장 인보이스별 기간·주 수·금액(연수 청구 합계는 이것의 합) |
| `vendor_balances` | 연수 | `legacy_balances` | 업체 Check Balance 청구·납부, 연장 횟수 |
| `invoice_lines` | legacy 행 id | `legacy_invoice_items`(학생 가격·에이전시 공제) | 쪽(student·agency), 판(ic_ver), 항목, 통화, 금액, 주 수, 기간, 코스·기숙사 이름, 사용·취소 |
| `local_charges` | legacy 행 id | `legacy_invoice_items`(inv_etc) | 현지 비용 청구(tc)와 납부(td), PHP |
| `deposits` | dp_id | `legacy_deposits` | 입금일, 입금자, 통화·금액·수수료, 확인, 사용, 매칭 건수·금액·통화·에이전시, 잔액. **받는 계좌 열은 없다** |
| `point_ledger` | legacy 행 id | `legacy_point_history` | D 충전·U 사용, 시각, 포인트, 항목, 입력 직원, 메모 |
| `enrollment_dorms` | 연수 | `legacy_dorm_assignments` | 기숙사 이름·약칭·종류(NONROOM), 캠퍼스, 기간, 주 수, 취소 |
| `enrollment_extensions` + | | `legacy_extensions` | 연장 인보이스 금액·입금·통화를 더했다 |

- 채우기: `load_accounting_from_legacy()`(서비스 키만, `load_core_from_legacy()` 다음에). 연수에 없는 행은 건너뛴다.
- 배포 읽기: `invoices` 표가 채워져 있으면 회계 입력 10개(인보이스·기숙사 배정·입금·포인트·연장·인보이스별 합계·Check Balance·항목 둘·현지 비용)를 정규화 표에서 어댑터로 읽는다. 아니면 `legacy_*`.
- 시험: `core_schema_adapter.mjs`가 학생·연수와 회계를 모두 정규화 표에서 읽은 응답을 legacy 경로와 비교한다. 가짜 샘플과 실제 추출본(로컬, 값 출력 없이, 11/10) 모두 같았다. `core_schema.mjs`는 회계 표 권한(직원만 읽기·아무도 직접 못 씀)과 불러오기를 본다.

## 다음 단계

| 단계 | 내용 | 정할 것 |
| --- | --- | --- |
| 2 | 기준 코드: 업체 캠퍼스·코스·기숙사 코드(`course_code`·`dorm_code`), 가격표·환율, 방·침대(`legacy_rooms`), 공실 설정(방 목표·국가 목표·예외·마감, `legacy-portal-probes.md` '공실 설정') | 파트너 `campuses`·`courses`(소개)와 업체 코드 표의 관계: 업체 코드 표를 따로 두고(`course_codes`·`dorm_types`) 소개 표가 코드를 가리키게 하는 안 |
| 3 | 회계 이력: 11/10(위). 남은 것은 회계 운영 화면(쓰기)을 옮길 때 쓰기 정책 | 회계 운영 화면을 옮길지(HANDOFF 7장) |
| 4 | 에이전시·담당자: 업체 `ag_*`·`am_*` → 파트너 포털 `agency_members`의 `legacy_am_id`와 연결 | 파트너 2차 My Students와 같이 |
| 5 | 배포 읽기 바꾸기: 학생·연수(11/10)와 회계·기숙사 배정(11/10)은 어댑터로 전환. 남은 것은 에이전시·담당자·방·변경 이력·가격표를 같은 방식으로 옮기고, 그다음 화면별 조건 조회(목록은 쪽 단위)로 바꾸는 것 | |
| 6 | 다른 포털 읽기: 강사 포털 `lms_students()`, 학생 앱 배포 서버, 인트라넷이 `legacy_*` 대신 정규화 표를 읽는다 | 각 포털 담당과 같이 |

## 학원 계정 새 프로젝트에 적용하는 순서

1. 새 프로젝트에 `supabase/migrations` 전체를 순서대로 적용한다(이 파일 포함).
2. 가짜 샘플을 `legacy_*`에 올린다(`node scripts/upload-to-supabase.mjs`).
3. SQL Editor(서비스 권한)에서 `select * from public.load_core_from_legacy();` 다음에 `select * from public.load_accounting_from_legacy();` → 표마다 건수가 나온다.
4. 실제 데이터는 보안 점검 뒤 같은 순서로 올린다. 업체 포털을 쓰는 동안은 추출 → `legacy_*` 올리기 → 3번을 다시 돌린다.
