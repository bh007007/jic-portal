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
