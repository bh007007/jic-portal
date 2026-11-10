/**
 * 학생 앱 /api/* 계산. 파일·네트워크에 의존하지 않는다.
 * - 학생·연수 정보는 관리자 앱 core(createDb → studentDetail)를 그대로 쓰고, 학생 본인에게 보여도 되는 항목만 골라 내보낸다.
 *   메모(에이전시·회계 등), 입금액·포인트 금액, 에이전시·납부 방법은 내보내지 않는다.
 * - 결석·외박 신청의 모양과 규칙은 server/requests.ts(인트라넷과 같이 씀). 저장은 RequestStore 로 분리한다.
 */
import type { Db } from '../../admin/server/core';
import {
  ABSENCE_PAST_DAYS,
  cancelRequest,
  isMinorOn,
  needsMedicalDoc,
  newAbsence,
  newOvernight,
  nightsBetween,
  OVERNIGHT_LEAD_DAYS,
  OVERNIGHT_MAX_NIGHTS,
  PERIOD_COUNT,
  REASON_MAX,
  requestWindows,
  type Absence,
  type AbsenceInput,
  type AbsenceStore,
  type Outcome,
  type Overnight,
  type OvernightInput,
  type OvernightStore,
} from './requests';
import { parseImageDataUrl, toDataUrl, type FileStore } from './files';

import { AIRPORTS, departureEnrollment, rideState, saveDeparture, type DepartureInput, type DepartureStore, type RideStore } from './departures';
import {
  cancelLifeRequest,
  LIFE_CATEGORIES,
  LIFE_CONTENT_MAX,
  LIFE_OPEN_MAX,
  lifeEnrollment,
  newLifeRequest,
  type LifeInput,
  type LifeRequest,
  type LifeRequestStore,
} from './lifeRequests';
import { keycardCode, type KeycardSecret } from './keycard';
import { cancelSignup, isLive, seatsLeft, signUp, studentCampuses, tripNights, visibleTo, type Trip, type TripSignup, type TripStore } from './trips';
import { timetableView, type TimetableSource } from './timetable';

export { ABSENCE_KINDS, PERIOD_COUNT, REASON_MAX } from './requests';
export type { Departure, DepartureStore, Ride, RideState, RideStore } from './departures';
export type { Absence, AbsenceInput, AbsenceKind, AbsenceStore, Overnight, OvernightInput, OvernightStore, RequestStatus } from './requests';
export type { LifeCategory, LifeInput, LifeRequest, LifeRequestStore, LifeStatus } from './lifeRequests';
export type { SignupStatus, Trip, TripSignup, TripStatus, TripStore } from './trips';
export type { AttendanceResult, ClassMark, TimetableSource, TimetableView } from './timetable';

export interface StudentCtx {
  db: Db;
  store: AbsenceStore;
  overnights: OvernightStore;
  departures: DepartureStore;
  rides: RideStore;
  /** 생활 요청(server/lifeRequests.ts, 인트라넷과 같이 씀) */
  life: LifeRequestStore;
  /** 학교 여행·액티비티와 참가 신청(server/trips.ts, 인트라넷과 같이 씀) */
  trips: TripStore;
  /** 시간표: 강사 포털 수업·출석(server/timetable.ts, 읽기만). 없으면 '아직 없음' */
  timetable?: TimetableSource;
  /** 카드키 QR 비밀 값(server/keycard.ts). 없으면 출입 QR 을 만들지 않는다. */
  keycardSecret?: KeycardSecret;
  /** 진단서 사진(11/10 결정 I10, server/files.ts). 배포는 Storage 'absence-docs', 로컬은 파일. 없으면 사진을 받지 않는다 */
  absenceDocs?: FileStore;
  /** 로그인한 학생 번호. 없으면 null. */
  stId: string | null;
  /** 학생번호 + 생년월일 로그인(/api/login)을 열지. 로컬 개발 서버에서만 true. */
  localLogin: boolean;
  /** Supabase 계정이 첫 비밀번호를 아직 바꾸지 않았으면 true: /meta 말고는 막는다(accounts.ts). */
  mustChangePassword?: boolean;
  now: () => Date;
  newId: () => string;
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });
const fromOutcome = <T>(o: Outcome<T>): Result => (o.ok ? ok(o.value, o.status) : fail(o.status, o.error));

const DAY = 864e5;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** 졸업 전 확인 목록을 보여 주는 기간(관리자 앱의 '졸업임박'과 같은 14일). */
const CHECKOUT_DAYS = 14;

