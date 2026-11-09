import { useCallback, useEffect, useState } from 'react';
import { must, supabase } from './supabase';
import { today } from './shared';

export { courseLabel, fmtSize, today } from './shared';

export interface Campus {
  id: string;
  name: string;
  tagline: string | null;
  status: 'open' | 'preparing';
  sort: number;
  direction?: string | null;
  environment?: string | null;
  facilities?: string | null;
  activities?: string | null;
  life?: string | null;
}

export interface Level {
  name: string;
  /** 수업량(하루 교시·1:1 수업 수) */
  lessons?: string;
  intensity?: string;
  /** 예전 '예산 수준'. 조건표 v2.1부터 가격은 견적 사이트 값이라 화면에 쓰지 않는다 */
  budget?: string;
  includes?: string;
  /** 관리용 메모(화면에 내보내지 않음) */
  note?: string;
  /** 단계 선택 화면에서 먼저 골라 둘 옵션(Challenger ESL·IELTS, CL-007). TEP·Speaking·1:1 맞춤 과정은 없음(CL-020) */
  default?: boolean;
}

export interface Course {
  id: string;
  campus_id: string;
  name: string;
  /** 화면 표시 이름(CL-009: Senior → '1:1 맞춤 과정'). 견적·DB 에는 name 을 쓴다 */
  display_name?: string | null;
  levels: Level[];
  sort: number;
  status: 'open' | 'preparing';
}

export interface CourseContent {
  course_id: string;
  summary: string | null;
  target: string | null;
  structure: string | null;
  outcomes: string | null;
  media_links: string | null;
  reason_learning: string | null;
  reason_growth: string | null;
  reason_environment: string | null;
}

export interface Question {
  id: string;
  label: string;
  /** 답변 요약에 쓰는 짧은 이름(없으면 label) */
  short?: string;
  options: [string, string][];
}

/** 예전 샘플 규칙(sample-1): 위에서부터 조건이 모두 맞는 첫 규칙 */
export interface Rule {
  when: Record<string, string[]>;
  campus: string;
  first: string;
  alt?: string;
  weeks?: number;
}

export type Mark = '◎' | '○' | '×';

/** 조건표의 코스 한 열(v2.1 '추천 조건표' 시트) */
export interface ScoreCourse {
  course: string;
  /** 질문 id → 선택지 값 → ◎○× */
  marks: Record<string, Record<string, Mark>>;
  min_weeks: number | null;
  /** 권장 기간(주) */
  weeks: number | null;
  /** 대안 코스와 대안이 되는 조건 */
  alt: string | null;
  alt_when: string | null;
  /** 선행 코스(수준이 낮을 때 먼저). 보여 주는 방식은 결정 대기라 화면에 쓰지 않는다 */
  prereq: string | null;
  prereq_weeks: number | null;
  status: string;
  visible: boolean;
  approval?: string;
  note?: string | null;
  /** 단계 선택 화면에서 하루 수업량을 함께 보여 줄 코스(CL-008: 1:1 맞춤 과정 ↔ TEP) */
  compare?: string;
}

export interface LevelCheck {
  question: string;
  unknown: string;
  note: string;
  items: { label: string; options: string[] }[];
  bands: { min: number; max: number; level: string }[];
}

/** 조건표 v2.1 점수 방식(CL-021) */
export interface ScoreModel {
  model: 'score';
  source?: string;
  /** 질문 시작 전 안내(CL-003) */
  intro?: string;
  points: Record<string, number>;
  level_check?: LevelCheck;
  courses: ScoreCourse[];
}

export interface RuleSet {
  id: number;
  version: string;
  status: 'draft' | 'approved';
  note: string | null;
  questions: Question[];
  rules: Rule[] | ScoreModel;
  level_defaults: Record<string, Record<string, string>>;
  updated_at: string;
}

export interface Notice {
  id: number;
  kind: 'notice' | 'promotion';
  tag: string;
  title: string;
  body: string | null;
  target: string | null;
  pinned: boolean;
  starts_on: string | null;
  ends_on: string | null;
  published: boolean;
  created_at: string;
}

export interface Resource {
  id: number;
  category: string;
  title: string;
  description: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  link_url: string | null;
  updated_on: string;
  created_at: string;
}

/** 비동기 조회를 컴포넌트 상태로. reload 로 다시 부른다. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: (e as Error).message ?? String(e), loading: false }));
    return () => {
      alive = false;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(run, [run]);
  return { ...state, reload: run };
}

export const loadCampuses = () => must<Campus[]>(supabase.from('campuses').select('*').order('sort'));
/** 로그인 전(anon)은 캠퍼스 카드에 쓰는 열만 읽을 수 있다. */
export const loadPublicCampuses = () => must<Campus[]>(supabase.from('campuses').select('id,name,tagline,status,sort').order('sort'));
export const loadCourses = () => must<Course[]>(supabase.from('courses').select('*').order('campus_id').order('sort'));
export const loadContents = () => must<CourseContent[]>(supabase.from('course_contents').select('*'));

export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await must<{ key: string; value: string }[]>(supabase.from('partner_settings').select('key,value'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** 승인본이 있으면 승인본, 없으면 가장 최근 초안. */
export async function loadRuleSet(): Promise<RuleSet | null> {
  const rows = await must<RuleSet[]>(supabase.from('recommendation_rules').select('*').order('updated_at', { ascending: false }));
  return rows.find((r) => r.status === 'approved') ?? rows[0] ?? null;
}

export const isActivePromotion = (n: Notice, d = today()) => (!n.starts_on || n.starts_on <= d) && (!n.ends_on || n.ends_on >= d);
