/**
 * 학교 여행·액티비티(업체 'Outing > Travel'의 tra 여행 / trt 신청자, 기획안 'Travel → 여행 신청과 외박 허용').
 * 직원이 인트라넷에서 여행을 올리고(날짜·장소·정원·비용·신청 마감), 학생이 앱에서 참가 신청·취소한다.
 * 1박 이상 여행은 참가 신청한 학생의 그 밤들을 외박 허용으로 본다(tripPermits: 통금 확인·가드 태블릿).
 * 학생 앱과 인트라넷이 같이 쓴다(쓰기는 나뉜다: 여행 등록·수정·마감·명단 제외는 직원, 신청·취소는 학생. 기획안 C2).
 * 파일·네트워크 의존 없음. 배포에서는 같은 규칙을 DB 함수가 한 번 더 확인한다(supabase/migrations/20261108160000_school_trips.sql).
 */
import type { Db } from '../../admin/server/core';
import { isDate, nightsBetween, type Outcome, type Overnight } from './requests';

/** open 신청 받는 중 · closed 신청 마감(직원이 일찍 닫음) · cancelled 여행 취소 */
export type TripStatus = 'open' | 'closed' | 'cancelled';
export const TRIP_STATUSES: TripStatus[] = ['open', 'closed', 'cancelled'];
/** applied 참가 신청 · cancelled 학생이 취소 · removed 직원이 명단에서 뺌(사유는 학생에게 보인다) */
export type SignupStatus = 'applied' | 'cancelled' | 'removed';

export const TRIP_TITLE_MAX = 100;
export const TRIP_PLACE_MAX = 100;
export const TRIP_MEETING_MAX = 100;
export const TRIP_DESC_MAX = 1000;
export const TRIP_CAPACITY_MAX = 500;
export const TRIP_COST_MAX = 1_000_000; // PHP
/** 여행 기간 상한(박). 학교 여행은 짧다. 더 긴 일정이 생기면 늘린다. */
export const TRIP_NIGHTS_MAX = 14;
export const REMOVE_REASON_MAX = 300;

export interface Trip {
  id: string;
  campus: string; // '' = 전체 캠퍼스
  title: string;
  place: string; // 장소·행선지
  meeting: string; // 집합 시간·장소(선택)
  description: string; // 일정·포함 사항·준비물(선택)
  start: string; // 출발일
  end: string; // 돌아오는 날(당일 여행이면 출발일과 같다)
  deadline: string; // 신청 마감일(그날까지), 출발일 이전
  capacity: number;
  cost: number; // PHP, 0 = 무료
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null; // 올린 직원(학생 화면에는 내보내지 않는다)
  /** 참가 신청한 학생 수(읽을 때 채운다: 로컬은 신청 파일에서 세고, 배포는 DB 가 함수로 유지하는 seats_taken) */
  taken: number;
}

export interface TripSignup {
  id: string;
  tripId: string;
  stId: string;
  trId: string; // 여행 날짜가 들어가는 연수
  status: SignupStatus;
  createdAt: string;
  updatedAt: string;
  reason: string | null; // 직원이 명단에서 뺀 사유
  handledAt: string | null;
  handledBy: string | null; // 명단에서 뺀 직원(학생 화면에는 내보내지 않는다)
}

export interface TripStore {
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  putTrip(t: Trip): Promise<void>;
  /** 직원은 모두, 학생은 자기 것만(배포 RLS), 가드는 참가 신청(applied)만 */
  listSignups(tripId?: string): Promise<TripSignup[]>;
  signupsByStudent(stId: string): Promise<TripSignup[]>;
  getSignup(id: string): Promise<TripSignup | null>;
  putSignup(s: TripSignup): Promise<void>;
}

const done = <T>(value: T, status = 200): Outcome<T> => ({ ok: true, status, value });
const fail = <T>(status: number, error: string): Outcome<T> => ({ ok: false, status, error });
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);

export const tripNights = (t: Pick<Trip, 'start' | 'end'>) => nightsBetween(t.start, t.end);
export const seatsLeft = (t: Trip) => Math.max(0, t.capacity - t.taken);
/** 학생이 지금 신청할 수 있는 상태인지(정원·연수는 따로 본다) */
export const isAccepting = (t: Trip, today: string) => t.status === 'open' && today <= t.deadline;

export interface TripInput {
  campus?: unknown;
  title?: unknown;
  place?: unknown;
  meeting?: unknown;
  description?: unknown;
  start?: unknown;
  end?: unknown;
  deadline?: unknown;
  capacity?: unknown;
  cost?: unknown;
}

/**
 * 직원: 여행 등록(cur 없음)·수정. 새 여행은 출발일이 오늘 이후여야 한다. 수정은 지난 여행도 고칠 수 있다(기록 정리).
 * 정원은 이미 신청한 학생 수보다 줄일 수 없다. 상태는 setTripStatus 로만 바꾼다.
 */
