# 기존 업체 포털 (jicportal.com) 구조

2026-11-07 관리자 계정으로 화면 구조만 분석한 기록이다. 학생 개인정보는 담지 않는다. 강사 포털(LMS)·회계(Check Balance·Payment Report·청구 합계 계산)·변경요청 화면 조사와 연장·변경 추출 주의점은 [legacy-portal-probes.md](legacy-portal-probes.md)(2026-11-09).

## 기술 구조

- CodeIgniter(PHP) 계열. 주소는 `/appl/adm/<기능>/<화면>`, 폼에 `csrf_test_name`이 있고 CSRF 토큰은 쿠키 `csrf_cookie_name`에도 있다.
- 목록 화면은 `POST <기능>/<화면>_load/<페이지>`로 JSON(`list`, `total_size`, `cur_page`)을 받아 Handlebars로 그린다.
- 입력 항목 이름이 `테이블약어_열` 형식이라 DB 구조가 드러난다(`st_name`, `tr_state`, `roo_floor`).
- 사이트 앞단에 Cloudflare 봇 확인이 있다. 자동화 브라우저는 막히고, 사람이 로그인한 브라우저에서만 열린다.
- 에이전시 요청 화면에 'EduX'라는 이름이 보여 업체명으로 추정한다.

## 주요 테이블 약어

| 약어 | 의미 | 약어 | 의미 |
| --- | --- | --- | --- |
| st | 학생 | tr | 연수(입학 1회) |
| sd | 입학 배치(격주 A/B) | trg | 연수 그룹 |
| am | 에이전트(담당자 계정) | ag | 에이전시 |
| br | 학원 | ca | 캠퍼스 (11 Challenger, 12 Premium, 14 MCO) |
| co / cc | 코스 / 코스 가격 | do / dc | 기숙사 타입 / 가격 |
| roo / bed | 방 / 침대 | the | 체크인(침대 배정) |
| cro | 교실 | sta | 정규 출석 |
| ocl / oct | 옵션 클래스 / 신청자 | sfs / sst | 셀프 스터디 / 참가자 |
| wse / wtr | 주말 공부 설정 / 학생별 시간 | exm | 시험 |
| vio | 위반 | tra / trt | 여행·외출 / 신청자 |
| enr / eni | 외출·귀가 / 사건 리포트 | dp / id | 입금 / 인보이스 매칭 |
| ec | 기타 비용 | er | 환율 |
| bk | 은행 계좌 | acr | 에이전시 커미션율 |
| are / ars | 가족 등록 신청 / 가족 구성원 | rqp / rqg / rq | 변경 요청 / 게스트 요청 / 학생 요청 |
| prm / prc | 프로모션 / 조건 | tai | 필리핀 학교·비자 보고 |
| sf / te | 직원 / 교사 | po / dt | 직급 / 부서 |
| it / me / ro | 게시글 / 메뉴 / 역할 | cm / cd | 공통 코드 |

## 메뉴 구조 (15개 그룹)

경로는 `/appl/` 뒤의 주소다.

