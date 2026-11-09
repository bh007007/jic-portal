/**
 * /api 호출. 로그인 헤더는 auth.ts 가 붙인다(로컬 개발: X-Student-Id, Supabase: Authorization 토큰).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Absence, AbsenceInput, AbsenceList, ClassMark, Departure, DepartureView, LifeInput, LifeList, LifeRow, OvernightInput, OvernightList, OvernightRow, Profile, TimetableView, TripDetail, TripList, TripRow } from '../server/core';
import type { DepartureInput } from '../server/departures';
import { authHeaders, recheck } from './auth';

export type { Absence, AbsenceList, ClassMark, Departure, DepartureView, LifeList, LifeRow, OvernightList, OvernightRow, Profile, TimetableView, TripDetail, TripList, TripRow };
export type LifeCategory = LifeRow['category'];
export type LifeStatus = LifeRow['status'];
export type AbsenceKind = Absence['kind'];
export type AbsenceStatus = Absence['status'];

export interface Meta {
  source: 'sample' | 'extract';
  refDate: string;
  localLogin: boolean;
  /** 샘플 데이터일 때만: 로그인 화면에 보여 줄 시험용 학생 */
  sampleLogin: { stId: string; birthday: string } | null;
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
  const headers: Record<string, string> = await authHeaders();
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method: init?.method ?? 'GET', headers, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 토큰 만료(401)·비밀번호 변경 필요(403)면 로그인 상태를 다시 맞춘다(로그인 화면이나 비밀번호 변경 화면으로).
    if (res.status === 401 || (res.status === 403 && data?.error === 'password_change_required')) void recheck(res.status);
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
/** 진단서 사진(11/10 결정 I10): image 는 data URL(화면이 줄여서 보낸다) */
export const uploadAbsenceDoc = (id: string, image: string) => api<Absence>(`/api/absences/${encodeURIComponent(id)}/document`, { method: 'POST', body: { image } });
export const readAbsenceDoc = (id: string) => api<{ image: string }>(`/api/absences/${encodeURIComponent(id)}/document`);
export const createOvernight = (input: OvernightInput) => api<OvernightRow>('/api/overnights', { method: 'POST', body: input });
export const cancelOvernight = (id: string) => api<OvernightRow>(`/api/overnights/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
export const createLife = (input: LifeInput) => api<LifeRow>('/api/life-requests', { method: 'POST', body: input });
export const cancelLife = (id: string) => api<LifeRow>(`/api/life-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
export const saveDeparture = (input: DepartureInput) => api<Departure>('/api/departure', { method: 'PUT', body: input });
export const signUpTrip = (id: string) => api<TripRow>(`/api/trips/${encodeURIComponent(id)}/signup`, { method: 'POST', body: {} });
export const cancelTripSignup = (id: string) => api<TripRow>(`/api/trips/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
