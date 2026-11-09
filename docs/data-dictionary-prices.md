# 데이터 사전 — 추가 추출

추가 추출 스크립트(`scripts/extract/`)로 받은 표의 열 이름과, 값이 채워진 레코드 수다. 값은 담지 않는다. 기본 추출본은 `docs/data-dictionary.md`.

- 추출 시각: 2026-11-09T02:06:01.923Z
- 출처: jicportal.com admin (가격표: 예상 금액 화면 코드, course_load, dorm_load, etc_cost_load, acr_load)
- 제외한 필드: 
- 환율(`exchange_rate`)은 2026-11-10에 `exchange_load`만 따로 받아 이 사전에 손으로 더했다. 다음 추출부터는 스크립트가 같이 받는다.

| 테이블 | 레코드 | 열 |
| --- | ---: | ---: |
| price_course | 58 | 8 |
| price_dorm | 23 | 7 |
| price_setting | 1 | 14 |
| promo | 9 | 21 |
| course_code | 66 | 12 |
| dorm_code | 27 | 13 |
| price_etc | 74 | 14 |
| comm_rule | 3 | 14 |
| exchange_rate | 106 | 6 |

## price_course

레코드 58건, 열 8개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `cc_co_id` | 58 |
| `cc_week` | 58 |
| `cc_won` | 58 |
| `cc_usd` | 58 |
| `cc_yen` | 58 |
| `cc_peso` | 58 |
| `cc_start_date` | 58 |
| `cc_finish_date` | 58 |

## price_dorm

레코드 23건, 열 7개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `dc_do_id` | 23 |
| `dc_won` | 23 |
| `dc_usd` | 23 |
| `dc_yen` | 23 |
| `dc_peso` | 23 |
| `dc_start_date` | 23 |
| `dc_finish_date` | 23 |

## price_setting

레코드 1건, 열 14개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `cs_id` | 1 |
| `cs_br_id` | 1 |
| `cs_1w` | 1 |
| `cs_2w` | 1 |
| `cs_3w` | 1 |
| `cs_4w` | 1 |
| `cs_5w` | 1 |
| `cs_6w` | 1 |
| `cs_7w` | 1 |
| `cs_8w` | 1 |
| `cs_1w_more` | 1 |
| `cs_start_date` | 1 |
| `cs_finish_date` | 1 |
| `cs_use_yn` | 1 |

## promo

레코드 9건, 열 21개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `prm_id` | 9 |
| `prm_kind` | 9 |
| `prm_type` | 0 |
| `prm_name` | 9 |
| `prm_name_en` | 9 |
| `prm_note` | 8 |
| `prm_country` | 9 |
| `prm_currency` | 9 |
| `prm_campus` | 9 |
| `prm_target` | 6 |
| `prm_target_id` | 6 |
| `prm_target_weeks_yn` | 9 |
| `prm_show_start_date` | 9 |
| `prm_show_finish_date` | 9 |
| `prm_reg_start_date` | 9 |
| `prm_reg_finish_date` | 9 |
| `prm_allow_stacking_yn` | 9 |
| `prm_priority` | 9 |
| `prm_use_yn` | 9 |
| `campus_code` | 9 |
| `conditions` | 9 |

## course_code

레코드 66건, 열 12개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `co_id` | 66 |
| `co_ca_id` | 66 |
| `co_name` | 66 |
| `co_name_short` | 66 |
| `co_type` | 66 |
| `co_week_only` | 7 |
| `co_country_only` | 7 |
| `co_order` | 66 |
| `co_use_yn` | 66 |
| `co_start_date` | 66 |
| `co_finish_date` | 66 |
| `ca_code` | 66 |

## dorm_code

레코드 27건, 열 13개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `do_id` | 27 |
| `do_ca_id` | 27 |
| `do_name` | 27 |
| `do_name_short` | 27 |
| `do_type` | 3 |
| `do_gender` | 2 |
| `do_max` | 27 |
| `do_include` | 0 |
| `do_order` | 27 |
| `do_use_yn` | 27 |
| `do_start_date` | 27 |
| `do_finish_date` | 27 |
| `ca_code` | 27 |

## price_etc

레코드 74건, 열 14개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `ec_id` | 74 |
| `ec_br_id` | 74 |
| `ec_name` | 74 |
| `ec_type` | 74 |
| `ec_won` | 74 |
| `ec_usd` | 74 |
| `ec_yen` | 74 |
| `ec_peso` | 74 |
| `ec_start_date` | 74 |
| `ec_finish_date` | 74 |
| `ec_use_yn` | 74 |
| `ec_point_flag` | 49 |
| `ec_order` | 74 |
| `ec_memo` | 0 |

## comm_rule

레코드 3건, 열 14개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `acr_id` | 3 |
| `acr_level` | 3 |
| `acr_type` | 3 |
| `acr_ag_id` | 3 |
| `ag_name` | 1 |
| `acr_country` | 0 |
| `country_name` | 1 |
| `acr_min_week` | 3 |
| `acr_max_week` | 3 |
| `acr_start_date` | 3 |
| `acr_finish_date` | 3 |
| `acr_rate` | 3 |
| `acr_memo` | 1 |
| `is_now` | 3 |

## exchange_rate

레코드 106건, 열 6개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `er_id` | 106 |
| `er_start_date` | 106 |
| `er_type` | 106 |
| `er_rate` | 106 |
| `er_ttb` | 0 |
| `er_tts` | 0 |

## 화면 구조

| 항목 | 화면 | 조회 주소 | 결과 | 캠퍼스 항목 | 검색 항목 | 화면이 부르는 주소 |
| --- | --- | --- | --- | --- | --- | --- |
| price_course |  | adm/simul/estimate (화면 코드 course_cost_list) | - |  |  |  |
| price_dorm |  | adm/simul/estimate (화면 코드 dorm_cost_list) | - |  |  |  |
| price_setting |  | adm/simul/estimate (화면 코드 course_cost_setting_list) | - |  |  |  |
| promo |  | adm/simul/estimate (화면 코드 promo_list) | - |  |  |  |
| course_code |  | adm/basic/course_load | - |  |  |  |
| dorm_code |  | adm/basic/dorm_load | - |  |  |  |
| price_etc |  | adm/basic/etc_cost_load | - |  |  |  |
| comm_rule |  | adm/agency/acr_load | - |  |  |  |
| exchange_rate |  | adm/basic/exchange_load | - |  |  |  |
