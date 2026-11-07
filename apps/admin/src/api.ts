import { useEffect, useState } from 'react';

export type Status = 'current' | 'upcoming' | 'graduated' | 'cancelled' | 'other';

export interface EnrollmentRow {
  trId: string;
  stId: string;
  name: string;
  nation: string;
  gender: string;
  campus: string;
  course: string;
  dorm: string;
  start: string;
  end: string;
  weeks: number;
  agency: string;
  branch: string;
  pay: string;
  batch: string;
  state: string;
  status: Status;
  note: string;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface Dashboard {
  refDate: string;
  current: { total: number; byCampus: NameCount[] };
  batches: { batch: string; date: string; count: number }[];
  graduating: { total: number; until: string; notCleared: number };
  pickup: { batches: { batch: string; date: string; count: number }[]; arrivals: number; missing: number; besa: number };
  nations: NameCount[];
  agencies: number;
  agents: number;
  sync: { extractedAt: string | null; counts: Record<string, number> };
}

export interface EnrollmentList {
  refDate: string;
  tab: string;
  tabCounts: { current: number; upcoming: number; graduated: number; all: number };
  total: number;
  page: number;
  pages: number;
  size: number;
  facets: { nations: string[]; batches: string[]; campuses: string[] };
  rows: EnrollmentRow[];
}

export interface StudentDetail {
  refDate: string;
  student: {
    stId: string;
    name: string;
    lastName: string;
    firstName: string;
    birthday: string;
    age: number | null;
    gender: string;
    nation: string;
    email: string;
    cell: string;
    lang: string;
    vip: string;
  };
  enrollments: (EnrollmentRow & {
    pickType: string;
    pickPlace: string;
    roomClear: boolean;
    pointClear: boolean;
    invoice: { currency: string; paid: number; pointIn: number; pointOut: number; pointBalance: number } | null;
    dormStay: { type: string; campus: string; from: string; to: string; weeks: number } | null;
    memos: { kind: string; text: string }[];
  })[];
}

export interface DormStay {
  trId: string;
  stId: string;
  name: string;
  nation: string;
  gender: string;
  campus: string;
  type: string;
  from: string;
  to: string;
}

export interface DormOverview {
  refDate: string;
  until: string;
  campus: string;
  campuses: string[];
  totals: { staying: number; arriving: number; leaving: number };
  types: { type: string; staying: number; female: number; male: number; arriving: number; leaving: number }[];
  arriving: DormStay[];
  leaving: DormStay[];
}

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? r.statusText);
        return body as T;
      })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);

  return state;
}

export const fmt = (n: number) => n.toLocaleString('ko-KR');
export const weekday = (d: string) => (d ? '일월화수목금토'[new Date(d + 'T00:00:00').getDay()] : '');
export const pct = (part: number, whole: number) => (whole ? ((part / whole) * 100).toFixed(1) + '%' : '-');
