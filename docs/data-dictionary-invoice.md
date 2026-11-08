# 데이터 사전 — 추가 추출

추가 추출 스크립트(`scripts/extract/`)로 받은 표의 열 이름과, 값이 채워진 레코드 수다. 값은 담지 않는다. 기본 추출본은 `docs/data-dictionary.md`.

- 추출 시각: 2026-11-08T15:27:48.767Z
- 출처: jicportal.com admin (payment_load, payment_select, payment_edit — 인보이스 항목별 상세)
- 제외한 필드: token, debug_info, online_user_id, *_pw

| 테이블 | 레코드 | 열 |
| --- | ---: | ---: |
| invoice_info | 2286 | 114 |
| inv_summary | 2370 | 16 |
| inv_ca_list | 6858 | 32 |
| inv_invoice_cost_st | 10457 | 71 |
| inv_invoice_cost_ag | 4223 | 25 |
| inv_invoice_deposit | 223 | 50 |
| inv_list_pd_point | 261 | 12 |
| inv_list_pu_point | 2636 | 56 |
| inv_etc | 5279 | 16 |
| inv_rqp_list | 0 | 0 |
| inv_invoice_list | 11522 | 39 |

## invoice_info

레코드 2286건, 열 114개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 2286 |
| `_tt_id` | 0 |
| `tr_id` | 2286 |
| `tr_br_id` | 2286 |
| `tr_st_id` | 2286 |
| `tr_am_id` | 2286 |
| `tr_sd_id` | 2286 |
| `tr_cur_sd_id` | 658 |
| `tr_ver` | 2286 |
| `tr_state` | 2286 |
| `tr_deposit_state` | 2286 |
| `tr_collectible_yn` | 2286 |
| `tr_collectible_set_id` | 2286 |
| `tr_email_send_yn` | 2286 |
| `tr_st_country` | 2286 |
| `tr_st_etc_country` | 0 |
| `tr_st_cell` | 947 |
| `tr_parent_tel` | 534 |
| `tr_pass_num` | 0 |
| `tr_pass_exp_date` | 0 |
| `tr_pass_last` | 0 |
| `tr_pass_middle` | 0 |
| `tr_pass_first` | 0 |
| `tr_link_country` | 0 |
| `tr_total_week` | 2286 |
| `tr_ori_total_week` | 40 |
| `tr_week` | 2286 |
| `tr_departure_date` | 2286 |
| `tr_return_date` | 2286 |
| `tr_start_date` | 2286 |
| `tr_finish_date` | 2286 |
| `tr_ori_departure_date` | 40 |
| `tr_ori_return_date` | 40 |
| `tr_request_dt` | 2286 |
| `tr_approve_dt` | 116 |
| `tr_reject_dt` | 0 |
| `tr_reject_memo` | 0 |
| `tr_hold_dt` | 1 |
| `tr_hold_memo` | 1 |
| `tr_invoice_dt` | 2252 |
| `tr_invoice_update_dt` | 0 |
| `tr_deposit_dt` | 0 |
| `tr_expel_dt` | 0 |
| `tr_expel_memo` | 0 |
| `tr_cancel_train_dt` | 39 |
| `tr_cancel_train_memo` | 39 |
| `tr_postpone_dt` | 1 |
| `tr_postpone_memo` | 1 |
| `tr_comeback_date` | 0 |
| `tr_insert_dt` | 2286 |
| `tr_insert_id` | 2286 |
| `tr_update_dt` | 2282 |
| `tr_update_id` | 2281 |
| `tr_cancel_req_dt` | 0 |
| `tr_cancel_dt` | 240 |
| `tr_cancel_memo` | 239 |
| `tr_st_memo` | 1 |
| `tr_ag_memo` | 1153 |
| `tr_br_memo` | 99 |
| `tr_br_memo_en` | 47 |
| `tr_am_manager` | 0 |
| `tr_interview_yn` | 2286 |
| `tr_interview_dt` | 0 |
| `tr_interview_pass_yn` | 2286 |
| `tr_interview_tel` | 0 |
| `tr_skype_id` | 0 |
| `tr_kakao_id` | 0 |
| `tr_return_yn` | 2286 |
| `tr_pickup_yn` | 0 |
| `tr_admission_campus` | 0 |
| `tr_admission_ca_id` | 2286 |
| `tr_cur_ca_id` | 2286 |
| `tr_do_id` | 2286 |
| `tr_pick_flight` | 1404 |
| `tr_pick_flight_num` | 1438 |
| `tr_pick_flight_arrival` | 1440 |
| `tr_pick_place` | 1437 |
| `tr_pick_type` | 1684 |
| `tr_pick_terminal` | 1355 |
| `tr_pick_date` | 1353 |
| `tr_pick_time` | 1361 |
| `tr_pick_time_etc` | 0 |
| `tr_pick_remark` | 285 |
| `tr_pick_insert_dt` | 1678 |
| `tr_deposit_due_date` | 2252 |
| `tr_acct_memo` | 0 |
| `tr_currency` | 2286 |
| `tr_print_loa_yn` | 2286 |
| `tr_print_pay_yn` | 2286 |
| `tr_invoice_st_bank_yn` | 2286 |
| `tr_temp_num` | 0 |
| `tr_pay_limit_date` | 0 |
| `tr_pay_method` | 0 |
| `tr_pay_method_memo` | 0 |
| `tr_bank_memo` | 0 |
| `tr_ba_id` | 1919 |
| `tr_overnight_yn` | 2286 |
| `tr_drinking_yn` | 2286 |
| `tr_tobacco_yn` | 2286 |
| `tr_certificate_yn` | 2286 |
| `tr_certificate_course` | 0 |
| `tr_room_clear_yn` | 2286 |
| `tr_point_clear_yn` | 2286 |
| `tr_semi_start_date` | 0 |
| `tr_semi_end_date` | 0 |
| `tr_meal_ver` | 2286 |
| `tr_eb_pro_ver` | 2286 |
| `tr_eb_pro_week` | 2286 |
| `tr_acc_state` | 2286 |
| `tr_temp_proof` | 2286 |
| `tr_temp_payment_proof` | 2286 |
| `tr_login_until` | 0 |
| `pay_method_name` | 0 |
| `rqr_list` | 0 |

