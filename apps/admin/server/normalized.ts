/**
 * 정규화 표(students·batches·enrollments, docs/schema.md) → 관리자 core 가 받는 업체 원본 모양(st_*·tr_*·sd_*).
 * 배포 읽기(functions/api)를 정규화 표로 바꿀 때 core 를 고치지 않고 같은 응답을 내려고 둔다(5단계 어댑터).
 * 시험 supabase/tests/core_schema_adapter.mjs 가 샘플로 legacy 경로와 응답이 같은지 본다.
 *
 * 들어오는 행은 Supabase REST(JSON) 모양이다: 날짜 'YYYY-MM-DD', 시각 ISO 문자열, 참·거짓, 숫자.
 * 업체 연수 행의 학생 열(이름·국적·성별 이름)과 am_ag_id(= ag_id)는 실제 데이터에서 모두 학생 행·에이전시 번호와 같아(11/10) 여기서 다시 만든다.
 * 연장(core extensions 입력)은 연장 인보이스 금액(sum_price·sum_amount)이 있어 회계 단계(3단계)까지 legacy_extensions 를 그대로 쓴다.
 */
import type { Raw } from './core';

export interface NStudent {
  student_no: string;
  name: string;
  last_name: string;
  first_name: string;
  birthday: string | null;
  gender: string;
  country: string;
  country_code: string;
  email: string;
  phone: string;
  language: string;
  vip_level: string;
}
export interface NBatch {
  id: string;
  departure_date: string | null;
  start_date: string | null;
  is_extra: boolean;
}
export interface NEnrollment {
  id: string;
  student_no: string;
  batch_id: string | null;
  campus_code: string;
  dorm_campus_code: string;
  courses: string;
  dorms: string;
  start_date: string | null;
  finish_date: string | null;
  weeks: number | null;
  state: string;
  state_name: string;
  country_code: string;
  country_name: string;
  currency: string;
  agency_id: string;
  agency_name: string;
  agency_name_en: string;
  agent_id: string;
  agent_name: string;
  branch: string;
  deposit_state: string;
  deposit_state_code: string;
  deposit_due_date: string | null;
  departure_date: string | null;
  return_date: string | null;
  pickup_type: string;
  pickup_place: string;
  pickup_flight: string;
  pickup_flight_num: string;
  pickup_arrival_at: string | null;
  pickup_terminal: string;
  pickup_remark: string;
  room_clear: boolean;
  point_clear: boolean;
  agency_memo: string;
  branch_memo: string;
  branch_memo_en: string;
  student_memo: string;
  bank_memo: string;
  account_memo: string;
  cancel_at: string | null;
  cancel_memo: string;
  cancel_train_at: string | null;
  cancel_train_memo: string;
  postpone_at: string | null;
  postpone_memo: string;
  expel_at: string | null;
  expel_memo: string;
  invoiced_at: string | null;
}

/** 정규화 표에서 읽을 열(functions/api 의 select). */
export const N_STUDENT_COLUMNS = 'student_no,name,last_name,first_name,birthday,gender,country,country_code,email,phone,language,vip_level';
export const N_BATCH_COLUMNS = 'id,departure_date,start_date,is_extra';
export const N_ENROLLMENT_COLUMNS =
  'id,student_no,batch_id,campus_code,dorm_campus_code,courses,dorms,start_date,finish_date,weeks,state,state_name,country_code,country_name,currency,' +
  'agency_id,agency_name,agency_name_en,agent_id,agent_name,branch,deposit_state,deposit_state_code,deposit_due_date,departure_date,return_date,' +
  'pickup_type,pickup_place,pickup_flight,pickup_flight_num,pickup_arrival_at,pickup_terminal,pickup_remark,room_clear,point_clear,' +
  'agency_memo,branch_memo,branch_memo_en,student_memo,bank_memo,account_memo,cancel_at,cancel_memo,cancel_train_at,cancel_train_memo,' +
  'postpone_at,postpone_memo,expel_at,expel_memo,invoiced_at';