function baseProfile(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return null;
  // studentDetail 은 시작일 내림차순으로 준다.
  const live = d.enrollments.filter((e) => e.status !== 'cancelled');
  const upcoming = live.filter((e) => e.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start));
  const main = live.find((e) => e.status === 'current') ?? upcoming[0] ?? live[0] ?? null;

  const pick = (e: (typeof live)[number]) => ({
    trId: e.trId,
    course: e.course,
    campus: e.campus,
    dorm: e.dormStay?.type || e.dorm,
    start: e.start,
    end: e.end,
    weeks: e.weeks,
    batch: e.batch,
    status: e.status,
  });

  const daysLeft = main && main.status === 'current' ? daysBetween(d.refDate, main.end) : null;
  const checkout =
    main && daysLeft !== null && daysLeft <= CHECKOUT_DAYS
      ? { end: main.end, daysLeft, roomClear: main.roomClear, pointClear: main.pointClear }
      : null;

  return {
    refDate: d.refDate,
    student: {
      stId: d.student.stId,
      name: d.student.name,
      birthday: d.student.birthday,
      gender: d.student.gender,
      nation: d.student.nation,
      email: d.student.email,
      cell: d.student.cell,
    },
    enrollment: main ? pick(main) : null,
    enrollments: live.map(pick),
    checkout,
  };
}
/** 필리핀 날짜(오늘) */
const localToday = (d: Date) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

/** 내 정보 + 이번 연수의 귀국 항공편 */
async function profile(ctx: StudentCtx, stId: string) {
  const base = baseProfile(ctx.db, stId);
  if (!base) return null;
  const e = departureEnrollment(ctx.db, stId);
  const departure = e ? await ctx.departures.get(`dep-${e.trId}`) : null;
  return { ...base, departure };
}
export type Profile = NonNullable<Awaited<ReturnType<typeof profile>>>;

async function departureView(ctx: StudentCtx, stId: string) {
  const enrollment = departureEnrollment(ctx.db, stId);
  const departure = enrollment ? await ctx.departures.get(`dep-${enrollment.trId}`) : null;
  const r = departure ? await ctx.rides.get(departure.id) : null;
  const state = departure ? rideState(departure, r) : 'none';
  // 학생에게는 처리 결과만 보인다(처리자 이름은 내보내지 않음).
  const ride = { state, pickupDate: state === 'confirmed' ? r!.pickupDate : null, pickupTime: state === 'confirmed' ? r!.pickupTime : null, note: state === 'confirmed' || state === 'declined' ? r!.note : '' };
  return { today: localToday(ctx.now()), airports: AIRPORTS, enrollment, departure, ride };
}
export type DepartureView = Awaited<ReturnType<typeof departureView>>;

async function putDeparture(ctx: StudentCtx, stId: string, input: DepartureInput): Promise<Result> {
  const e = departureEnrollment(ctx.db, stId);
  const existing = e ? await ctx.departures.get(`dep-${e.trId}`) : null;
  const out = saveDeparture({ db: ctx.db, stId, now: ctx.now, today: localToday(ctx.now()) }, existing, input);
  if (out.ok) await ctx.departures.put(out.value);
  return fromOutcome(out);
}

const byNewest = (a: { submittedAt: string }, b: { submittedAt: string }) => b.submittedAt.localeCompare(a.submittedAt);

async function listAbsences(ctx: StudentCtx, stId: string) {
  const mine = await ctx.store.listByStudent(stId);
  // 병결 연속 2일 이상이면 진단서 사진이 필요하다(11/10 결정 I10). 신청 상세에서 올린다
  const rows = mine.sort(byNewest).map((a) => ({ ...a, documentRequired: needsMedicalDoc(mine, a), hasDocument: !!a.documentPath }));
  // 11/10 결정 I10: 신청 화면의 날짜는 minDate(오늘부터 3일 전)부터
  const minDate = new Date(Date.parse(localToday(ctx.now())) - ABSENCE_PAST_DAYS * 864e5).toISOString().slice(0, 10);
  return { refDate: ctx.db.refDate, periodCount: PERIOD_COUNT, reasonMax: REASON_MAX, windows: requestWindows(ctx.db, stId), minDate, rows };
}
export type AbsenceList = Awaited<ReturnType<typeof listAbsences>>;