## inv_summary

레코드 2370건, 열 16개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 2370 |
| `tt_id` | 2370 |
| `tt_tr_id` | 2370 |
| `tt_insert_dt` | 84 |
| `collectible_yn` | 2370 |
| `collectible_sf_name` | 0 |
| `week` | 2370 |
| `start_date` | 2370 |
| `finish_date` | 2370 |
| `tr_currency` | 2370 |
| `sum_ic_price` | 2370 |
| `sum_id_amount` | 2370 |
| `sum_tc_price` | 2370 |
| `sum_td_amount` | 2370 |
| `sum_pd_point` | 2370 |
| `sum_pu_point` | 2370 |

## inv_ca_list

레코드 6858건, 열 32개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 6858 |
| `ca_id` | 6858 |
| `ca_aca_id` | 6858 |
| `ca_br_id` | 6858 |
| `ca_code` | 6858 |
| `ca_area` | 6858 |
| `ca_name` | 6858 |
| `ca_name_ko` | 6858 |
| `ca_name_jp` | 6858 |
| `ca_name_ch` | 6858 |
| `ca_name_tw` | 6858 |
| `ca_name_vi` | 6858 |
| `ca_insert_dt` | 0 |
| `ca_order` | 6858 |
| `ca_label_color` | 6858 |
| `ca_union` | 6858 |
| `ca_use_yn` | 6858 |
| `ca_note` | 6858 |
| `br_id` | 6858 |
| `br_aca_id` | 6858 |
| `br_name_short` | 6858 |
| `br_name` | 6858 |
| `br_name_ko` | 6858 |
| `br_name_jp` | 6858 |
| `br_name_ch` | 6858 |
| `br_name_tw` | 6858 |
| `br_name_vi` | 6858 |
| `br_insert_dt` | 0 |
| `br_order` | 6858 |
| `br_label_color` | 6858 |
| `br_use_yn` | 6858 |
| `br_note` | 6858 |

## inv_invoice_cost_st

