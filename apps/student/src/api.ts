/**
 * /api 호출. 로그인한 학생 번호는 이 탭(sessionStorage)에만 두고 X-Student-Id 헤더로 보낸다.
 * 이 방식은 로컬 개발 서버 전용이다. 배포에서는 Supabase Auth 토큰(Authorization)으로 바꾼다(docs/student-app.md).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Absence, AbsenceInput, AbsenceList, OvernightInput, OvernightList, OvernightRow, Profile } from '../server/core';

export type { Absence, AbsenceList, OvernightList, OvernightRow, Profile };
export type AbsenceKind = Absence['kind'];
export type AbsenceStatus = Absence['status'];

export interface Meta {
  source: 'sample' | 'extract';
  refDate: string;
  localLogin: boolean;
  /** 샘플 데이터일 때만: 로그인 화면에 보여 줄 시험용 학생 */
  sampleLogin: { stId: string; birthday: string } | null;
}

const SESSION_KEY = 'jic-student-session';
const listeners = new Set<() => void>();
let memorySession: string | null = null;

export function getStudentId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memorySession;
  }
}

export function setStudentId(stId: string | null) {
  memorySession = stId;
  try {
    if (stId) sessionStorage.setItem(SESSION_KEY, stId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소를 못 쓰면 메모리에만 둔다
  }
  listeners.forEach((fn) => fn());
}

export function useStudentId() {
  const [stId, setId] = useState(getStudentId);
  useEffect(() => {
    const fn = () => setId(getStudentId());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return stId;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  const stId = getStudentId();
  if (stId) headers['X-Student-Id'] = stId;
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method: init?.method ?? 'GET', headers, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && stId && path !== '/api/login') setStudentId(null);
    throw new ApiError(res.status, (data && typeof data.error === 'string' && data.error) || 'unknown');
  }
  return data as T;
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e: ApiError) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, reload };
}

export const createAbsence = (input: AbsenceInput) => api<Absence>('/api/absences', { method: 'POST', body: input });
export const cancelAbsence = (id: string) => api<Absence>(`/api/absences/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
export const createOvernight = (input: OvernightInput) => api<OvernightRow>('/api/overnights', { method: 'POST', body: input });
export const cancelOvernight = (id: string) => api<OvernightRow>(`/api/overnights/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
export const login = (stId: string, birthday: string) => api<{ stId: string }>('/api/login', { method: 'POST', body: { stId, birthday } });