/** 진단서 사진 올리기: 내 신청, 대기 중일 때만. 다시 올리면 바꾼다. 경로는 '<학생번호>/<신청 번호>.<확장자>' */
async function uploadAbsenceDoc(ctx: StudentCtx, stId: string, id: string, input: Record<string, unknown>): Promise<Result> {
  if (!ctx.absenceDocs) return fail(503, 'documents_unavailable');
  const a = await ctx.store.get(id);
  if (!a || a.stId !== stId) return fail(404, 'not_found');
  if (a.status !== 'pending') return fail(409, 'not_pending');
  const img = parseImageDataUrl(input.image);
  if (!img.ok) return fail(400, img.error);
  const path = `${stId}/${a.id}.${img.ext}`;
  await ctx.absenceDocs.put(path, img.file);
  await ctx.store.put({ ...a, documentPath: path, updatedAt: ctx.now().toISOString() });
  return ok((await listAbsences(ctx, stId)).rows.find((r) => r.id === id));
}

/** 내가 올린 진단서 사진 보기 */
async function readAbsenceDoc(ctx: StudentCtx, stId: string, id: string): Promise<Result> {
  const a = await ctx.store.get(id);
  if (!a || a.stId !== stId || !a.documentPath || !ctx.absenceDocs) return fail(404, 'not_found');
  const f = await ctx.absenceDocs.get(a.documentPath);
  return f ? ok({ image: toDataUrl(f) }) : fail(404, 'not_found');
}

async function createAbsence(ctx: StudentCtx, stId: string, input: AbsenceInput): Promise<Result> {
  const out = newAbsence({ ...ctx, stId }, await ctx.store.listByStudent(stId), input);
  if (out.ok) await ctx.store.put(out.value);
  return fromOutcome(out);
}

async function listOvernights(ctx: StudentCtx, stId: string) {
  const rows = (await ctx.overnights.listByStudent(stId)).sort(byNewest).map((o) => ({ ...o, nights: nightsBetween(o.from, o.until) }));
  // 11/10 결정 I11: 신청 화면의 출발일은 minDate 부터, 최대 maxNights 박. minor 면 보호자 동의 칸을 보인다(출발일 기준으로 서버가 다시 확인)
  const today = localToday(ctx.now());
  const minDate = new Date(Date.parse(today) + OVERNIGHT_LEAD_DAYS * 864e5).toISOString().slice(0, 10);
  return { refDate: ctx.db.refDate, reasonMax: REASON_MAX, windows: requestWindows(ctx.db, stId), minDate, maxNights: OVERNIGHT_MAX_NIGHTS, minor: isMinorOn(ctx.db, stId, today), rows };
}
export type OvernightList = Awaited<ReturnType<typeof listOvernights>>;
export type OvernightRow = OvernightList['rows'][number];

async function createOvernight(ctx: StudentCtx, stId: string, input: OvernightInput): Promise<Result> {
  const out = newOvernight({ ...ctx, stId }, await ctx.overnights.listByStudent(stId), input);
  if (out.ok) await ctx.overnights.put(out.value);
  return fromOutcome(out);
}

/** 생활 요청: 처리한 직원은 학생에게 내보내지 않는다. */
const forStudent = (r: LifeRequest) => ({ ...r, handledBy: undefined });
async function listLife(ctx: StudentCtx, stId: string) {
  const rows = (await ctx.life.listByStudent(stId)).sort(byNewest).map(forStudent);
  return { categories: LIFE_CATEGORIES, contentMax: LIFE_CONTENT_MAX, openMax: LIFE_OPEN_MAX, canRequest: !!lifeEnrollment(ctx.db, stId), rows };
}
export type LifeList = Awaited<ReturnType<typeof listLife>>;
export type LifeRow = LifeList['rows'][number];

async function createLife(ctx: StudentCtx, stId: string, input: LifeInput): Promise<Result> {
  const out = newLifeRequest({ ...ctx, stId }, await ctx.life.listByStudent(stId), input);
  if (out.ok) await ctx.life.put(out.value);
  return out.ok ? ok(forStudent(out.value), out.status) : fail(out.status, out.error);
}

async function cancelLife(ctx: StudentCtx, stId: string, id: string): Promise<Result> {
  const out = cancelLifeRequest(await ctx.life.get(id), stId, ctx.now());
  if (out.ok) await ctx.life.put(out.value);
  return out.ok ? ok(forStudent(out.value)) : fail(out.status, out.error);
}

