# 업체 포털 화면 조사 결과 (구조만, 2026-11-09)

업체 포털(jicportal.com)의 강사 포털(LMS)·회계·변경요청 화면이 어떤 주소로 무엇을 돌려주는지 조사한 기록이다. 키 이름·자료형·건수와 짧은 코드 값만 적고 학생 값은 담지 않는다. 전체 화면 목록과 조회 API는 [legacy-portal.md](legacy-portal.md)에 있다.

## 조사 방식

- 레오님이 로그인한 브라우저에서 돌렸다. 호스트는 `jicportal.com`(www 없음)이다. www 쪽 세션은 따로 만료된다.
- POST는 끝 이름이 `*_load`인 목록 주소만 불렀다(CLAUDE.md 원칙).
  - 예외는 레오님이 허용한 인보이스 편집 화면 조회뿐이다: `adm/tuition2/payment_select/<tr_id>`와 화면 GET `payment_edit/<tr_id>`.
  - get·info·view·detail 같은 다른 조회는 이름만 기록했다.
- 원본 조사 파일은 Git 밖 `data/raw/`에 있다.
  - `jic_portal_probe_lms_2026-11-09.json`, `jic_portal_probe_lms_attendance_2026-11-09.json`
  - `jic_portal_probe_accounting_2026-11-09.json`, `jic_portal_balance_2026-11-09.json.gz`
- 조사 스크립트는 `scripts/extract/portal-probe-lms.js`(LMS)와 `portal-probe.js`(회계)다.

## 보안 주의: 응답에 다른 표의 열이 통째로 붙어 나온다

추출 스크립트는 반드시 **열 허용 목록**으로만 저장한다(`core.ts`의 `*_COLUMNS`, 추출 스크립트의 KEEP 같은 방식).

| 열 | 나오는 곳 |
| --- | --- |
| `te_pw`(교사 비밀번호, 모두 채워짐), `te_salary_basic`·`te_salary_extra`(급여) | 교사 목록, 정규수업 출석, 일별 출석 |
| `st_pw`(학생 비밀번호, 일부 채워짐) | 출석, 옵션클래스 |
| `am_acct_*`·`ag_acct_*`(계좌) | 일별·기간 출석 |
| `l_dp_bk_name`(입금 은행명) | 연장현황, Payment Report |
| `st_passport_*`·`tr_pass_*`(여권) | 연수 열이 붙는 거의 모든 응답 |

## 강사 포털(LMS) 화면

출석 추출과 강사 포털 출석은 `scripts/extract/portal-extract-attendance.js`, [teacher-portal.md](teacher-portal.md)가 이 구조로 만들어졌다. 강사 포털 쪽 요약은 teacher-portal.md '업체 출석 구조 (11/9 LMS 조사)' 절이고, 이 문서가 화면 전체 기록이다. 출석 열을 고치면 두 곳을 같이 고친다.