const GENDER_NAME: Record<string, string> = { M: '남', F: '여' };
const MANILA_MS = 8 * 3600_000; // 필리핀은 UTC+8, 서머타임 없음
/** 업체 시각 모양('YYYY-MM-DD HH:MM:SS', 필리핀 시각)으로. 빈 값은 null. */
export function manilaText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + MANILA_MS).toISOString().slice(0, 19).replace('T', ' ');
}
/** 빈 글자는 업체 원본처럼 null 로(정규화 표는 빈 글자로 둔다). */
const txt = (v: string | null | undefined) => (v ? v : null);
const yn = (v: boolean) => (v ? 'Y' : 'N');

export function toLegacyStudents(rows: NStudent[]): Raw[] {
  return rows.map((s) => ({
    st_id: s.student_no,
    st_name: s.name,
    st_last_name: s.last_name,
    st_first_name: s.first_name,
    st_birthday: s.birthday,
    st_gender: s.gender,
    st_country: s.country_code,
    st_country_cd_name: s.country,
    st_email: txt(s.email),
    st_cell: txt(s.phone),
    st_lang_name: txt(s.language),
    st_vip_level: txt(s.vip_level),
  }));
}

export function toLegacyEnrollments(rows: NEnrollment[], students: NStudent[], batches: NBatch[]): Raw[] {
  const st = new Map(students.map((s) => [s.student_no, s]));
  const sd = new Map(batches.map((b) => [b.id, b]));
  return rows.map((e) => {
    const s = st.get(e.student_no);
    const b = e.batch_id ? sd.get(e.batch_id) : undefined;
    return {
      tr_id: e.id,
      tr_st_id: e.student_no,
      st_name: s?.name ?? '',
      st_last_name: s?.last_name ?? '',
      st_first_name: s?.first_name ?? '',
      st_country_name: s?.country ?? '',
      st_country: s?.country_code ?? '',
      st_gender_name: GENDER_NAME[s?.gender ?? ''] ?? '',
      first_co_ca_code: e.campus_code,
      first_do_ca_code: e.dorm_campus_code,
      courses: e.courses,
      dorms: e.dorms,
      tr_start_date: e.start_date,
      tr_finish_date: e.finish_date,
      tr_total_week: e.weeks == null ? null : String(e.weeks),
      ag_id: e.agency_id,
      am_ag_id: e.agency_id,
      ag_name: e.agency_name,
      ag_name_en: txt(e.agency_name_en),
      tr_am_id: e.agent_id,
      am_name: e.agent_name,
      am_branch: e.branch,
      tr_deposit_name: e.deposit_state,
      tr_deposit_state: e.deposit_state_code,
      tr_deposit_due_date: e.deposit_due_date,
      sd_name: e.batch_id ?? '',
      sd_departure_date: b?.departure_date ?? null,
      sd_start_date: b?.start_date ?? null,
      sd_extra_yn: b ? yn(b.is_extra) : null,
      tr_state: e.state,
      tr_state_name: e.state_name,
      tr_st_country: e.country_code,
      tr_st_country_name: e.country_name,
      tr_currency: e.currency,
      tr_departure_date: e.departure_date,
      tr_return_date: e.return_date,
      tr_pick_type: e.pickup_type,
      tr_pick_place: e.pickup_place,
      tr_pick_flight: txt(e.pickup_flight),
      tr_pick_flight_num: txt(e.pickup_flight_num),
      tr_pick_flight_arrival: manilaText(e.pickup_arrival_at),
      tr_pick_terminal: txt(e.pickup_terminal),
      tr_pick_remark: txt(e.pickup_remark),
      tr_room_clear_yn: yn(e.room_clear),
      tr_point_clear_yn: yn(e.point_clear),
      tr_ag_memo: txt(e.agency_memo),
      tr_br_memo: txt(e.branch_memo),
      tr_br_memo_en: txt(e.branch_memo_en),
      tr_st_memo: txt(e.student_memo),
      tr_bank_memo: txt(e.bank_memo),
      tr_acct_memo: txt(e.account_memo),
      tr_cancel_dt: manilaText(e.cancel_at),
      tr_cancel_memo: txt(e.cancel_memo),
      tr_cancel_train_dt: manilaText(e.cancel_train_at),
      tr_cancel_train_memo: txt(e.cancel_train_memo),
      tr_postpone_dt: manilaText(e.postpone_at),
      tr_postpone_memo: txt(e.postpone_memo),
      tr_expel_dt: manilaText(e.expel_at),
      tr_expel_memo: txt(e.expel_memo),
      tr_invoice_dt: manilaText(e.invoiced_at),
    };
  });
}

