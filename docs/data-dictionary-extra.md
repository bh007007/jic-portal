# 데이터 사전 — 추가 추출

`scripts/extract/portal-extract-extra.js`로 받은 표의 열 이름과, 값이 채워진 레코드 수다. 값은 담지 않는다. 기본 추출본은 `docs/data-dictionary.md`.

- 추출 시각: 2026-11-08T07:21:21.039Z
- 출처: jicportal.com admin (read-only endpoints, 추가 추출2)
- 제외한 필드: 

| 테이블 | 레코드 | 열 |
| --- | ---: | ---: |
| point_balance | 5002 | 13 |
| checkin_today | 295 | 24 |

## point_balance

레코드 5002건, 열 13개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `tr_id` | 5002 |
| `tr_st_id` | 5002 |
| `tr_sd_id` | 5002 |
| `tr_cur_ca_id` | 5002 |
| `tr_start_date` | 5002 |
| `tr_finish_date` | 5002 |
| `tr_state` | 5002 |
| `tr_point_clear_yn` | 5002 |
| `sd_name` | 5002 |
| `total_deposit` | 5002 |
| `total_usage` | 5002 |
| `last_deposit_date` | 1227 |
| `stay_state` | 5002 |

## checkin_today

레코드 295건, 열 24개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `tr_id` | 295 |
| `tr_st_id` | 295 |
| `tr_start_date` | 295 |
| `tr_finish_date` | 295 |
| `tr_state` | 295 |
| `ic_id` | 295 |
| `ic_do_id` | 295 |
| `ic_departure_date` | 295 |
| `ic_return_date` | 295 |
| `ic_week` | 295 |
| `ic_cancel_yn` | 295 |
| `do_id` | 295 |
| `do_name` | 295 |
| `do_gender` | 8 |
| `ca_id` | 295 |
| `ca_code` | 295 |
| `total_days` | 295 |
| `tr_checkin_days` | 295 |
| `ic_total_days` | 295 |
| `cnt_bed_use` | 295 |
| `cnt_date` | 295 |
| `grp_tr_id` | 16 |
| `tt_id` | 295 |
| `_campus_param` | 295 |

## 화면 구조

| 항목 | 화면 | 조회 주소 | 결과 | 캠퍼스 항목 | 검색 항목 | 화면이 부르는 주소 |
| --- | --- | --- | --- | --- | --- | --- |
| point_balance |  | adm/point/balance_load | - |  |  |  |
| checkin_today |  | adm/checkin/checkin_v3_load | - |  |  |  |
| student_rooms |  | adm/checkin/checkin_v3_student_rooms | - |  |  |  |