| 화면 | 목록 주소 | 검색 항목 | 응답 열(요점) | 건수(11/9) |
| --- | --- | --- | --- | ---: |
| 교사관리 > 교사등록 | `adm/teacher/regist_load` | s_branch, s_campus(11·12·14), s_term_key(employment·resignation), s_name, s_use_yn | te_id, te_name, te_name_en, te_ca_id, te_birthday, te_email, te_in_date·te_out_date, te_use_yn, ca_name. **te_pw·급여 제외** | 198 |
| 스케줄 > 정규수업 | `adm/academic2/schedule_load` | s_ca_id | 기간별 시간표 '헤더'(sup_*: sup_sd_id 배치, 시작·끝, 단계별 입력 시각) | 169 |
| 방관리 > Classroom | `adm/classroom/classroom_v2_load` | s_campus, s_status(ACTIVE·UPCOMING·ENDED·ALL), s_cro_type(1·G), s_use(OPT·SELF·WKD) | cro_id, cro_num, cro_type(1=1:1, G=그룹), cro_building, cro_floor, cro_max, cro_te_id(담당 교사), cro_option_yn·cro_self_yn·cro_weekend_yn, cro_status | 83 |
| 스케줄 > 옵션클래스 | `adm/attendance/option_class_load`, `option_class_train_load` | s_ca_id, s_date, s_ocl_closed_yn | train_load 응답의 `ocl_info`에 옵션클래스(ocl_main_te_id, ocl_sub_te_id, ocl_cro_id, 시작·끝 날짜·시각, ocl_subject, ocl_price) | ocl_info 3,078 |
| 스케줄 > 셀프스터디 | `adm/attendance/self_study_load` | s_ca_id, s_date | sfs_main_te_id, sfs_sub_te_id, 기간, cnt_studs | 4 |
| 출석 > 정규수업 | `adm/attendance_v2/regular_sched_load` → `regular_load` | s_the_date, s_sta_ca_id, sel_time(숨은 칸), s_sta_result(AT·AB·TA), s_sta_type(1·G·W·SCH) | 아래 '출석 행' | 캠퍼스 12 하루 71행 |
| 출석 > 결석 | `absent_sched_load` → `absent_load` | s_the_date, s_sta_ca_id, sel_st_id(숨은 칸) | 학생별 요약(cnt_at·cnt_ab·cnt_ta·cnt_total, outing_text) | 캠퍼스 12 하루 159 |
| 출석 > 일별 | `adm/attendance_v2/daily_load` | s_ca_id, s_the_date, e_the_date | 연수 행 + 배열 reg_list·oct_list·slf_list·wke_list(출석 행), close_list | 155(학생) |
| 출석 > 기간 | `period_load` | s_ca_id, 출국·귀국일 범위, s_start_date·s_finish_date | 연수 행 + 배열(st_id, sta_result, sta_excused, sac_close_yn 요약형), vio_list | 155 |
| 출석 > 마감 | `closing_load` | s_ca_id, s_the_date | sac_*(sac_case, sac_date, sac_close_yn), calendar_list, sta_list | - |
| 학습 > 시험 & 결과 | `adm/examination/exam_load`, `exam_sub_load` | s_ca_id, s_exam_type, s_sd_id | exm_id, exm_type, exm_date, exm_name, exm_close_yn, student_cnt. 학생 점수는 exam_sub_load | 2 |
| 학습 > 위반 | `adm/attendance/violation_load` | s_ca_id, s_sd_id, 기간 | 기본 조건 0건 | 0 |

**출석 행(sta_*, 21열):** sta_id, sta_ca_id, sta_case(REG 정규·OPT 옵션), sta_key_id, sta_date, sta_time, sta_min, **sta_st_id(학생 st_id, 연수 tr_ 아님)**, sta_te_id, sta_sub_te_id, sta_cro_id, sta_result(AT 출석·AB 결석·TA 지각), sta_late_min, sta_type(1=1:1, G=그룹), sta_type2, sta_excused(Y·N), sta_subject, sta_memo, sta_notes, sta_change_dt, sta_change_id.

**알아 둘 점**
- 정규수업 출석은 두 단계다.
  1. `regular_sched_load`가 그날 시간대(s_time)를 준다.
  2. 화면처럼 s_time 앞 5자리(7자면 4자리)를 `sel_time`에 넣어 `regular_load`를 부른다. 없으면 code 1 'Missing information.'
- 11/6·10/30 출석 기록은 캠퍼스 12에만 있었다. 11·14는 시간대가 0개다.
- 호출 수를 줄이려면 날짜·캠퍼스마다 `daily_load`를 s_per_page=100으로 끝까지 넘긴다. reg_list·oct_list·slf_list·wke_list에 sta_* 행이 온다.
- 교시별 시간표(schedule_detail·schedule_detail_v3·timetable·level·levelgroup·final)는 `_load`가 아니라 부르지 않았다.

## 회계 화면