// ── 3단계: 회계 이력·기숙사 배정(20261110130000_core_schema_accounting.sql). core 가 읽는 열만(11/10 core 를 돌려 모은 목록).

export interface NExtension {
  id: string;
  enrollment_id: string;
  start_date: string | null;
  finish_date: string | null;
  weeks: number | null;
  memo: string;
  registered_at: string | null;
  price: number | null;
  paid: number | null;
  currency: string;
}
export interface NInvoice {
  enrollment_id: string;
  currency: string;
  total: number | null;
  paid: number | null;
  local_total: number | null;
  local_paid: number | null;
}
export interface NInvoicePart {
  id: string;
  enrollment_id: string;
  part_no: string;
  registered_at: string | null;
  weeks: number | null;
  start_date: string | null;
  finish_date: string | null;
  total: number | null;
  paid: number | null;
  local_total: number | null;
  local_paid: number | null;
}
export interface NBalance {
  enrollment_id: string;
  cost: number | null;
  payment: number | null;
  extend_count: number | null;
}
export interface NInvoiceLine {
  id: string;
  enrollment_id: string;
  side: 'student' | 'agency';
  version: number | null;
  item_type: string;
  item_name: string;
  currency: string;
  price: number | null;
  weeks: number | null;
  start_date: string | null;
  end_date: string | null;
  course_name: string;
  dorm_name: string;
  in_use: boolean;
  canceled: boolean;
}
export interface NLocalCharge {
  id: string;
  enrollment_id: string;
  charge_no: string;
  charge_type: string;
  charge_name: string;
  currency: string;
  price: number | null;
  rest_amount: number | null;
  payment_no: string;
  payment_currency: string;
  payment_amount: number | null;
  paid_at: string | null;
}
export interface NDeposit {
  id: string;
  deposited_at: string | null;
  payer_name: string;
  memo: string;
  currency: string;
  amount: number | null;
  fee: number | null;
  amount_total: number | null;
  confirmed: boolean;
  in_use: boolean;
  matched_count: number | null;
  matched_amount: number | null;
  matched_currency: string;
  matched_agency: string;
  balance: number | null;
}
export interface NPoint {
  id: string;
  enrollment_id: string;
  kind: string;
  at: string | null;
  points: number | null;
  item_name: string;
  staff_name: string;
  memo: string;
}
export interface NDorm {
  enrollment_id: string;
  dorm_name: string;
  dorm_short: string;
  dorm_type: string;
  campus_name: string;
  campus_code: string;
  start_date: string | null;
  end_date: string | null;
  weeks: number | null;
  canceled: boolean;
}

export const N_EXTENSION_COLUMNS = 'id,enrollment_id,start_date,finish_date,weeks,memo,registered_at,price,paid,currency';
export const N_INVOICE_COLUMNS = 'enrollment_id,currency,total,paid,local_total,local_paid';
export const N_INVOICE_PART_COLUMNS = 'id,enrollment_id,part_no,registered_at,weeks,start_date,finish_date,total,paid,local_total,local_paid';
export const N_BALANCE_COLUMNS = 'enrollment_id,cost,payment,extend_count';
export const N_INVOICE_LINE_COLUMNS = 'id,enrollment_id,side,version,item_type,item_name,currency,price,weeks,start_date,end_date,course_name,dorm_name,in_use,canceled';
export const N_LOCAL_CHARGE_COLUMNS = 'id,enrollment_id,charge_no,charge_type,charge_name,currency,price,rest_amount,payment_no,payment_currency,payment_amount,paid_at';
export const N_DEPOSIT_COLUMNS = 'id,deposited_at,payer_name,memo,currency,amount,fee,amount_total,confirmed,in_use,matched_count,matched_amount,matched_currency,matched_agency,balance';
export const N_POINT_COLUMNS = 'id,enrollment_id,kind,at,points,item_name,staff_name,memo';
export const N_DORM_COLUMNS = 'enrollment_id,dorm_name,dorm_short,dorm_type,campus_name,campus_code,start_date,end_date,weeks,canceled';

/** 금액·횟수는 업체 원본처럼 글자로(core 는 num() 으로 읽는다). */
const n = (v: number | string | null | undefined) => (v == null ? null : String(v));

