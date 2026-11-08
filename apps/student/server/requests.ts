/**
 * 학생 신청(결석·외박)의 모양과 규칙. 파일·네트워크에 의존하지 않는다.
 * 학생 앱(신청·취소)과 인트라넷(승인·반려)이 같이 쓴다. 로컬에서는 같은 파일을, 배포에서는 같은 Supabase 테이블을 쓴다
 * (absence_requests, overnight_permissions — docs/student-app.md).
 */
import type { Db } from '../../admin/server/core';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface RequestBase {
  id: string;
  stId: string;
  trId: string; // 신청 날짜가 들어가는 연수
  reason: string;
  status: RequestStatus;
  submittedAt: string; // ISO
  updatedAt: string;
  decidedAt: string | null; // 담당자 승인·반려 시각
  decidedBy: string | null;
  comment: string | null; // 담당자 메모(반려 사유 등). 학생에게 보인다
}

export const ABSENCE_KINDS = ['sick', 'official', 'personal'] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];
/** 교시 수. 시간표가 연결되기 전 임시값이며 LMS 담당자와 확인 후 확정한다(docs/student-app.md). */
export const PERIOD_COUNT = 8;
export const REASON_MAX = 500;
export const COMMENT_MAX = 300;

export interface Absence extends RequestBase {
  date: string; // YYYY-MM-DD
  periods: number[]; // 빈 배열 = 종일
  kind: AbsenceKind;
}
/** 외박: 출발일 밤부터 복귀일 전날 밤까지 기숙사에서 자지 않는다. 그 밤들은 통금 판정에서 빠진다. */
export interface Overnight extends RequestBase {
  from: string; // 출발일(첫 밤)
  until: string; // 복귀일
}

export interface RequestStore<T extends { id: string; stId: string }> {
  listAll(): Promise<T[]>;
  listByStudent(stId: string): Promise<T[]>;
  get(id: string): Promise<T | null>;
  put(x: T): Promise<void>;
}
export type AbsenceStore = RequestStore<Absence>;
export type OvernightStore = RequestStore<Overnight>;

export type Outcome<T> = { ok: true; status: number; value: T } | { ok: false; status: number; error: string };
const done = <T>(value: T, status = 200): Outcome<T> => ({ ok: true, status, value });
const fail = <T>(status: number, error: string): Outcome<T> => ({ ok: false, status, error });

export const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
export const nightsBetween = (from: string, until: string) => Math.round((Date.parse(until) - Date.parse(from)) / 864e5);

/** 신청할 수 있는 기간: 재학 중이거나 입학 예정인 연수의 기간. 연장으로 연수가 여러 개면 여러 구간이 된다. */
export function requestWindows(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return [];
  return d.enrollments
    .filter((e) => (e.status === 'current' || e.status === 'upcoming') && e.start && e.end)
    .map((e) => ({ trId: e.trId, from: e.start, to: e.end }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

const live = (s: RequestStatus) => s === 'pending' || s === 'approved';
const cleanReason = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface NewCtx {
  db: Db;
  stId: string;
  now: () => Date;
  newId: () => string;
}
const base = (ctx: NewCtx, trId: string, reason: string) => {
  const now = ctx.now().toISOString();
  return { id: ctx.newId(), stId: ctx.stId, trId, reason, status: 'pending' as const, submittedAt: now, updatedAt: now, decidedAt: null, decidedBy: null, comment: null };
};

export interface AbsenceInput {
  date?: unknown;
  periods?: unknown;
  kind?: unknown;
  reason?: unknown;
}

/**
 * 결석 신청 확인. 날짜는 신청 가능 기간 안, 같은 날짜에 대기·승인 상태인 신청과 교시가 겹치면 거절(종일은 모든 교시와 겹친다).
 */
export function newAbsence(ctx: NewCtx, mine: Absence[], input: AbsenceInput): Outcome<Absence> {
  const { date, kind } = input;
  const reason = cleanReason(input.reason);
  const periodsIn = Array.isArray(input.periods) ? input.periods : [];
  const periods = [...new Set(periodsIn.map(Number))].sort((a, b) => a - b);

  if (!isDate(date)) return fail(400, 'invalid_date');
  if (!ABSENCE_KINDS.includes(kind as AbsenceKind)) return fail(400, 'invalid_kind');
  if (periods.some((p) => !Number.isInteger(p) || p < 1 || p > PERIOD_COUNT)) return fail(400, 'invalid_periods');
  if (!reason) return fail(400, 'reason_required');
  if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');

  const win = requestWindows(ctx.db, ctx.stId).find((w) => w.from <= date && date <= w.to);
  if (!win) return fail(400, 'date_out_of_range');
  const overlaps = (a: number[]) => a.length === 0 || periods.length === 0 || a.some((p) => periods.includes(p));
  if (mine.some((a) => a.date === date && live(a.status) && overlaps(a.periods))) return fail(409, 'duplicate');

  return done({ ...base(ctx, win.trId, reason), date, periods, kind: kind as AbsenceKind }, 201);
}

export interface OvernightInput {
  from?: unknown;
  until?: unknown;
  reason?: unknown;
}

/** 외박 신청 확인. 출발일~마지막 밤이 한 연수 기간 안, 대기·승인 상태인 다른 외박과 밤이 겹치면 거절. */
export function newOvernight(ctx: NewCtx, mine: Overnight[], input: OvernightInput): Outcome<Overnight> {
  const { from, until } = input;
  const reason = cleanReason(input.reason);
  if (!isDate(from) || !isDate(until)) return fail(400, 'invalid_date');
  if (until <= from) return fail(400, 'invalid_range');
  if (!reason) return fail(400, 'reason_required');
  if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');

  const lastNight = addDays(until, -1);
  const win = requestWindows(ctx.db, ctx.stId).find((w) => w.from <= from && lastNight <= w.to);
  if (!win) return fail(400, 'date_out_of_range');
  if (mine.some((o) => live(o.status) && o.from < until && from < o.until)) return fail(409, 'duplicate');

  return done({ ...base(ctx, win.trId, reason), from, until }, 201);
}

/** 학생 취소: 대기 중인 자기 신청만. */
export function cancelRequest<T extends RequestBase>(x: T | null, stId: string, now: Date): Outcome<T> {
  if (!x || x.stId !== stId) return fail(404, 'not_found');
  if (x.status !== 'pending') return fail(409, 'not_pending');
  return done({ ...x, status: 'cancelled', updatedAt: now.toISOString() });
}

/** 담당자 승인·반려: 대기 중인 신청만. 메모는 학생에게 보인다. */
export function decideRequest<T extends RequestBase>(x: T, approve: boolean, comment: string | null, by: string | null, now: Date): Outcome<T> {
  if (x.status !== 'pending') return fail(409, 'not_pending');
  const iso = now.toISOString();
  return done({ ...x, status: approve ? 'approved' : 'rejected', decidedAt: iso, decidedBy: by, comment: comment ? comment.slice(0, COMMENT_MAX) : null, updatedAt: iso });
}

/** 그 밤(YYYY-MM-DD)에 승인된 외박이 있으면 그 외박. */
export function overnightFor(list: Overnight[], stId: string, night: string) {
  return list.find((o) => o.stId === stId && o.status === 'approved' && o.from <= night && night < o.until) ?? null;
}