| 화면 | 목록 주소 | 응답 | 주의 |
| --- | --- | --- | --- |
| 현지 인보이스 납부 | `adm/tuition2/payment_load` → 편집 `payment_select/<tr_id>` | 연수 목록. 편집 화면 응답은 인보이스 항목(cost_st·cost_ag·etc)과 `summary`(아래) | 편집 조회는 레오님 허용 예외, `portal-extract-invoice-items.js`만 쓴다 |
| Check Balance | `adm/tuition2/balance_load` | 연수마다 `cost`(청구 합계), `payment`(납부), `extend_count` + 연수 열 | 기본값은 재학생만(s_current_student=current). 추출은 `portal-extract-balance.js` |
| Payment Report | `adm/tuition2/report_load` | `train_list`(연수: sum_ic_price_s·_a, sum_id_amount, sum_tc/td, 입금 줄 `l_dp_*`)·`extend_list` | **`s_tr_state[]`를 하나 이상 넣지 않으면 500.** 기간 기준 s_term_key: request·departure·return·birthday·extension |

**청구 합계 계산 (11/9 확인)**
- 편집 화면 위쪽 표 = `payment_select` 응답의 `summary`(항목 추출의 `inv_summary` 표)다. 기본 인보이스 1줄(tt_insert_dt 비어 있음)과 연장 인보이스 줄(tt_id)로 되어 있다.
  - 행을 누르면 `sel_tt_id`에 그 tt_id를 넣어 다시 조회한다.
  - 빈 sel_tt_id는 기본 인보이스다.
- Check Balance: cost = Σ summary.sum_ic_price(기본 + 연장), payment = Σ summary.sum_id_amount. 2,052건 모두 맞았다.
- 연장 인보이스 줄 = 연장현황의 `sum_price`·`sum_amount`(84/84).
- **업체 인보이스 목록의 `sum_ic_price`는 최근 인보이스 하나의 금액이다.** 연장 안 한 4,767건은 연수 합계와 같고, 연장한 연수는 다르다.
  - 그래서 관리자 앱은 inv_summary → Check Balance → invoices 순으로 청구 합계를 계산한다(`core.ts` invoiceAmounts).
  - 이렇게 해서 업체 cost·payment와 4,991건이 모두 맞았다.

**대조 결과 (11/9)**
- 업체 Check Balance 재학생 295명과 관리자 앱 재학생(연장 반영, `finishOf`) 295명 중 294명이 같다.
- extend_count = 연장 건수, 5,004건 모두 같다.
- 미입금이 있는 재학생: 업체 277명, 관리자 앱 277명.

## 변경요청 화면

- `adm/reqchg/reqchg_load`(폼 id `frmSearch`). **전체 8건, 모두 2024년 학생 신청(st_req)**이다. 코스 변경 7건, 취소 1건.
- 열: rqp_type(CHG_COURSE·CHG_ROOM·EXTESION·ADD_CLASS·CANCELLATION·OTHER), rqp_state(REQ·REC·REJ·CANCEL·APP·DONE_TUITION·DONE_LOCAL·DONE), rqp_what, rqp_period_original·rqp_period, rqp_amount, rqp_tuition_fee, rqp_local_fee, rqp_pay_method, rqp_content, rqp_reply.
- 거의 쓰이지 않은 기능이라 옮겨 올 화면은 만들지 않았다. 새 시스템에서 필요하면 따로 정한다.

## 가격표·커미션·통계 화면 (11/9, `portal-extract-prices.js`)

열 목록은 [data-dictionary-prices.md](data-dictionary-prices.md). 관리자 포털 기초관리 '가격표'(`core.ts` prices)가 읽는다.