// ── 학교 여행·액티비티: 내 캠퍼스(또는 전체)의 다가오는 여행과, 내가 신청했던 여행(지난 것·취소된 것 포함)
/** 여행 하나를 학생 화면용으로: 올린 직원·명단에서 뺀 직원은 내보내지 않는다. canApply·why 는 신청 규칙(signUp)을 그대로 돌려 본다. */
function tripForStudent(ctx: StudentCtx, stId: string, t: Trip, mine: TripSignup[], today: string, waitingOrder: Map<string, number> = new Map()) {
  // 같은 여행에 여러 번 신청했으면(취소·제외 뒤 다시 신청) 지금 신청, 없으면 가장 나중 것
  const here = mine.filter((s) => s.tripId === t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const own = here.find((s) => isLive(s)) ?? here[here.length - 1] ?? null;
  const trial = signUp({ db: ctx.db, stId, now: ctx.now, newId: () => '', today }, t, mine);
  const waitingNo = own?.status === 'waiting' ? (waitingOrder.get(own.id) ?? null) : null;
  const cancel = own ? cancelSignup(own, t, stId, ctx.now(), today) : null;
  const { createdBy: _by, ...rest } = t;
  return {
    ...rest,
    nights: tripNights(t),
    left: seatsLeft(t),
    mine: own ? { id: own.id, status: own.status, createdAt: own.createdAt, updatedAt: own.updatedAt, reason: own.reason, waitingNo: own.status === 'waiting' ? waitingNo : null } : null,
    // 정원이 차면 신청은 대기로 들어간다(11/10 결정 I12)
    full: seatsLeft(t) === 0,
    canApply: trial.ok,
    why: trial.ok ? null : trial.error,
    canCancel: !!cancel?.ok,
  };
}
export type TripRow = ReturnType<typeof tripForStudent>;

async function tripRows(ctx: StudentCtx, stId: string) {
  const today = localToday(ctx.now());
  const campuses = studentCampuses(ctx.db, stId);
  const [trips, mine] = await Promise.all([ctx.trips.listTrips(), ctx.trips.signupsByStudent(stId)]);
  const signed = new Set(mine.map((s) => s.tripId));
  // 대기 순서: 학생은 남의 신청을 못 읽으므로(배포 RLS) 저장소가 내 대기의 순서를 알려 준다
  const waitingOrder = new Map<string, number>();
  for (const s of mine) if (s.status === 'waiting') waitingOrder.set(s.id, (await ctx.trips.waitingNo?.(s)) ?? 0);
  const rows = trips
    .filter((t) => signed.has(t.id) || (visibleTo(t, campuses) && t.status !== 'cancelled' && t.end >= today))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
    .map((t) => tripForStudent(ctx, stId, t, mine, today, waitingOrder));
  return { today, rows };
}
export type TripList = Awaited<ReturnType<typeof tripRows>>;
export type TripDetail = TripRow & { today: string };

async function tripSignUp(ctx: StudentCtx, stId: string, id: string): Promise<Result> {
  const today = localToday(ctx.now());
  const out = signUp({ db: ctx.db, stId, now: ctx.now, newId: ctx.newId, today }, await ctx.trips.getTrip(id), await ctx.trips.signupsByStudent(stId));
  if (!out.ok) return fail(out.status, out.error);
  await ctx.trips.putSignup(out.value);
  const row = (await tripRows(ctx, stId)).rows.find((r) => r.id === id);
  return ok(row, 201);
}

async function tripCancel(ctx: StudentCtx, stId: string, id: string): Promise<Result> {
  const today = localToday(ctx.now());
  const mine = (await ctx.trips.signupsByStudent(stId)).find((s) => s.tripId === id && isLive(s)) ?? null;
  const out = cancelSignup(mine, await ctx.trips.getTrip(id), stId, ctx.now(), today);
  if (!out.ok) return fail(out.status, out.error);
  await ctx.trips.putSignup(out.value);
  return ok((await tripRows(ctx, stId)).rows.find((r) => r.id === id));
}

async function cancelIn<T extends Absence | Overnight>(store: { get(id: string): Promise<T | null>; put(x: T): Promise<void> }, stId: string, id: string, now: Date): Promise<Result> {
  const out = cancelRequest(await store.get(id), stId, now);
  if (out.ok) await store.put(out.value);
  return fromOutcome(out);
}

/** 로컬 개발용 로그인: 학생번호 + 생년월일(YYYYMMDD). 배포에서는 Supabase Auth 학생 계정으로 바꾼다. */
function localLogin(db: Db, input: { stId?: unknown; birthday?: unknown }): Result {
  const stId = digits(input.stId);
  const birthday = digits(input.birthday);
  const d = stId ? db.studentDetail(stId) : null;
  if (!d || birthday.length !== 8 || digits(d.student.birthday) !== birthday) return fail(401, 'login_failed');
  return ok({ stId });
}

/** 샘플 데이터로 실행할 때 로그인 화면에 보여 줄 시험용 학생: 졸업이 가장 가까운 재학생(졸업 전 확인 목록이 보인다). */
function sampleLogin(db: Db) {
  const first = db.listEnrollments(new URLSearchParams({ tab: 'current', size: '10' })).rows[0];
  const d = first ? db.studentDetail(first.stId) : null;
  return d ? { stId: d.student.stId, birthday: digits(d.student.birthday) } : null;
}

/** /api 아래 경로를 처리한다. body 는 POST 의 JSON 본문(없으면 null). */
export async function handleStudentApi(ctx: StudentCtx, method: string, pathname: string, body: unknown): Promise<Result> {
  try {
    const p = pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

    if (p === '/meta' && method === 'GET') {
      const m = ctx.db.meta();
      return ok({ source: m.source, refDate: m.refDate, localLogin: ctx.localLogin, sampleLogin: ctx.localLogin && m.source === 'sample' ? sampleLogin(ctx.db) : null });
    }
    if (p === '/login' && method === 'POST') {
      return ctx.localLogin ? localLogin(ctx.db, input) : fail(404, 'not_found');
    }

    const stId = ctx.stId;
    if (!stId) return fail(401, 'unauthorized');
    if (ctx.mustChangePassword) return fail(403, 'password_change_required');

    if (p === '/departure' && method === 'GET') return ok(await departureView(ctx, stId));
    if (p === '/departure' && method === 'PUT') return await putDeparture(ctx, stId, input);
    if (p === '/me' && method === 'GET') {
      const pr = await profile(ctx, stId);
      return pr ? ok(pr) : fail(401, 'unauthorized');
    }
    if (p === '/absences' && method === 'GET') return ok(await listAbsences(ctx, stId));
    const dm = p.match(/^\/absences\/([\w-]+)\/document$/);
    if (dm && method === 'POST') return await uploadAbsenceDoc(ctx, stId, dm[1], input);
    if (dm && method === 'GET') return await readAbsenceDoc(ctx, stId, dm[1]);
    if (p === '/absences' && method === 'POST') return await createAbsence(ctx, stId, input);
    if (p === '/overnights' && method === 'GET') return ok(await listOvernights(ctx, stId));
    if (p === '/overnights' && method === 'POST') return await createOvernight(ctx, stId, input);
    if (p === '/life-requests' && method === 'GET') return ok(await listLife(ctx, stId));
    if (p === '/life-requests' && method === 'POST') return await createLife(ctx, stId, input);
    const lc = p.match(/^\/life-requests\/([\w-]+)\/cancel$/);
    if (lc && method === 'POST') return await cancelLife(ctx, stId, lc[1]);
    if (p === '/keycard' && method === 'GET') {
      // 출입 QR: 1분마다 바뀌는 서명 값(가드 태블릿이 읽는다). 재학·입학 예정 학생만
      if (!ctx.keycardSecret) return fail(404, 'keycard_unavailable');
      if (!lifeEnrollment(ctx.db, stId)) return fail(403, 'no_enrollment');
      const k = await keycardCode(await ctx.keycardSecret(), stId, ctx.now().getTime());
      return ok({ ...k, now: ctx.now().toISOString() }); // now: 기기 시계가 달라도 남은 시간을 맞게 보이도록
    }
    const tt = p.match(/^\/timetable(?:\/(\d{4}-\d{2}-\d{2}))?$/);
    if (tt && method === 'GET') return ok(await timetableView(ctx.timetable, stId, localToday(ctx.now()), tt[1])); // 주(그 날짜가 든 월~일)
    if (p === '/trips' && method === 'GET') return ok(await tripRows(ctx, stId));
    const tr = p.match(/^\/trips\/([\w-]+)(?:\/(signup|cancel))?$/);
    if (tr && !tr[2] && method === 'GET') {
      const list = await tripRows(ctx, stId);
      const row = list.rows.find((r) => r.id === tr[1]);
      return row ? ok({ ...row, today: list.today }) : fail(404, 'not_found');
    }
    if (tr && tr[2] === 'signup' && method === 'POST') return await tripSignUp(ctx, stId, tr[1]);
    if (tr && tr[2] === 'cancel' && method === 'POST') return await tripCancel(ctx, stId, tr[1]);
    const m = p.match(/^\/(absences|overnights)\/([\w-]+)\/cancel$/);
    if (m && method === 'POST') {
      return m[1] === 'absences' ? await cancelIn(ctx.store, stId, m[2], ctx.now()) : await cancelIn(ctx.overnights, stId, m[2], ctx.now());
    }

    return fail(404, 'not_found');
  } catch (e) {
    // 배포 저장소의 오류(StoreError: DB 함수가 거절한 코드)는 그 상태 코드로(예: 동시에 신청해 자리가 찬 경우 409 trip_full)
    const status = (e as { status?: unknown }).status;
    return fail(typeof status === 'number' && status >= 400 && status < 600 ? status : 500, (e as Error).message);
  }
}
