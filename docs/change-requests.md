# 변경 요청

코스·기숙사 변경, 연장, 수업 추가, 취소 요청을 받아 처리하는 기능이다. 업체 '재학생관리 > 변경요청'(reqchg)을 대신한다. 업체 기록은 2024년 8건뿐이라 옮기지 않고 새로 받는다(11/10 레오님 결정).

## 단계

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 직원이 받은 요청(메신저·메일·방문)을 관리자 포털에 적고 처리한다 | 11/10 |
| 2 | 학생 앱에서 학생이 신청하고, 답변(`reply`)과 상태를 본다 | 예정 |
| 3 | 에이전시 포털에서 지점이 자기 학생 요청을 넣는다(My Students 뒤) | 예정 |
| - | 승인한 요청을 연수(코스·기숙사·기간)와 인보이스에 반영 | 정규화 스키마 뒤. 지금은 업체 포털에서 바꾼다 |

## 데이터 (`supabase/migrations/20261110100000_change_requests.sql`)

- `change_requests`: 연수 `tr_id`(업체 번호), 학생 `st_id`, 종류 `kind`, 상태 `state`, 출처 `source`(staff·student·agency), 바꾸려는 것 `want`, 바꾸려는 기간 `period_from`·`period_to`, 요청 내용 `content`, 답변 `reply`(신청자에게 보임), 직원 메모 `staff_memo`, 차액 `tuition_fee`(연수 통화)·`local_fee`(PHP), 만든 사람·시각, 결정한 사람·시각.
- 학생 이름·연락처는 저장하지 않는다. 화면이 `/api/enrollments?tr=…`로 이름과 연수 기간을 붙인다.
- `change_request_log`: 상태가 바뀔 때마다 한 줄(상태, 사람, 시각). 트리거가 쓰고 직원은 읽기만 한다.

| 종류 `kind` | 화면 | 업체 rqp_type |
| --- | --- | --- |
| course | 코스 변경 | CHG_COURSE |
| dorm | 기숙사 변경 | CHG_ROOM |
| extension | 연장 | EXTESION |
| add_class | 수업 추가 | ADD_CLASS |
| cancel | 취소·중단 | CANCELLATION |
| other | 기타 | OTHER |

## 상태

신청(requested) → 접수(received) → 승인(approved) → 완료(done). 신청·접수에서 거절(rejected), 완료 전에는 언제든 취소(canceled). 거절·취소·완료 뒤에는 상태도 내용도 바꾸지 않는다. 업체의 학비·현지비 정산 완료(DONE_TUITION·DONE_LOCAL)는 '완료' 하나로 줄였다. 바뀔 수 있는 길은 DB 함수 `change_request_next_ok`가 정하고, 화면도 같은 표를 쓴다.

## 권한

- 직원(`is_staff()`, 관리자·오피스)이 읽고 쓴다(`docs/roles.md` '중단·연기 현황, 변경 요청'). 지우기는 없다. 취소 상태로 남긴다.
- 직원이 넣는 요청의 출처는 항상 staff다(열 권한으로 막음). 학생·에이전시 신청은 2·3단계에서 정책을 더한다.
- 매니저 읽기(권한표)는 관리자 포털을 매니저에게 열 때 같이 한다.
- 시험: `supabase/tests/change_requests_rls.mjs`(25개: 직원만, 상태 흐름, 끝난 요청 잠금, 기록).

## 화면

관리자 포털 '학생관리 > 변경 요청'(`/admin/requests`, `ChangeRequests.tsx`). 처리 중(신청·접수·승인) 목록이 기본이고, 상태·종류·이름으로 거른다. '요청 등록'에서 학생을 찾아 연수를 고르고, 줄을 누르면 내용·답변·메모·차액을 고치고 다음 상태로 넘긴다. Supabase에 있어 배포 주소(로그인한 직원)에서만 동작한다. 로컬 데이터 실행에는 없다.