| 화면 | 주소 | 받은 것(11/9 건수) |
| --- | --- | --- |
| 마케팅 > 통계 > 예상 금액 (`adm/simul/estimate`) | 서버 조회 없음. 화면 코드(GET)에 목록이 들어 있다 | `course_cost_list` 58(cc_co_id·cc_week·cc_won/usd/yen/peso·적용 기간), `dorm_cost_list` 23, `course_cost_setting_list` 1, `promo_list` 9 |
| 기초코드 > 코스 (`adm/basic/course`) | `course_load`(s_co_use_yn 비움 = 사용 안 함 포함) | 66(사용 39·안 함 27). 예상 금액 화면의 `co_list`는 고를 수 있는 39개뿐이라 지난 가격의 이름은 여기서 찾는다 |
| 기초코드 > 기숙사 (`adm/basic/dorm`) | `dorm_load`(s_do_use_yn·s_do_show_reg_yn 비움) | 27 |
| 기초코드 > 코스비용 (`adm/basic/cc_setting`) | `cc_setting_load` | 1(= course_cost_setting_list) |
| 기초코드 > 기타비용 (`adm/basic/etc_cost`) | `etc_cost_load` | 74(ec_type 22종: BOOK·PROMO·PICKUP·VISA·SSP 등, 4개 통화, 포인트 구분 `ec_point_flag` P·PI) |
| 유학원관리 > Commission (`adm/agency/comm`) | `acr_load` | 3(acr_level ACADEMY·COUNTRY·AGENCY, acr_type BASE·EXTEND, 주 수 범위, `acr_rate` 0.28 = 28%) |
| 기초코드 > 환율 (`adm/basic/exchange`) | `exchange_load` | 106(11/10, 주소 하나만 허용해 조회). 통화쌍 `er_type` 5종: USDKRW 86·USDJPY 12·PHPKRW 6·USDPHP 1·PHPJPY 1. 적용 시작일 `er_start_date`만 있고 끝은 없다. TTB·TTS는 모두 비어 있다 |
| 마케팅 > 통계 > Closing Status (`adm/register/closing_v2`) | `closing_v2_list`·`closing_v2_finish_list`·`closing_v2_check_stay` | 11/10 레오님 허용으로 조사(아래 'Closing Status'). 등록 가능 여부(공실) 표, 개인정보 없음 |

**알아 둘 점**
- 코스 가격은 `cc_week` 주 기준이다(58행 중 44행이 4주). 원·달러·엔은 채워져 있고 페소는 비어 있다.
- 기간별 값(`cs_1w`~`cs_8w`, `cs_1w_more`)은 4주가 100인 값이다(11/9: 40·65·85·100·125·150·175·200, 8주 넘으면 1주마다 25).
- 사용 중인 코스 39개 중 13개는 가격 줄이 없다(업체 그대로).
- 프로모션 `campus_code`는 'CHALLENGER,PREMIUM'처럼 쉼표로 이어진다.
- 환율 `er_rate`는 앞 통화 1단위당 뒤 통화다(USDKRW 1508.23 = 1달러당 1,508.23원). 관리자 '가격표 > 환율'은 같은 통화쌍의 다음 시작일 전날을 끝으로 보고, 기준일에 적용되는 것(통화쌍마다 하나)을 지금 적용분으로 보인다. USDKRW만 꾸준히 바뀌고(2026-07-08이 마지막), 나머지 넷은 2024~2025년 값이 그대로다.

## Closing Status (11/10, 레오님 허용으로 조사)

업체 '마케팅 > 통계 > Closing Status'(`/appl/adm/register/closing_v2`)는 **캠퍼스 × 기숙사 × 시작 기수마다 등록을 받을 수 있는지(공실)** 보여 주는 표다. 목록 주소 이름이 `_load`가 아니어서 11/9까지 부르지 않았다. 11/10 레오님 허용으로 조회 세 개를 한 번씩 불러 구조와 건수만 봤다. 저장·변경 주소는 없다. 응답은 집계(건수)뿐이고 학생 개인정보는 없다. 값을 내려받거나 추출하지는 않았다.

| 주소(POST, csrf) | 화면에서 하는 일 | 보내는 값 | 받는 것(11/10, KOR·30) |
| --- | --- | --- | --- |
| `closing_v2_list` | 첫 표 | `country`(국적, 기본 KOR), `weeks`(앞으로 볼 주: 12·24·30·52) | `result[ca_id][do_id][sd_id]` 칸 375개(캠퍼스 3 × 기숙사 25 × 기수 15), `ca_list`·`dorm_list`(25, 등록 화면 표시 16)·`sd_list`(15), 국적별 인원 `country_list`(30)·`cc_list`(60), 국가 목표 `rt2_country_list`(285), 마감 설정 `train_close_list`(4)·`train_close_period_list`, 방 사진 `dorm_image_list`(453) |
| `closing_v2_finish_list` | 열린 칸을 누름: 그 기수부터 이어서 머물 수 있는지 | `ca_id`, `do_id`, `sd_id`, `country` | 같은 모양. 칸에 기간 조건 `tcp_week`·`tcp_condition`·`tcp_close_yn`이 더해지고 `sd_list`에 `diff_week`·`period_week` |
| `closing_v2_check_stay` | '연수 확인'(3단계): 시작 기수 + 주 수 + 성별 → 방마다 같은 방으로 되는지 | `ca_id`, `do_id`, `sd_id`, `weeks`, `gender`, `country` | `rows`(기숙사마다 `result`·`until`·`why`·`cells`), `sd_list`(sd_id·dt), `code` |

