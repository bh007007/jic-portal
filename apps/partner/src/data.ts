import { useCallback, useEffect, useState } from 'react';
import { must, supabase } from './supabase';

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
  lessons?: string;
  intensity?: string;
  budget?: string;
  includes?: string;
}

export interface Course {
  id: string;
  campus_id: string;
  name: string;
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
  options: [string, string][];
}

export interface Rule {
  when: Record<string, string[]>;
  campus: string;
  first: string;
  alt?: string;
  weeks?: number;
}

export interface RuleSet {
  id: number;
  version: string;
  status: 'draft' | 'approved';
  note: string | null;
  questions: Question[];
  rules: Rule[];
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

export const today = () => new Date().toISOString().slice(0, 10);

export const isActivePromotion = (n: Notice, d = today()) => (!n.starts_on || n.starts_on <= d) && (!n.ends_on || n.ends_on >= d);

export const fmtSize = (n: number | null) =>
  n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