export const toLegacyExtensions = (rows: NExtension[]): Raw[] =>
  rows.map((x) => ({
    tr_id: x.enrollment_id, tt_id: x.id, tt_start_date: x.start_date, tt_finish_date: x.finish_date, tt_week: n(x.weeks),
    tt_memo: txt(x.memo), tt_insert_dt: manilaText(x.registered_at), sum_price: n(x.price), sum_amount: n(x.paid), tr_currency: x.currency,
  }));
export const toLegacyInvoices = (rows: NInvoice[]): Raw[] =>
  rows.map((i) => ({ tr_id: i.enrollment_id, tr_currency: i.currency, sum_ic_price: n(i.total), sum_id_amount: n(i.paid), sum_tc_price: n(i.local_total), sum_td_amount: n(i.local_paid) }));
export const toLegacyInvoiceSummary = (rows: NInvoicePart[]): Raw[] =>
  rows.map((p) => ({
    _tr_id: p.enrollment_id, tt_id: p.part_no, tt_insert_dt: manilaText(p.registered_at), week: n(p.weeks), start_date: p.start_date, finish_date: p.finish_date,
    sum_ic_price: n(p.total), sum_id_amount: n(p.paid), sum_tc_price: n(p.local_total), sum_td_amount: n(p.local_paid),
  }));
export const toLegacyBalances = (rows: NBalance[]): Raw[] =>
  rows.map((b) => ({ tr_id: b.enrollment_id, cost: n(b.cost), payment: n(b.payment), extend_count: n(b.extend_count) }));
export const toLegacyInvoiceLines = (rows: NInvoiceLine[], side: NInvoiceLine['side']): Raw[] =>
  rows
    .filter((l) => l.side === side)
    .map((l) => ({
      _tr_id: l.enrollment_id, ic_ver: n(l.version), ic_type: l.item_type, ic_type_name: txt(l.item_name), ic_currency: l.currency, ic_price: n(l.price),
      ic_week: n(l.weeks), ic_departure_date: l.start_date, ic_return_date: l.end_date, co_name: txt(l.course_name), do_name: txt(l.dorm_name),
      ic_use_yn: l.in_use ? 'Y' : 'N', ic_cancel_yn: l.canceled ? 'Y' : 'N',
    }));
export const toLegacyLocalCosts = (rows: NLocalCharge[]): Raw[] =>
  rows.map((c) => ({
    _tr_id: c.enrollment_id, tc_id: txt(c.charge_no), ec_type: txt(c.charge_type), tc_type_name: txt(c.charge_name), tc_currency: txt(c.currency), tc_price: n(c.price),
    rest_amount: n(c.rest_amount), td_id: txt(c.payment_no), td_currency: txt(c.payment_currency), td_amount: n(c.payment_amount), td_deposit_dt: manilaText(c.paid_at),
  }));
export const toLegacyDeposits = (rows: NDeposit[]): Raw[] =>
  rows.map((d) => ({
    dp_id: d.id, dp_deposit_dt: manilaText(d.deposited_at), dp_name: d.payer_name, dp_memo: txt(d.memo), dp_currency: d.currency, dp_amount: n(d.amount),
    dp_fee: n(d.fee), dp_amount_total: n(d.amount_total), dp_confirm_yn: d.confirmed ? 'Y' : 'N', dp_use_yn: d.in_use ? 'Y' : 'N', cnt: n(d.matched_count),
    sum_id_amount: n(d.matched_amount), id_currency: txt(d.matched_currency), match_ag_name: txt(d.matched_agency), balance: n(d.balance),
  }));
export const toLegacyPointHistory = (rows: NPoint[]): Raw[] =>
  rows.map((p) => ({ tr_id: p.enrollment_id, type: p.kind, dt: manilaText(p.at), point: n(p.points), ec_name: txt(p.item_name), nickname: txt(p.staff_name), memo: txt(p.memo) }));
export const toLegacyDorms = (rows: NDorm[]): Raw[] =>
  rows.map((d) => ({
    tr_id: d.enrollment_id, do_name: d.dorm_name, do_name_short: txt(d.dorm_short), do_type: txt(d.dorm_type), ca_name: d.campus_name, ca_code: d.campus_code,
    ic_departure_date: d.start_date, ic_return_date: d.end_date, ic_week: n(d.weeks), ic_cancel_yn: d.canceled ? 'Y' : 'N',
  }));