**칸 값**(`cnt`, `target`, `avail`, `avail_m`, `avail_f`, `state`, `state_m`, `state_f`, `state_arrival`, `state_return`, `tcp_msg`)
- `state`: O 시작 가능 75 · I 시작 가능하지만 자리 적음 136 · C 마감 164. 화면 문구는 '시작 가능', '자리 적음(숫자 = 남은 자리)', '이어서'(새로 시작은 안 되지만 앞에서 시작한 연수는 이어서 머묾), '마감'.
- 마감 이유는 화면이 칸 값으로 고른다. F 자리 없음(`avail` < 0, 또는 남녀 방 나누기로 그 성별 방이 없음), N 국가 제한(이 캠퍼스에서 이 국가가 목표에 닿음, Room Target `rt2_*`), S 시작 마감(`state_arrival` C, Closing Management), W 주 마감(`state_return` C, 이 기수를 포함하는 연수는 모두 불가).
- `avail` = 방 목표 − 학생 − 예외(화면 도움말). 375칸 중 270칸이 `target − cnt`와 같다. `target`이 기숙사 `do_max`와 같은 칸은 38개뿐이라 기수마다 목표가 따로 있다.
- `avail_m`·`avail_f`는 '그 성별만 받으면 최대 몇 명'이라 같은 침대를 두 번 센다(더하지 않는다).
- 출발 14일 안에는 '이어서' 칸을 보이지 않는다.

**새 시스템에 쓸 곳**
- 파트너 포털 '공실'과 관리자 기숙사 화면의 등록 가능 여부. HANDOFF 2번은 침대 수와 입실 인원이 맞지 않아 공실을 계산하지 않기로 했다. 업체는 침대 수가 아니라 기수별 방 목표(`target`)와 국가 목표, 직원이 넣는 마감(Closing Management)으로 판단한다.
- 같은 판단을 옮기려면 Closing Management 화면(기수·기숙사별 목표, 시작·주 마감, 국가 목표)의 설정 표가 필요하다. 그 화면의 조회 주소는 아직 보지 않았다.

## 연장·변경 추출 (`portal-extract-extend.js`)

열 목록은 [data-dictionary-extend.md](data-dictionary-extend.md). 11/9 추출 건수: 연장현황 412, 연장 탭 86(연장현황의 일부), 복귀 175, 코스 변경 1,394, 기숙사 변경 1,114.

**업체 버릇 두 가지** (스크립트가 처리한다, 11/9 고침)
- **복귀(`freshman_load_comeback`):** `total_size`가 늘 1이라 그 값으로 멈추면 20건만 받는다. 스크립트는 빈 쪽(또는 새 행이 없는 쪽)까지 넘긴다(10쪽).
- **기숙사 변경(`freshman_load_dorm`):** 2024~2027을 한 번에 넣으면 500이다. 스크립트는 전체 기간이 안 되면 한 달씩, 그 달도 안 되면 10일·하루씩 나눠 받는다.
  - 2024-04-21 하루는 하루만 넣어도 500이라 받지 못한다(업체 데이터 문제로 보인다).
  - 못 받은 날은 메타의 `failed_days`와 콘솔 '못 받은 날'에 남는다.
- `s_per_page_comeback`·`s_per_page_dorm`=30은 무시되고 한 쪽에 20건씩 온다.

**업체 화면과의 대응**
- 코스·기숙사 탭의 New Course·New Dorm 칸은 `chg_course`·`chg_dorm`과 그 날짜(`chg_*_date`)이고, 이전 값은 `prev_chg_*`다.
- 연장해도 `tr_finish_date`(원래 종료일)는 그대로다(연장 412건 중 402건이 그 뒤에 붙는다). 연수의 실제 종료일은 마지막 `tt_finish_date`다.
