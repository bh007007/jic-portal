/**
 * 귀국 항공편(디자인 05 '졸업 전 확인 > 귀국 항공편 등록'). 파일·네트워크에 의존하지 않는다.
 * 학생이 연수마다 하나 등록·수정하고, 인트라넷 '귀국 일정'이 공항 이동 배차에 읽는다.
 * 업체 추출본에는 귀국 항공편이 없어서 학생에게 받는다.
 */
import type { Db } from '../../admin/server/core';
import { isDate } from './requests';

/** 업체 데이터의 픽업 장소 값(tr_pick_place)과 같은 공항 + 기타 */
export const AIRPORTS = ['MANILA', 'CLARK', 'OTHER'] as const;
export type Airport = (typeof AIRPORTS)[number];
export const FLIGHT_MAX = 20;
export const DEP_NOTE_MAX = 200;
/** 출발일은 연수 종료일로부터 이 날수 안. 연수 뒤 여행하는 학생을 위한 임시 기준(docs/student-app.md). */
export const DEP_AFTER_END_DAYS = 30;

export interface Departure {
  id: string; // `dep-${trId}` (연수마다 하나)
  stId: string;
  trId: string;
  date: string; // 출발일(현지)
  time: string; // 출발 시각 'HH:MM'
  flight: string;
  airport: Airport;
  needsRide: boolean; // 공항 이동 차량 요청
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartureStore {
  listAll(): Promise<Departure[]>;
  get(id: string): Promise<Departure | null>;
  put(x: Departure): Promise<void>;
}

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const isHm = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** 귀국 항공편을 등록하는 연수: 재학 중인 연수, 없으면 가장 가까운 입학 예정 연수. */
export function departureEnrollment(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return null;
  const live = d.enrollments.filter((e) => e.start && e.end);
  const cur = live.find((e) => e.status === 'current');
  const up = live.filter((e) => e.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start))[0];
  const e = cur ?? up;
  return e ? { trId: e.trId, start: e.start, end: e.end, latest: addDays(e.end, DEP_AFTER_END_DAYS) } : null;
}

export type Outcome<T> = { ok: true; status: number; value: T } | { ok: false; status: number; error: string };

export interface DepartureInput {
  date?: unknown;
  time?: unknown;
  flight?: unknown;
  airport?: unknown;
  needsRide?: unknown;
  note?: unknown;
}

/** 등록·수정. today = 오늘(현지 날짜). 이미 출발일이 지난 항공편은 고칠 수 없다. */
export function saveDeparture(
  ctx: { db: Db; stId: string; now: () => Date; today: string },
  existing: Departure | null,
  input: DepartureInput,
): Outcome<Departure> {
  const e = departureEnrollment(ctx.db, ctx.stId);
  if (!e) return { ok: false, status: 400, error: 'no_enrollment' };
  if (existing && existing.date < ctx.today) return { ok: false, status: 409, error: 'departure_passed' };
  const flight = typeof input.flight === 'string' ? input.flight.trim().toUpperCase().replace(/\s+/g, ' ') : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const airport = input.airport as Airport;
  if (!isDate(input.date) || input.date < ctx.today || input.date < e.start || input.date > e.latest) return { ok: false, status: 400, error: 'date_out_of_range' };
  if (!isHm(input.time)) return { ok: false, status: 400, error: 'invalid_time' };
  if (!/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(flight) || flight.length > FLIGHT_MAX) return { ok: false, status: 400, error: 'invalid_flight' };
  if (!AIRPORTS.includes(airport)) return { ok: false, status: 400, error: 'invalid_airport' };
  if (note.length > DEP_NOTE_MAX) return { ok: false, status: 400, error: 'invalid_note' };
  if (airport === 'OTHER' && !note) return { ok: false, status: 400, error: 'note_required' };
  const now = ctx.now().toISOString();
  return {
    ok: true,
    status: existing ? 200 : 201,
    value: {
      id: `dep-${e.trId}`,
      stId: ctx.stId,
      trId: e.trId,
      date: input.date,
      time: input.time,
      flight,
      airport,
      needsRide: input.needsRide === true,
      note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };
}