레코드 10457건, 열 71개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 10457 |
| `ic_id` | 10457 |
| `ic_tr_id` | 10457 |
| `ic_tt_id` | 10457 |
| `ic_ver` | 10457 |
| `ic_type` | 10457 |
| `ic_currency` | 10457 |
| `ic_price` | 10456 |
| `ic_cancel_yn` | 10457 |
| `ic_cancel_dt` | 0 |
| `ic_change_yn` | 10457 |
| `ic_change_dt` | 0 |
| `ic_co_id` | 10457 |
| `ic_do_id` | 10457 |
| `ic_departure_date` | 6086 |
| `ic_return_date` | 6086 |
| `ic_week` | 10457 |
| `ic_insert_dt` | 10457 |
| `ic_insert_id` | 10457 |
| `ic_update_dt` | 252 |
| `ic_update_id` | 252 |
| `ic_memo` | 2481 |
| `ic_use_yn` | 10457 |
| `ic_temp_num` | 0 |
| `co_id` | 3059 |
| `co_ca_id` | 3059 |
| `co_name_short` | 3059 |
| `co_name` | 3059 |
| `co_name_ko` | 3054 |
| `co_name_jp` | 2974 |
| `co_name_ch` | 2974 |
| `co_name_tw` | 2974 |
| `co_name_vi` | 2974 |
| `co_start_date` | 3059 |
| `co_finish_date` | 3059 |
| `co_memo` | 2877 |
| `co_order` | 3059 |
| `co_use_yn` | 3059 |
| `co_week_only` | 118 |
| `co_type` | 3059 |
| `co_country_only` | 68 |
| `do_id` | 3027 |
| `do_ca_id` | 3027 |
| `do_max` | 3027 |
| `do_mng_cnt_ag` | 3027 |
| `do_mng_cnt_sf` | 3027 |
| `do_gender` | 98 |
| `do_name_short` | 3027 |
| `do_name` | 3027 |
| `do_name_ko` | 3027 |
| `do_name_jp` | 3020 |
| `do_name_ch` | 3020 |
| `do_name_tw` | 3020 |
| `do_name_vi` | 2775 |
| `do_include` | 0 |
| `do_desc` | 0 |
| `do_desc_ko` | 0 |
| `do_desc_jp` | 0 |
| `do_desc_ch` | 0 |
| `do_desc_tw` | 0 |
| `do_desc_vi` | 0 |
| `do_start_date` | 3027 |
| `do_finish_date` | 3027 |
| `do_memo` | 2845 |
| `do_order` | 3027 |
| `do_show_reg_yn` | 3027 |
| `do_use_yn` | 3027 |
| `do_type` | 24 |
| `ic_type_name` | 10445 |
| `co_ca_code` | 3059 |
| `do_ca_code` | 3027 |

## inv_invoice_cost_ag

레코드 4223건, 열 25개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 4223 |
| `ic_id` | 4223 |
| `ic_tr_id` | 4223 |
| `ic_tt_id` | 4223 |
| `ic_ver` | 4223 |
| `ic_type` | 4223 |
| `ic_currency` | 4223 |
| `ic_price` | 4223 |
| `ic_cancel_yn` | 4223 |
| `ic_cancel_dt` | 0 |
| `ic_change_yn` | 4223 |
| `ic_change_dt` | 0 |
| `ic_co_id` | 4223 |
| `ic_do_id` | 4223 |
| `ic_departure_date` | 0 |
| `ic_return_date` | 0 |
| `ic_week` | 4223 |
| `ic_insert_dt` | 4223 |
| `ic_insert_id` | 4223 |
| `ic_update_dt` | 0 |
| `ic_update_id` | 0 |
| `ic_memo` | 206 |
| `ic_use_yn` | 4223 |
| `ic_temp_num` | 0 |
| `ic_type_name` | 4223 |

## inv_invoice_deposit

레코드 223건, 열 50개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 223 |
| `id_id` | 223 |
| `id_tr_id` | 223 |
| `id_tt_id` | 223 |
| `id_currency` | 223 |
| `id_amount` | 223 |
| `id_deposit_dt` | 223 |
| `id_dp_id` | 223 |
| `id_matching_dt` | 223 |
| `id_matching_yn` | 223 |
| `id_dep_currency` | 94 |
| `id_dep_amount` | 94 |
| `id_dep_rate` | 94 |
| `id_memo` | 1 |
| `id_insert_id` | 223 |
| `id_insert_dt` | 223 |
| `id_temp_num` | 0 |
| `dp_id` | 223 |
| `dp_bk_id` | 223 |
| `dp_ag_id` | 223 |
| `dp_st_id` | 223 |
| `dp_type` | 223 |
| `dp_deposit_dt` | 223 |
| `dp_name` | 221 |
| `dp_send_dt` | 223 |
| `dp_memo` | 15 |
| `dp_currency` | 223 |
| `dp_amount` | 223 |
| `dp_bank_acct` | 0 |
| `dp_fee` | 223 |
| `dp_receiver_id` | 0 |
| `dp_insert_id` | 223 |
| `dp_insert_dt` | 223 |
| `dp_confirm_yn` | 223 |
| `dp_use_yn` | 223 |
| `dp_balance` | 0 |
| `bk_id` | 223 |
| `bk_aca_id` | 223 |
| `bk_name` | 223 |
| `bk_num` | 223 |
| `bk_owner` | 223 |
| `bk_swiftcode` | 223 |
| `bk_branch` | 223 |
| `bk_currency` | 223 |
| `bk_type` | 223 |
| `bk_insert_dt` | 223 |
| `bk_update_dt` | 223 |
| `bk_order` | 223 |
| `bk_use_yn` | 223 |
| `insert_name` | 223 |

## inv_list_pd_point

레코드 261건, 열 12개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 261 |
| `pd_id` | 261 |
| `pd_tr_id` | 261 |
| `pd_point` | 261 |
| `pd_memo` | 1 |
| `pd_use_yn` | 261 |
| `pd_insert_dt` | 261 |
| `pd_insert_id` | 261 |
| `pd_update_dt` | 0 |
| `pd_update_id` | 261 |
| `pd_delete_dt` | 0 |
| `pd_delete_id` | 261 |

