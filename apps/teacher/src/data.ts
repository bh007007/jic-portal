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

export const CEFR_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const SCALE_LABEL: Record<TestType['scale'], string> = { band: '밴드', score: '점수', level: '레벨', percent: '퍼센트' };
export const MATERIAL_KINDS: [string, string][] = [
  ['book', '교재'], ['worksheet', '워크시트'], ['slides', '슬라이드'], ['audio', '음성'], ['video', '영상'], ['test', '시험지'], ['answer', '정답지'], ['other', '기타'],
];
export const kindLabel = (k: string) => MATERIAL_KINDS.find(([v]) => v === k)?.[1] ?? k;

export const loadStudents = (on?: string) => must<LmsStudent[]>(supabase.rpc('lms_students', on ? { p_on: on } : {}));
export const loadTestTypes = () => must<TestType[]>(supabase.from('test_types').select('*').order('sort').order('code'));
export const loadCefr = () => must<CefrMapping[]>(supabase.from('cefr_mappings').select('*'));
export const loadResults = (studentNo: string) =>
  must<TestResult[]>(supabase.from('test_results').select('*').eq('student_no', studentNo).order('test_date', { ascending: false }).order('created_at', { ascending: false }));
export const loadRecentResults = (limit = 30) =>
  must<TestResult[]>(supabase.from('test_results').select('*').order('created_at', { ascending: false }).limit(limit));
export const loadMaterials = () => must<Material[]>(supabase.from('materials').select('*').order('course').order('textbook').order('unit').order('sort').order('title'));
export const loadStaff = () => must<StaffRow[]>(supabase.from('staff').select('*').order('active', { ascending: false }).order('name'));

/** 점수에 맞는 CEFR(JIC 기준 추정 레벨, 원칙 L2). 대응 기준이 없으면 빈 값. */
export function cefrOf(maps: CefrMapping[], testType: string, value: number): string {
  const rows = maps.filter((m) => m.test_type === testType && value >= Number(m.min_value));
  rows.sort((a, b) => Number(b.min_value) - Number(a.min_value));
  return rows[0]?.cefr ?? '';
}