| 그룹 | 메뉴 > 화면 | 경로 |
| --- | --- | --- |
| 대시보드 | Summary information | adm/dashboard/recent |
| 게시판 | 공지사항(스텝·유학원·학생·교사), Pictures·Meal·News(Agency), 프로모션·자료실(유학원) | brdv2/boardv2/board_list/board_* |
| 재학생관리 | 체크인 > 체크인 상태 / 체크인 | adm/checkin_status/status, adm/checkin/checkin_v3 |
| 재학생관리 | 신입·연장·복귀·변경 / 재학생현황 / 졸업생 현황 | adm/academic/freshman, student, graduate |
| 재학생관리 | 변경요청 / 게스트 요청 / 요청사항(학생) | adm/reqchg/reqchg, reqguest, adm/request/request |
| 재학생관리 | 스케줄 > 정규수업 / 옵션클래스 / 단어시험·셀프스터디 / 주말공 / 검색 | adm/academic2/schedule, adm/attendance/option_class, self_study, weekend_set, overall |
| 재학생관리 | 출석 > 정규수업 / 결석 / 옵션클래스 / 셀프스터디 / 주말공 / 일별 / 기간 / 마감 | adm/attendance_v2/regular, absent, option_class, self_study, weekend, daily, period, closing |
| 재학생관리 | 학습 > 시험 & 결과 / 위반 | adm/examination/exam, adm/attendance/violation |
| 재학생관리 | Outing > Travel | adm/outing/travel |
| 재학생관리 | 항공·픽업 / ID 카드 / ID 카드 교체 / 사진 업로드 | adm/academic/airline, id_card, exchange, adm/academic3/picture |
| 재학생관리 | 통계 > 학생수(달력) / Student List / Register Stat | adm/train2/inschool, adm/train_stat/stu_stat_list_v2, adm/train2/reg_stat |
| 재학생관리 | Room Setting > Room Target / Exceptions | adm/train_stat/room_target_v2, exception |
| 마케팅 | 학생등록 / 가족등록 / 중단·연기 / 연장 | adm/register/regist, family_regist, adm/train3/canceltrain, extend |
| 마케팅 | 항공·픽업 관리 / Checking Memo | adm/train2/airpickup, checking_memo |
| 마케팅 | 통계 > Closing Status / 예상 금액 | adm/register/closing_v2, adm/simul/estimate |
| 마케팅 | Room Setting > 연수마감관리 / Registration > 가족연수 마감관리 | adm/business/close_man, adm/register/family_closing |
| 마케팅 | Marketing Board > 마케팅 게시판 / Weekly Report | brdv2/boardv2/board_list/marketing_* |
| 마케팅 | 유학원 안내 연락처 / Promo | adm/agency_contact/contact, adm/promo/manage |
| 회계팀 | Passport / 입금액매칭 / 현지 인보이스 납부 / Payment Report / Check Balance | adm/academic/passport, adm/tuition/matching, adm/tuition2/payment, report, balance |
| 회계팀 | Point(Students) > Balance / Deposit / Refund / Payment / Report / History | adm/point/balance, deposit, return, payment, report, history |
| 회계팀 | Point(Employee) > Deposit / Report, 포인트 POS | adm/Pointemp/emp, adm/pointemp/report, adm/point/pos, sale |
| 경비 | Students / 출입관리 / 외출자 현황 / 리포트 / 리포트 관리 | adm/guard/student, entrance, outside, issue, manage |
| 학생관리 | 학생등록관리 | adm/student/regist |
| 교사관리 | 교사등록관리 / Information | adm/teacher/regist, id_card |
| 스텝관리 | 스텝등록관리 / Information | adm/staff/regist, id_card |
| 유학원관리 | 유학원등록관리 / 유학원 신청 / Commission | adm/agency/agency, request, comm |
| POS | Product Groups / Products | adm/pos/group, product |
| 기초코드관리 | 직급 / 부서 / 발령 / 은행계좌 / 환율 / 학원 / 캠퍼스 | adm/basic2/position, deptv2, staff_allocation, adm/basic/bank, exchange, branch, Campus |
| 기초코드관리 | 방관리 > 방·침대 / 방 상태 / 침대 상태 / Classroom | adm/room/room_bed, room_state, bed_state, adm/classroom/classroom |
| 기초코드관리 | 코스 / 코스비용 / 기숙사 / 기타비용 / Etc cost Authority / 휴일 | adm/basic/course, cc_setting, dorm, etc_cost, ec_auth, holiday |
| 설정 | Academy Setting / 코드 / 메뉴 / 역할 / 롤별 메뉴 / 멤버 메뉴·롤 / Staff Permission | adm/system/* |

## 데이터 추출에 쓴 조회 API

모두 읽기 전용이다. 이름에 save, delete, clear, update, insert가 들어간 주소는 호출하지 않는다.

| 데이터셋 | 조회 주소 | 조건 |
| --- | --- | --- |
| students | adm/student/regist_load | 없음 |
| enrollments | adm/register/regist_load | `s_tr_state[]`와 날짜를 비워 전체 상태 |
| invoices | adm/tuition2/payment_load | 조회 기간 최대 1년 → 등록일 기준 연도별 반복 |
| deposits | adm/tuition/matching_deposit_load | 날짜 비움 |
| point_history | adm/point/history_load | 날짜 비움 |
| dorm_assignments | adm/checkin/checkin_v3_load | 날짜 필수, 캠퍼스 '전체' 없음 → 캠퍼스 3곳 × 연도별 반복. 2023년경부터 기록 |
| memos | adm/train2/checking_memo_load | 없음 |
| agencies | adm/agency/agency_load | 없음 |
| agents | adm/agency/agent_load | 에이전시마다 `ag_id` |
| memo_history | com/dialog/dlg_train_memo_load | 연수마다 `dlg_train_memo_tr_id`. 2026-11-07 기준 사용 기록 없음 |

## 추가 조회 주소와 검색 항목 (2026-11-08 추가 추출로 확인)

화면 스크립트는 대부분 `jAjaxForm(page_base_url + "<화면>_load/" + 페이지, "frm_search", …)` 형식이다. 검색 폼(`frm_search`) 전체를 보내므로 화면의 검색 항목 이름이 곧 조회 조건이고, 주소가 HTML에 통째로 드러나지 않는 경우가 많다. 아래 결과는 열 이름·건수로만 확인했다(값 없음, 열 목록은 `docs/data-dictionary-extra.md`).

| 화면 | 조회 주소 | 검색 항목 | 확인한 것 |
| --- | --- | --- | --- |
| 회계 > Point(Students) > Balance (`adm/point/balance`) | `balance_load/<페이지>` | `s_branch`, `s_sd_departure`(배치), `s_name`, `s_st_country`, `s_balance`(plus·lower_2000·minus), `s_start_date`, `s_finish_date`, `s_current_campus`(11·12·14), `s_student_in_school`(체크박스), `s_per_page`(10~100), `s_order` | 화면이 잔액 = `total_deposit - total_usage`로 계산한다. 응답 열에 `last_deposit_date`, `stay_state`. 화면 기본 조건으로는 1건, 조건을 넓히면 연수 5,002건. 재학생 281건은 충전·잔액 0이고 잔액이 남은 15건은 모두 졸업생 |
| 회계 > Point > History (`adm/point/history`) | `history_load/<페이지>` | `s_branch`, `s_campus`, `s_deposit_cost`, `s_ec_id`(기타 비용), `s_start_date`, `s_finish_date`, `s_term_btn`, `s_staff`, `s_st_country[]` | 날짜 항목을 모두 비워도 첫 추출과 같은 14,439건. 기록은 2024-09~2026-06. **업체 포털의 포인트 기록은 2026-06에 끝났다** |
| 기초코드 > 방관리 > 방·침대 (`adm/room/room_bed`) | `room_bed_v2_load/<페이지>` | `s_campus`(11·12·14, 전체 없음), `s_dorm`, `s_status`(ACTIVE·UPCOMING·ENDED·ALL), `s_the_date`, `s_building`, `s_floor`, `s_gender`, `room_number`, `bed_number`, `s_per_page`(30~200) | 응답에 `summary`(방 수 등)가 붙는다. 방마다 `beds` 배열(`bed_id`, `bed_num`, `bed_gender`, `bed_start_date`, `bed_finish_date`, `bst_type` 등). 침대를 쓰는 학생은 들어 있지 않다. ACTIVE 기준으로 Premium 74개 방만 나왔다 |
| 재학생 > 체크인 (`adm/checkin/checkin_v3`) | 목록 `checkin_v3_load/<페이지>` | `s_campus`(11·12·14), `s_filter`(N·P·F), `s_name`, `s_st_date_from`, `s_st_date_to`, `s_st_dorm` | 기본 추출의 `dorm_assignments`가 이 목록이다 |
| 〃 '방 이력' 창 | `checkin_v3_student_rooms` (페이지 번호 없음) | `{ st_id }` 학생 하나 | 응답은 `{ code, list }`. 오늘 입실자 295명 모두 빈 목록이고 `cnt_bed_use`도 0이다 → **업체 포털에는 침대 배정 기록이 없다** (포털 기획 세션 확인) |
| 회계 > 현지 인보이스 납부 (`adm/tuition2/payment`) | `payment_load/<페이지>` | `s_branch`, `s_sd_id`, `s_extend_yn`, `s_tr_state[]`, `s_invoice_balance`, `s_local_balance`, `s_term_key`, `s_start_date`, `s_finish_date`, `s_point_balance`, `s_collectible_yn`, `s_st_country[]`, `s_ag_country[]`, `s_current_student`, `s_tr_deposit_state`, `s_tr_ver`, `s_tr_pay_method`, `s_key`, `s_keyword`, `s_total_week`, `s_bk_id`, `s_trg`, `s_order` | 인보이스 상세 금액을 주는 주소는 아직 찾지 못했다 |
| 기초코드 > 방관리 > 방 상태 (`adm/room/room_state`) | 확인 전 | `kind`, `s_campus`, `s_dorm`, `s_status`, `s_the_date`, `s_type`, `s_building`, `room_number` | - |

## 통계·마케팅 화면과 새 관리자 앱 대조 (2026-11-08)

업체 화면의 검색 항목·표 머리글·응답 구조를 보고, 같은 조건의 **합계 건수**만 받아 관리자 앱 계산과 맞춰 봤다(학생 값은 보지 않음). 기준은 `apps/admin/server/core.ts` 주석에도 적었다.

| 업체 화면 | 조회 주소 | 응답 | 새 화면 · 대조 결과 |
| --- | --- | --- | --- |
| 재학생 > 통계 > 학생수(달력형) (`adm/train2/inschool`) | `inschool_load/<YYYY-MM>`, 날짜 칸 명단 `inschool_student_list_load` | `stat[]` = 날짜(`dt`, YYYYMMDD) × 지점 × 칸(`ca_<id>`, `off_<id>` 기숙사 밖, other, nodorm)별 `dep`·`ret`·`stopped`·`postponed`·`expelled`·`inschool` | `/stats/calendar` 학생수 달력. 재원 = `tr_departure_date ≤ 날짜 < tr_return_date`, 캔슬·거절·홀드·요청·연기 제외. 11월 재원 296·294·295·292·288·264(1·7·8·15·22·30일), 입국 52·1·47, 기숙사 밖(`do_type` NONROOM) 14명 모두 일치. 업체 칸은 그날의 기숙사 캠퍼스, 새 화면은 첫 코스 캠퍼스(합계는 같고 캠퍼스별로 몇 명 다를 수 있음) |
| 재학생·마케팅 > 통계 > Register Stat·등록 현황 (`adm/train2/reg_stat`) | `reg_stat_load/1`, 칸 명단 `reg_stat_student_list` | `periods[]`(2주 배치 또는 월), `country_list[]` = 기간 × 국가(`ct_id`)별 `cnt_11`·`cnt_12`·`cnt_14`·`cnt_none`·`cnt_all`, 작년 비교 `country_list_prev` | `/stats/registrations` 등록 현황. 기준 `s_basis` invoice(첫 인보이스 = `tr_invoice_dt`) / departure(입국일), 국가는 인보이스 국적 `tr_st_country`, 캠퍼스는 `first_co_ca_code`. 기본은 캔슬 제외·연수 중 취소·퇴교·연기 포함(`s_inc_cancel_train` 기본 체크), `s_inc_cancel`이면 캔슬 포함. 6/14~11/14 배치 11개 합계가 세 조건(발행일, 입국일, 캔슬 포함) 모두 일치, 캠퍼스별도 일치 |
| 마케팅 > 중단/연기 현황 (`adm/train3/canceltrain`) | `canceltrain_load/` | 상태 퇴교·연수중 취소·연기, 사유 `reason` | `/cancellations` 중단·연기 현황(+ 입학 전 캔슬 탭). 사유·처리일은 상태별 `tr_cancel_train_*`·`tr_postpone_*`·`tr_expel_*`·`tr_cancel_*` |
| 마케팅 > Checking Memo (`adm/train2/checking_memo`) | `checking_memo_load/` (수정 `save_check_memo_train`은 부르지 않음) | Agency Memo `tr_ag_memo`, Marketing Memo `tr_br_memo`, Academy Memo `tr_br_memo_en` | `/memos` 체크 메모(읽기 전용). 메모 이름을 업체와 같게 바꿨다(학생 상세도) |
| 마케팅 > 연장현황 (`adm/train3/extend`) | `extend_load/` | 연장 기록 `tt_*`(`tt_insert_date_str`, `tt_start_date`, `tt_finish_date`, `tt_week`, `tt_memo`, `tt_etc`) | `/extensions` 연장 현황(11/9 추출 412건). 업체는 연장해도 `tr_finish_date`(원래 종료일)를 바꾸지 않아, 종료일·재학 여부는 마지막 `tt_finish_date`로 본다(`core.ts` `finishOf`). 연장 금액 `sum_price`(연수 통화), 입금 `sum_amount` |
| 재학생 > 신입·연장·복귀·변경 (`adm/academic/freshman`) | `freshman_load/`, `freshman_load_extend/`, `freshman_load_comeback/`, `freshman_load_course/`, `freshman_load_dorm/` | 탭 5개(신입·연장·복귀·코스 변경·기숙사 변경) | 신입은 '입학 배치별 명단', 연장 탭은 '연장 현황'(연장현황의 일부 86건)이 대신한다. 코스 변경·기숙사 변경·복귀는 `/changes` 변경 이력(업체 New Course·New Dorm 칸 `chg_course`·`chg_dorm`과 날짜). 주의: 복귀 탭은 `total_size`가 늘 1이라 빈 쪽까지 넘겨야 하고, 기숙사 변경은 긴 기간을 한 번에 넣으면 500이라 한 달씩 받는다(2024-04-21 하루는 하루만 넣어도 500) |
| 마케팅 > 통계 > Closing Status·예상 금액 | `adm/register/closing_v2`, `adm/simul/estimate` | 검색 폼 없음(화면 안에서 따로 조회) | Closing Status = 캠퍼스 × 기숙사 × 기수 등록 가능 여부(공실), 조회 `closing_v2_list`·`finish_list`·`check_stay`(11/10 허용, `legacy-portal-probes.md`). 예상 금액 = 가격표(화면 코드) |

## 주의

- 연수 목록 응답의 모든 행에 `token`, `debug_info`, `online_user_id`가 붙어 온다. 저장하지 않는다.
- 에이전트 목록 응답에 비밀번호 필드 `am_pw`가 포함된다. 저장하지 않으며, 업체 쪽 보안 약점으로 기록해 둔다.