## inv_list_pu_point

레코드 2636건, 열 56개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 2636 |
| `pu_id` | 2636 |
| `pu_tr_id` | 2636 |
| `pu_td_id` | 2636 |
| `pu_point` | 2636 |
| `pu_sys` | 0 |
| `pu_key_id` | 2636 |
| `pu_memo` | 293 |
| `pu_cancel_pu_id` | 58 |
| `pu_insert_dt` | 2636 |
| `pu_insert_id` | 2636 |
| `td_id` | 2636 |
| `td_tr_id` | 2636 |
| `td_tc_id` | 2636 |
| `td_tt_id` | 2636 |
| `td_currency` | 2636 |
| `td_amount` | 2636 |
| `td_deposit_dt` | 2636 |
| `td_cancel_td_id` | 58 |
| `td_dp_id` | 2636 |
| `td_matching_dt` | 0 |
| `td_matching_yn` | 2636 |
| `td_dep_currency` | 0 |
| `td_dep_amount` | 0 |
| `td_dep_rate` | 0 |
| `td_memo` | 293 |
| `td_insert_id` | 2636 |
| `td_insert_dt` | 2636 |
| `tc_id` | 2636 |
| `tc_tr_id` | 2636 |
| `tc_ec_id` | 2636 |
| `tc_tt_id` | 2636 |
| `tc_currency` | 2636 |
| `tc_price` | 2636 |
| `tc_memo` | 293 |
| `tc_cancel_tc_id` | 58 |
| `tc_insert_dt` | 2636 |
| `tc_update_dt` | 0 |
| `tc_insert_id` | 2636 |
| `ec_id` | 2636 |
| `ec_aca_id` | 2636 |
| `ec_br_id` | 2636 |
| `ec_name` | 2636 |
| `ec_type` | 2636 |
| `ec_won` | 2636 |
| `ec_usd` | 2636 |
| `ec_yen` | 2636 |
| `ec_peso` | 2636 |
| `ec_insert_dt` | 2636 |
| `ec_start_date` | 2636 |
| `ec_finish_date` | 2636 |
| `ec_memo` | 0 |
| `ec_use_yn` | 2636 |
| `ec_point_flag` | 2636 |
| `ec_order` | 2636 |
| `insert_name` | 2636 |

## inv_etc

레코드 5279건, 열 16개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 5279 |
| `t_order` | 5279 |
| `tc_id` | 5279 |
| `td_id` | 2636 |
| `ec_type` | 2643 |
| `tc_currency` | 2643 |
| `tc_price` | 2643 |
| `td_currency` | 2636 |
| `td_amount` | 2636 |
| `td_dep_currency` | 0 |
| `td_dep_amount` | 0 |
| `td_dep_rate` | 0 |
| `memo` | 593 |
| `td_deposit_dt` | 2636 |
| `tc_type_name` | 2643 |
| `rest_amount` | 2643 |

## inv_invoice_list

레코드 11522건, 열 39개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `_tr_id` | 11522 |
| `ifd_id` | 11522 |
| `ifd_if_id` | 11522 |
| `ifd_type` | 11522 |
| `ifd_lang` | 11522 |
| `ifd_filename` | 11522 |
| `ifd_fileext` | 11522 |
| `ifd_fullname` | 11522 |
| `ifd_filesize` | 11522 |
| `ifd_down_cnt` | 11522 |
| `ifd_insert_dt` | 11522 |
| `ifd_batch_yn` | 11522 |
| `if_id` | 11522 |
| `if_tr_id` | 11522 |
| `if_tt_id` | 11522 |
| `if_num` | 11522 |
| `if_rand_num` | 11522 |
| `if_type` | 11522 |
| `if_lang` | 11522 |
| `if_insert_dt` | 11522 |
| `if_insert_id` | 11522 |
| `if_use_yn` | 11522 |
| `if_print_a_yn` | 11522 |
| `if_print_s_yn` | 11522 |
| `if_print_loa_yn` | 11522 |
| `if_print_pay_yn` | 11522 |
| `tt_id` | 328 |
| `tt_tr_id` | 328 |
| `tt_ini_ver` | 328 |
| `tt_collectible_yn` | 328 |
| `tt_collectible_set_id` | 328 |
| `tt_start_date` | 328 |
| `tt_finish_date` | 328 |
| `tt_week` | 328 |
| `tt_memo` | 28 |
| `tt_insert_dt` | 328 |
| `tt_insert_id` | 328 |
| `tt_etc` | 0 |
| `tt_temp_num` | 0 |
