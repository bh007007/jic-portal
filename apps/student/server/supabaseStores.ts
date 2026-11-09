/**
 * 배포 서버(Workers)의 저장소: Supabase 테이블(supabase/migrations/20261108100000_student_intranet.sql)을 학생 토큰으로 읽고 쓴다.
 * RLS 가 학생 본인 행만 열어 준다. core 의 저장소 인터페이스(RequestStore, DepartureStore, RideStore)를 그대로 따르고,
 * 학생이 하는 일만 한다: 신청 등록·취소, 귀국 항공편 등록·수정, 배차 읽기. 승인·반려·배차 처리는 인트라넷(직원)이 한다.
 * 파일 의존 없음(fetch 만). 로컬 개발 서버는 이 대신 .local-db 파일 저장소를 쓴다(localData.ts).
 */
import type { Departure, DepartureStore, Ride, RideStore } from './departures';
import type { LifeRequest, LifeRequestStore } from './lifeRequests';
import type { Absence, AbsenceStore, Overnight, OvernightStore } from './requests';
import type { Trip, TripSignup, TripStore } from './trips';
import type { ClassMark, TimetableSource } from './timetable';
import type { SupabaseConf } from './supabaseAuth';

export type Row = Record<string, unknown>;

/** Supabase 가 거절한 요청. message 는 짧은 코드만(화면·로그에 내용을 싣지 않는다). */
export class StoreError extends Error {
  constructor(public status: number, code: string) {
    super(code);
  }
}