export function saveTrip(
  ctx: { now: () => Date; newId: () => string; today: string; actor: string | null; campuses: string[] },
  cur: Trip | null,
  input: TripInput,
): Outcome<Trip> {
  const campus = text(input.campus);
  const title = text(input.title);
  const place = text(input.place);
  const meeting = text(input.meeting);
  const description = text(input.description);
  const { start, end, deadline } = input;
  const capacity = int(input.capacity);
  const cost = input.cost === undefined || input.cost === '' ? 0 : int(input.cost);
  if (campus && !ctx.campuses.includes(campus)) return fail(400, 'invalid_campus');
  if (!title) return fail(400, 'title_required');
  if (title.length > TRIP_TITLE_MAX) return fail(400, 'title_too_long');
  if (!place) return fail(400, 'place_required');
  if (place.length > TRIP_PLACE_MAX) return fail(400, 'place_too_long');
  if (meeting.length > TRIP_MEETING_MAX) return fail(400, 'meeting_too_long');
  if (description.length > TRIP_DESC_MAX) return fail(400, 'description_too_long');
  if (!isDate(start) || !isDate(end)) return fail(400, 'invalid_date');
  if (end < start) return fail(400, 'end_before_start');
  if (nightsBetween(start, end) > TRIP_NIGHTS_MAX) return fail(400, 'trip_too_long');
  if (!cur && start < ctx.today) return fail(400, 'start_in_past');
  if (!isDate(deadline)) return fail(400, 'invalid_deadline');
  if (deadline > start) return fail(400, 'deadline_after_start');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > TRIP_CAPACITY_MAX) return fail(400, 'invalid_capacity');
  if (cur && capacity < cur.taken) return fail(409, 'capacity_below_signups');
  if (!Number.isInteger(cost) || cost < 0 || cost > TRIP_COST_MAX) return fail(400, 'invalid_cost');
  const at = ctx.now().toISOString();
  const fields = { campus, title, place, meeting, description, start, end, deadline, capacity, cost };
  if (cur) {
    if (cur.status === 'cancelled') return fail(409, 'trip_cancelled');
    return done({ ...cur, ...fields, updatedAt: at });
  }
  return done({ id: ctx.newId(), ...fields, status: 'open', createdAt: at, updatedAt: at, createdBy: ctx.actor, taken: 0 }, 201);
}

/** 직원: 신청 마감(closed)·다시 받기(open)·여행 취소(cancelled). 취소한 여행은 되돌리지 않는다(학생에게 취소로 보인다). */
export function setTripStatus(cur: Trip | null, status: unknown, now: Date): Outcome<Trip> {
  if (!cur) return fail(404, 'not_found');
  if (!TRIP_STATUSES.includes(status as TripStatus)) return fail(400, 'invalid_status');
  if (cur.status === 'cancelled') return fail(409, 'trip_cancelled');
  if (cur.status === status) return fail(409, 'same_status');
  return done({ ...cur, status: status as TripStatus, updatedAt: now.toISOString() });
}

/** 학생이 여행을 볼 수 있는 캠퍼스: 재학 중·입학 예정 연수의 캠퍼스 */
export function studentCampuses(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return [];
  return [...new Set(d.enrollments.filter((e) => e.status === 'current' || e.status === 'upcoming').map((e) => e.campus))];
}
export const visibleTo = (t: Trip, campuses: string[]) => t.campus === '' || campuses.includes(t.campus);

/** 여행 날짜(출발일~돌아오는 날)가 모두 들어가는, 재학 중·입학 예정 연수 */
export function tripEnrollment(db: Db, stId: string, t: Pick<Trip, 'start' | 'end' | 'campus'>) {
  const d = db.studentDetail(stId);
  if (!d) return null;
  return (
    d.enrollments.find(
      (e) => (e.status === 'current' || e.status === 'upcoming') && e.start && e.end && e.start <= t.start && t.end <= e.end && (t.campus === '' || e.campus === t.campus),
    ) ?? null
  );
}

