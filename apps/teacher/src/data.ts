import { must, supabase } from './supabase';

// 강사 포털이 쓰는 공용 DB 모양(supabase/migrations/20261108200000_teacher_portal.sql).

export interface LmsStudent {
  student_no: string;
  enrollment_id: string;
  name: string;
  nation: string;
  gender: string;
  campus: string;
  course: string;
  dorm: string;
  start_date: string;
  end_date: string;
  batch: string;
}

export interface TestType {
  code: string;
  name: string;
  course: string;
  scale: 'band' | 'score' | 'level' | 'percent';
  min_value: number;
  max_value: number;
  step: number;
  sections: string[];
  sort: number;
  active: boolean;
}

export interface CefrMapping {
  test_type: string;
  cefr: string;
  min_value: number;
}

export interface TestResult {
  id: string;
  student_no: string;
  enrollment_id: string;
  test_type: string;
  test_date: string;
  section: string;
  value: number;
  note: string;
  teacher_id: string | null;
  teacher_name: string;
  created_at: string;
}

export interface Material {
  id: string;
  course: string;
  textbook: string;
  unit: string;
  kind: string;
  title: string;
  url: string;
  campus: string;
  sort: number;
  student_visible: boolean;
  created_by: string | null;
  created_by_name: string;
}

export interface StaffRow {
  id: string;
  user_id: string | null;
  kind: 'teacher' | 'staff';
  name: string;
  nickname: string;
  campus: string;
  legacy_id: string | null;
  active: boolean;
}

export interface LmsAbsence {
  id: string;
  student_no: string;
  name: string;
  campus: string;
  absence_date: string;
  periods: number[]; // 빈 배열 = 종일
  kind: 'sick' | 'official' | 'personal';
  status: 'pending' | 'approved' | 'rejected';
}
export const loadAbsences = (from?: string, to?: string) =>
  must<LmsAbsence[]>(supabase.rpc('lms_absences', { ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}) }));

export const CEFR_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const SCALES: TestType['scale'][] = ['band', 'score', 'level', 'percent'];
// 화면 이름은 i18n 의 kind_*·scale_*·abs_*·st_* 키
export const MATERIAL_KINDS = ['book', 'worksheet', 'slides', 'audio', 'video', 'test', 'answer', 'other'] as const;

export const loadStudents = (on?: string) => must<LmsStudent[]>(supabase.rpc('lms_students', on ? { p_on: on } : {}));
export const loadTestTypes = () => must<TestType[]>(supabase.from('test_types').select('*').order('sort').order('code'));
export const loadCefr = () => must<CefrMapping[]>(supabase.from('cefr_mappings').select('*'));
export const loadResults = (studentNo: string) =>
  must<TestResult[]>(supabase.from('test_results').select('*').eq('student_no', studentNo).order('test_date', { ascending: false }).order('created_at', { ascending: false }));
export const loadRecentResults = (limit = 30) =>
  must<TestResult[]>(supabase.from('test_results').select('*').order('created_at', { ascending: false }).limit(limit));
export interface Holiday {
  day: string;
  campus: string; // '' = 모든 캠퍼스
  name: string;
  kind: 'public' | 'school';
}
/** 휴일(관리자 포털 기초관리 > 휴일, 20261108230000_holidays.sql). 표가 아직 없거나 못 읽으면 빈 목록(홈 안내만 빠진다). */
export async function loadHolidays(from: string, to: string): Promise<Holiday[]> {
  const { data, error } = await supabase.from('holidays').select('day, campus, name, kind').gte('day', from).lte('day', to).order('day');
  return error ? [] : ((data ?? []) as Holiday[]);
}

/** 한 시험·한 날짜의 기록(여러 명 입력에서 이미 넣은 점수 표시용) */
export const loadResultsOn = (testType: string, date: string) =>
  must<TestResult[]>(supabase.from('test_results').select('*').eq('test_type', testType).eq('test_date', date));
/** DB 트리거(test_results_check)와 같은 규칙: 범위 안, 최소값에서 단위의 배수 */
export function validScore(t: Pick<TestType, 'min_value' | 'max_value' | 'step'>, v: number): boolean {
  const min = Number(t.min_value);
  const max = Number(t.max_value);
  const step = Number(t.step);
  if (!Number.isFinite(v) || v < min || v > max) return false;
  const k = (v - min) / step;
  return Math.abs(k - Math.round(k)) < 1e-9;
}
export const loadMaterials = () => must<Material[]>(supabase.from('materials').select('*').order('course').order('textbook').order('unit').order('sort').order('title'));
export const loadStaff = () => must<StaffRow[]>(supabase.from('staff').select('*').order('active', { ascending: false }).order('name'));

/** 점수에 맞는 CEFR(JIC 기준 추정 레벨, 원칙 L2). 대응 기준이 없으면 빈 값. */
export function cefrOf(maps: CefrMapping[], testType: string, value: number): string {
  const rows = maps.filter((m) => m.test_type === testType && value >= Number(m.min_value));
  rows.sort((a, b) => Number(b.min_value) - Number(a.min_value));
  return rows[0]?.cefr ?? '';
}

// ── 출석 (supabase/migrations/20261109000000_attendance.sql). 단위는 업체 정규 출석과 같다: 수업 × 학생.
export type AttResult = 'AT' | 'AB' | 'TA';
export interface LmsSession {
  id: string;
  day: string;
  start_time: string; // HH:MM:SS
  minutes: number;
  campus: string;
  kind: '1' | 'G';
  subject: string;
  teacher_id: string | null;
  teacher_name: string;
  sub_teacher_name: string;
  room: string;
  students: number;
  checked: number;
  absent: number;
  late: number;
  mine: boolean;
  closed: boolean;
}
export interface AttendanceRow {
  session_id: string;
  student_no: string;
  enrollment_id: string;
  result: AttResult | null;
  late_min: number | null;
  excused: boolean;
  note: string;
  checked_name: string;
  checked_at: string | null;
}
export interface AttendanceClosing {
  day: string;
  campus: string;
  closed_name: string;
  closed_at: string;
}
export const loadSessions = (day: string, campus = '') => must<LmsSession[]>(supabase.rpc('lms_sessions', { p_day: day, p_campus: campus }));
export const loadSessionDay = async (id: string) => (await must<{ day: string }[]>(supabase.from('class_sessions').select('day').eq('id', id)))[0]?.day ?? null;
export const loadAttendance = (sessionId: string) => must<AttendanceRow[]>(supabase.from('attendance').select('*').eq('session_id', sessionId).order('student_no'));
/** 한 학생 체크. 권한이 없으면 RLS가 0행으로 걸러 내므로 0행도 오류로 본다. */
export async function markAttendance(sessionId: string, studentNo: string, patch: Partial<Pick<AttendanceRow, 'result' | 'late_min' | 'excused' | 'note'>>) {
  const rows = await must<AttendanceRow[]>(supabase.from('attendance').update(patch).eq('session_id', sessionId).eq('student_no', studentNo).select());
  if (!rows.length) throw new Error('row-level security');
  return rows[0];
}
export const markAllPresent = (sessionId: string) => must<number>(supabase.rpc('attendance_mark_all', { p_session: sessionId }));
export const loadClosings = (day: string) => must<AttendanceClosing[]>(supabase.from('attendance_closings').select('*').eq('day', day));
export const closeDay = (day: string, campus: string) => must(supabase.from('attendance_closings').insert({ day, campus }));
export const reopenDay = (day: string, campus: string) => must(supabase.from('attendance_closings').delete().eq('day', day).eq('campus', campus));