export function restClient(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch) {
  return restWithHeaders(conf.url, { apikey: conf.key, Authorization: `Bearer ${token}` }, fetchFn);
}
/** auth: 인증 헤더(로그인한 계정의 토큰, 또는 서비스 키 — 인트라넷 자동 확인) */
export function restWithHeaders(url: string, auth: Record<string, string>, fetchFn: typeof fetch = fetch) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  return async function rest<T = Row[]>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    const headers: Record<string, string> = { ...auth, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetchFn(`${base}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) {
      // DB 함수가 올린 오류(raise exception 'not_pending' 등, PostgREST code P0001)는 그 코드로, 나머지는 상태 코드로
      let code = `store_${r.status}`;
      try {
        const e = JSON.parse(await r.text()) as { code?: string; message?: string };
        if (e.code === 'P0001' && e.message && /^[a-z_]+$/.test(e.message)) code = e.message;
      } catch {
        // 본문이 JSON 이 아니면 상태 코드만
      }
      throw new StoreError(r.status, code);
    }
    const text = await r.text();
    return (text ? JSON.parse(text) : null) as T;
  };
}
export type Rest = ReturnType<typeof restClient>;

export const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
export const hm = (v: unknown) => (v ? String(v).slice(0, 5) : null); // Postgres time 'HH:MM:SS' → 'HH:MM'
const q = encodeURIComponent;

// ── 결석·외박
export const toAbsence = (r: Row): Absence => ({
  id: String(r.id),
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  date: String(r.absence_date),
  periods: ((r.periods as number[] | null) ?? []).map(Number),
  kind: r.kind as Absence['kind'],
  reason: String(r.reason),
  status: r.status as Absence['status'],
  submittedAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  decidedAt: iso(r.decided_at),
  decidedBy: null, // 처리한 직원은 학생에게 보이지 않는다
  comment: (r.staff_comment as string | null) ?? null,
});
export const toOvernight = (r: Row): Overnight => ({
  id: String(r.id),
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  from: String(r.leave_date),
  until: String(r.return_date),
  reason: String(r.reason),
  status: r.status as Overnight['status'],
  submittedAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  decidedAt: iso(r.decided_at),
  decidedBy: null,
  comment: (r.staff_comment as string | null) ?? null,
  destination: String(r.destination ?? ''),
  accommodation: String(r.accommodation ?? ''),
  guardianConsent: r.guardian_consent === true,
  contact: String(r.contact ?? ''),
  companions: ((r.companions as string[] | null) ?? []).map(String),
});

function requestStore<T extends Absence | Overnight>(rest: Rest, table: string, cancelFn: string, toItem: (r: Row) => T, toInsert: (x: T) => Row) {
  const get = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // 신청 번호는 UUID
    return (await rest('GET', `${table}?select=*&id=eq.${q(id)}`)).map(toItem)[0] ?? null;
  };
  return {
    listAll: async () => (await rest('GET', `${table}?select=*&order=created_at.desc`)).map(toItem),
    listByStudent: async (stId: string) => (await rest('GET', `${table}?select=*&student_no=eq.${q(stId)}&order=created_at.desc`)).map(toItem),
    get,
    /** 새 신청은 등록, 대기 → 취소는 취소 함수. 학생에게 다른 변경은 없다. */
    async put(x: T) {
      const cur = await get(x.id);
      if (!cur) {
        await rest('POST', table, toInsert(x), 'return=minimal');
        return;
      }
      if (cur.status === 'pending' && x.status === 'cancelled') {
        await rest('POST', `rpc/${cancelFn}`, { p_id: x.id }, 'return=minimal');
        return;
      }
      throw new StoreError(409, 'unsupported_update');
    },
  };
}

export const absenceStore = (rest: Rest): AbsenceStore =>
  requestStore<Absence>(rest, 'absence_requests', 'cancel_absence_request', toAbsence, (x) => ({
    id: x.id,
    student_no: x.stId,
    enrollment_id: x.trId,
    absence_date: x.date,
    periods: x.periods,
    kind: x.kind,
    reason: x.reason,
  }));

export const overnightStore = (rest: Rest): OvernightStore =>
  requestStore<Overnight>(rest, 'overnight_permissions', 'cancel_overnight_permission', toOvernight, (x) => ({
    id: x.id,
    student_no: x.stId,
    enrollment_id: x.trId,
    leave_date: x.from,
    return_date: x.until,
    reason: x.reason,
    destination: x.destination ?? '',
    accommodation: x.accommodation ?? '',
    contact: x.contact ?? '',
    companions: x.companions ?? [],
    guardian_consent: x.guardianConsent === true,
  }));

// ── 귀국 항공편(학생이 씀)·배차(직원이 씀, 학생은 읽기만). id 는 `dep-${연수 번호}`
const trOf = (id: string) => id.replace(/^dep-/, '');
export const toDeparture = (r: Row): Departure => ({
  id: `dep-${r.enrollment_id}`,
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  date: String(r.depart_date),
  time: hm(r.depart_time)!,
  flight: String(r.flight),
  airport: r.airport as Departure['airport'],
  needsRide: r.needs_ride === true,
  note: String(r.note ?? ''),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
});
export const toRide = (r: Row): Ride => ({
  id: `dep-${r.enrollment_id}`,
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  decision: r.decision as Ride['decision'],
  pickupDate: (r.pickup_date as string | null) ?? null,
  pickupTime: hm(r.pickup_time),
  note: String(r.note ?? ''),
  forDate: String(r.for_date),
  forTime: hm(r.for_time)!,
  decidedBy: '', // 처리한 직원은 학생에게 보이지 않는다
  decidedAt: iso(r.decided_at)!,
});

export function departureStore(rest: Rest): DepartureStore {
  const get = async (id: string) => (await rest('GET', `departure_flights?select=*&enrollment_id=eq.${q(trOf(id))}`)).map(toDeparture)[0] ?? null;
  return {
    listAll: async () => (await rest('GET', 'departure_flights?select=*')).map(toDeparture),
    get,
    async put(x) {
      const fields = { depart_date: x.date, depart_time: x.time, flight: x.flight, airport: x.airport, needs_ride: x.needsRide, note: x.note };
      if (!(await get(x.id))) {
        await rest('POST', 'departure_flights', { enrollment_id: x.trId, student_no: x.stId, ...fields }, 'return=minimal');
        return;
      }
      // 출발일이 지났으면 RLS 가 0건으로 막는다(core 도 먼저 확인한다).
      const rows = await rest('PATCH', `departure_flights?enrollment_id=eq.${q(x.trId)}`, { ...fields, updated_at: x.updatedAt }, 'return=representation');
      if (!rows.length) throw new StoreError(409, 'departure_passed');
    },
  };
}

export function rideStore(rest: Rest): RideStore {
  return {
    listAll: async () => (await rest('GET', 'airport_rides?select=*')).map(toRide),
    get: async (id) => (await rest('GET', `airport_rides?select=*&enrollment_id=eq.${q(trOf(id))}`)).map(toRide)[0] ?? null,
    async put() {
      throw new StoreError(403, 'read_only');
    },
  };
}

// ── 생활 요청(nonacademic_requests): 학생은 등록과 취소(취소 함수)만. 처리·답변은 직원(인트라넷)
export const toLife = (r: Row): LifeRequest => ({
  id: String(r.id),
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  category: r.category as LifeRequest['category'],
  content: String(r.content),
  status: r.status as LifeRequest['status'],
  submittedAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  handledAt: iso(r.handled_at),
  handledBy: null, // 처리한 직원은 학생에게 보이지 않는다
  reply: (r.staff_reply as string | null) ?? null,
});

export function lifeStore(rest: Rest): LifeRequestStore {
  const get = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return (await rest('GET', `nonacademic_requests?select=*&id=eq.${q(id)}`)).map(toLife)[0] ?? null;
  };
  return {
    listAll: async () => (await rest('GET', 'nonacademic_requests?select=*&order=created_at.desc')).map(toLife),
    listByStudent: async (stId) => (await rest('GET', `nonacademic_requests?select=*&student_no=eq.${q(stId)}&order=created_at.desc`)).map(toLife),
    get,
    async put(x) {
      const cur = await get(x.id);
      if (!cur) {
        await rest('POST', 'nonacademic_requests', { id: x.id, student_no: x.stId, enrollment_id: x.trId, category: x.category, content: x.content }, 'return=minimal');
        return;
      }
      if (cur.status === 'received' && x.status === 'cancelled') {
        await rest('POST', 'rpc/cancel_nonacademic_request', { p_id: x.id }, 'return=minimal');
        return;
      }
      throw new StoreError(409, 'unsupported_update');
    },
  };
}

// ── 학교 여행(trips)·참가 신청(trip_signups). 학생은 여행을 읽고, 신청·취소는 DB 함수로 한다
// (정원·마감·연수 기간을 DB 가 잠금 안에서 한 번 더 확인하고, 참가 신청 수 seats_taken 도 함수가 맞춘다).
export const toTrip = (r: Row): Trip => ({
  id: String(r.id),
  campus: String(r.campus ?? ''),
  title: String(r.title),
  place: String(r.place),
  meeting: String(r.meeting ?? ''),
  description: String(r.description ?? ''),
  start: String(r.start_date),
  end: String(r.end_date),
  deadline: String(r.deadline),
  capacity: Number(r.capacity),
  cost: Number(r.cost ?? 0),
  status: r.status as Trip['status'],
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  createdBy: (r.created_by_name as string | null) || null,
  taken: Number(r.seats_taken ?? 0),
});
export const toSignup = (r: Row): TripSignup => ({
  id: String(r.id),
  tripId: String(r.trip_id),
  stId: String(r.student_no),
  trId: String(r.enrollment_id),
  status: r.status as TripSignup['status'],
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  reason: (r.removed_reason as string | null) ?? null,
  handledAt: iso(r.handled_at),
  handledBy: null, // 명단에서 뺀 직원은 학생에게 보이지 않는다
});
export const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** 여행·참가 신청 읽기(학생·직원·가드 공통, 범위는 RLS) */
export function tripReads(rest: Rest, toS: (r: Row) => TripSignup | Promise<TripSignup> = toSignup) {
  const getTrip = async (id: string) => (isUuid(id) ? ((await rest('GET', `trips?select=*&id=eq.${q(id)}`)).map(toTrip)[0] ?? null) : null);
  const getSignup = async (id: string) => {
    if (!isUuid(id)) return null;
    const rows = await rest('GET', `trip_signups?select=*&id=eq.${q(id)}`);
    return rows[0] ? await toS(rows[0]) : null;
  };
  return {
    listTrips: async () => (await rest('GET', 'trips?select=*&order=start_date')).map(toTrip),
    getTrip,
    listSignups: async (tripId?: string) =>
      Promise.all((await rest('GET', `trip_signups?select=*${tripId ? `&trip_id=eq.${q(tripId)}` : ''}&order=created_at`)).map(toS)),
    signupsByStudent: async (stId: string) => Promise.all((await rest('GET', `trip_signups?select=*&student_no=eq.${q(stId)}&order=created_at`)).map(toS)),
    getSignup,
  };
}

export function tripStore(rest: Rest): TripStore {
  const reads = tripReads(rest);
  return {
    ...reads,
    async putTrip() {
      throw new StoreError(403, 'read_only');
    },
    async putSignup(x) {
      const cur = await reads.getSignup(x.id);
      if (!cur && x.status === 'applied') {
        await rest('POST', 'rpc/trip_sign_up', { p_trip: x.tripId, p_enrollment: x.trId, p_id: x.id });
        return;
      }
      if (cur?.status === 'applied' && x.status === 'cancelled') {
        await rest('POST', 'rpc/trip_cancel_signup', { p_id: x.id }, 'return=minimal');
        return;
      }
      throw new StoreError(409, 'unsupported_update');
    },
  };
}

/** 시간표: 강사 포털 수업·출석을 학생 본인 것만(DB 함수 student_timetable, 20261109140000_student_timetable.sql). 읽기만 */
export function timetableSource(rest: Rest): TimetableSource {
  return {
    async classes(_stId, from, to) {
      const rows = await rest('POST', 'rpc/student_timetable', { p_from: from, p_to: to });
      return rows.map((r) => ({
        id: String(r.id),
        day: String(r.day),
        time: String(r.start_time ?? ''),
        minutes: Number(r.minutes ?? 0),
        kind: r.kind === 'G' ? 'G' : '1',
        subject: String(r.subject ?? ''),
        teacher: String(r.teacher ?? ''),
        room: String(r.room ?? ''),
        result: (r.result as ClassMark['result']) ?? null,
        lateMin: (r.late_min as number | null) ?? null,
        excused: r.excused === true,
      }));
    },
  };
}

/** 학생 토큰으로 저장소를 만든다. */
export function supabaseStores(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch) {
  const rest = restClient(conf, token, fetchFn);
  return { store: absenceStore(rest), overnights: overnightStore(rest), departures: departureStore(rest), rides: rideStore(rest), life: lifeStore(rest), trips: tripStore(rest), timetable: timetableSource(rest) };
}