/** 학생: 참가 신청. 신청 받는 중, 마감일 전, 자리 있음, 여행 날짜가 연수 기간 안, 같은 여행에 이미 신청하지 않았을 때. */
export function signUp(
  ctx: { db: Db; stId: string; now: () => Date; newId: () => string; today: string },
  t: Trip | null,
  mine: TripSignup[],
): Outcome<TripSignup> {
  if (!t || !visibleTo(t, studentCampuses(ctx.db, ctx.stId))) return fail(404, 'not_found');
  if (t.status === 'cancelled') return fail(409, 'trip_cancelled');
  if (t.status === 'closed' || ctx.today > t.deadline) return fail(409, 'trip_closed');
  if (mine.some((s) => s.tripId === t.id && s.status === 'applied')) return fail(409, 'already_applied');
  if (t.taken >= t.capacity) return fail(409, 'trip_full');
  const e = tripEnrollment(ctx.db, ctx.stId, t);
  if (!e) return fail(400, 'outside_enrollment');
  const at = ctx.now().toISOString();
  return done({ id: ctx.newId(), tripId: t.id, stId: ctx.stId, trId: e.trId, status: 'applied', createdAt: at, updatedAt: at, reason: null, handledAt: null, handledBy: null }, 201);
}

/** 학생: 신청 취소. 신청 마감일까지만(그 뒤에는 담당 직원에게 말한다). */
export function cancelSignup(cur: TripSignup | null, t: Trip | null, stId: string, now: Date, today: string): Outcome<TripSignup> {
  if (!cur || cur.stId !== stId || !t) return fail(404, 'not_found');
  if (cur.status !== 'applied') return fail(409, 'not_applied');
  if (t.status === 'cancelled') return fail(409, 'trip_cancelled');
  if (today > t.deadline) return fail(409, 'deadline_passed');
  return done({ ...cur, status: 'cancelled', updatedAt: now.toISOString() });
}

/** 직원: 명단에서 빼기(사유 필수, 학생에게 보인다). 다시 넣으려면 학생이 다시 신청한다. */
export function removeSignup(cur: TripSignup | null, input: { reason?: unknown }, actor: string | null, now: Date): Outcome<TripSignup> {
  if (!cur) return fail(404, 'not_found');
  if (cur.status !== 'applied') return fail(409, 'not_applied');
  const reason = text(input.reason);
  if (!reason) return fail(400, 'reason_required');
  if (reason.length > REMOVE_REASON_MAX) return fail(400, 'reason_too_long');
  const at = now.toISOString();
  return done({ ...cur, status: 'removed', reason, handledAt: at, handledBy: actor, updatedAt: at });
}

/** 로컬 저장소용: 신청 목록에서 여행별 참가 신청 수를 센다(배포는 DB 의 seats_taken). */
export function withTaken(trips: Omit<Trip, 'taken'>[], signups: TripSignup[]): Trip[] {
  const n = new Map<string, number>();
  for (const s of signups) if (s.status === 'applied') n.set(s.tripId, (n.get(s.tripId) ?? 0) + 1);
  return trips.map((t) => ({ ...t, taken: n.get(t.id) ?? 0 }));
}

/**
 * 1박 이상 여행의 참가 신청을 승인된 외박처럼 본다: 출발일 밤부터 돌아오는 날 전날 밤까지 통금 확인에서 빠지고
 * 가드 태블릿에 '외박 허용'으로 보인다. 취소된 여행·취소하거나 명단에서 빠진 신청은 넣지 않는다.
 * 신청 마감 전에도 참가 신청만으로 허용한다(직원은 명단에서 빼서 바로 거둔다).
 */
export function tripPermits(trips: Trip[], signups: TripSignup[]): Overnight[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const out: Overnight[] = [];
  for (const s of signups) {
    const t = byId.get(s.tripId);
    if (!t || s.status !== 'applied' || t.status === 'cancelled' || tripNights(t) < 1) continue;
    out.push({
      id: `trip-${s.id}`,
      stId: s.stId,
      trId: s.trId,
      from: t.start,
      until: t.end,
      reason: t.title,
      status: 'approved',
      submittedAt: s.createdAt,
      updatedAt: s.updatedAt,
      decidedAt: null,
      decidedBy: null,
      comment: null,
      destination: t.place,
      tripId: t.id,
    });
  }
  return out;
}

/** 메모리 저장소(core 시험용). 참가 신청 수는 로컬 파일 저장소처럼 읽을 때 센다. */
export function memoryTripStore(): TripStore {
  const trips = new Map<string, Omit<Trip, 'taken'>>();
  const signups = new Map<string, TripSignup>();
  const all = () => withTaken([...trips.values()], [...signups.values()]);
  return {
    listTrips: async () => all(),
    getTrip: async (id) => all().find((t) => t.id === id) ?? null,
    async putTrip(t) {
      const { taken: _taken, ...row } = t;
      trips.set(t.id, row);
    },
    listSignups: async (tripId) => [...signups.values()].filter((s) => !tripId || s.tripId === tripId).map((s) => ({ ...s })),
    signupsByStudent: async (stId) => [...signups.values()].filter((s) => s.stId === stId).map((s) => ({ ...s })),
    getSignup: async (id) => (signups.has(id) ? { ...signups.get(id)! } : null),
    async putSignup(s) {
      signups.set(s.id, { ...s });
    },
  };
}
