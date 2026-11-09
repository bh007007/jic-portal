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
  /** 진단서 사진 경로(Storage 'absence-docs' 의 '<학생번호>/<신청 번호>.jpg', 11/10 결정 I10). 없으면 null */
  documentPath?: string | null;
}
/**
 * 외박·여행: 출발일 밤부터 복귀일 전날 밤까지 기숙사에서 자지 않는다. 그 밤들은 통금 판정에서 빠진다.
 * 업체 'Outing > Travel'(기획안 'Travel → 여행 신청과 외박 허용')에 맞춰 여행 정보를 함께 받는다.
 * 여행 정보는 11/8 에 더해서 그전 기록에는 없을 수 있다(없으면 빈 값으로 본다).
 */
export interface Overnight extends RequestBase {
  from: string; // 출발일(첫 밤)
  until: string; // 복귀일
  destination?: string; // 행선지(도시·지역)
  accommodation?: string; // 숙소(선택)
  contact?: string; // 여행 중 비상 연락처
  companions?: string[]; // 같이 가는 학생 번호
  guardianConsent?: boolean; // 미성년 학생이 '보호자 동의 받음'에 표시했는지(11/10 결정 I11, 그전 기록은 없음)
  tripId?: string; // 학교 여행 참가로 생긴 외박 허용(trips.ts tripPermits). 신청 저장소에는 없다
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
/** 필리핀 날짜(UTC+8) */
export const manilaDate = (d: Date) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

/** 결석 신청은 지난 날짜도 3일 전까지 받는다(11/10 결정 I10). */
export const ABSENCE_PAST_DAYS = 3;
/** 병결이 연속 며칠 이상이면 진단서 사진이 필요한지(11/10 결정 I10) */
export const SICK_DOC_DAYS = 2;

/**
 * 진단서 사진이 필요한 병결인지: 대기·승인 중인 병결이 앞뒤 날의 병결과 이어져 연속 2일 이상이면 그 병결들 모두.
 * 신청을 막지는 않는다(학생이 신청 상세에서 사진을 올리고, 직원은 '진단서 필요·없음'을 보고 처리한다).
 */
export function needsMedicalDoc(all: Absence[], a: Absence): boolean {
  if (a.kind !== 'sick' || !(a.status === 'pending' || a.status === 'approved')) return false;
  const days = new Set(all.filter((x) => x.stId === a.stId && x.kind === 'sick' && (x.status === 'pending' || x.status === 'approved')).map((x) => x.date));
  let run = 1;
  for (let d = addDays(a.date, -1); days.has(d); d = addDays(d, -1)) run++;
  for (let d = addDays(a.date, 1); days.has(d); d = addDays(d, 1)) run++;
  return run >= SICK_DOC_DAYS;
}

// ── 외박 규칙(11/10 결정 I11): 떠나는 날 하루 전까지 신청, 한 번에 최대 14박, 미성년은 보호자 동의 표시
export const OVERNIGHT_LEAD_DAYS = 1;
export const OVERNIGHT_MAX_NIGHTS = 14;
/** 성년 나이(필리핀 18세). 이보다 어리면 외박 신청에 보호자 동의 표시가 있어야 한다. */
export const ADULT_AGE = 18;

/** 그날의 만 나이. 생년월일이 없거나 이상하면 null */
export function ageOn(birthday: string, date: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday ?? '');
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!b || !d) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const [y, m, dd] = d.slice(1).map(Number);
  return y - by - (m < bm || (m === bm && dd < bd) ? 1 : 0);
}
/** 그날 미성년인지(생년월일을 모르면 아니라고 본다: 직원이 확인) */
export function isMinorOn(db: Db, stId: string, date: string) {
  const age = ageOn(db.studentDetail(stId)?.student.birthday ?? '', date);
  return age !== null && age < ADULT_AGE;
}

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
 * 11/10 결정 I10: 지난 날짜는 오늘(필리핀 날짜)부터 3일 전까지만(too_old).
 */
export function newAbsence(ctx: NewCtx, mine: Absence[], input: AbsenceInput): Outcome<Absence> {
  const { date, kind } = input;
  const reason = cleanReason(input.reason);
  const periodsIn = Array.isArray(input.periods) ? input.periods : [];
  const periods = [...new Set(periodsIn.map(Number))].sort((a, b) => a - b);

  if (!isDate(date)) return fail(400, 'invalid_date');
  if (date < addDays(manilaDate(ctx.now()), -ABSENCE_PAST_DAYS)) return fail(400, 'too_old');
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
  destination?: unknown;
  accommodation?: unknown;
  contact?: unknown;
  /** 학생번호 배열 또는 쉼표·공백으로 나눈 글 */
  companions?: unknown;
  /** 미성년이면 true 여야 한다(보호자 동의 받음) */
  guardianConsent?: unknown;
}

export const DESTINATION_MAX = 100;
export const ACCOMMODATION_MAX = 100;
export const CONTACT_MAX = 30;
export const COMPANION_MAX = 10;

/** 같이 가는 학생 번호: 숫자만, 중복·자기 번호 제외 */
export function parseCompanions(v: unknown, self: string): string[] {
  const text = Array.isArray(v) ? v.map(String).join(' ') : typeof v === 'string' ? v : '';
  return [...new Set(text.match(/\d+/g) ?? [])].filter((n) => n !== self);
}

/**
 * 외박·여행 신청 확인. 출발일~마지막 밤이 한 연수 기간 안, 대기·승인 상태인 다른 외박과 밤이 겹치면 거절.
 * 11/10 결정 I11: 출발일은 내일부터(하루 전까지 신청), 최대 14박, 출발일에 미성년이면 보호자 동의 표시가 있어야 한다.
 */
export function newOvernight(ctx: NewCtx, mine: Overnight[], input: OvernightInput): Outcome<Overnight> {
  const { from, until } = input;
  const reason = cleanReason(input.reason);
  const destination = cleanReason(input.destination);
  const accommodation = cleanReason(input.accommodation);
  const contact = cleanReason(input.contact);
  const companions = parseCompanions(input.companions, ctx.stId);
  if (!isDate(from) || !isDate(until)) return fail(400, 'invalid_date');
  if (until <= from) return fail(400, 'invalid_range');
  if (from < addDays(manilaDate(ctx.now()), OVERNIGHT_LEAD_DAYS)) return fail(400, 'too_late');
  if (nightsBetween(from, until) > OVERNIGHT_MAX_NIGHTS) return fail(400, 'too_many_nights');
  if (!destination) return fail(400, 'destination_required');
  if (destination.length > DESTINATION_MAX) return fail(400, 'destination_too_long');
  if (accommodation.length > ACCOMMODATION_MAX) return fail(400, 'accommodation_too_long');
  if (!contact) return fail(400, 'contact_required');
  if (contact.length > CONTACT_MAX || !/^[0-9+()\-\s]{6,}$/.test(contact)) return fail(400, 'invalid_contact');
  if (companions.length > COMPANION_MAX) return fail(400, 'too_many_companions');
  if (companions.some((n) => !ctx.db.studentDetail(n))) return fail(400, 'invalid_companion');
  if (!reason) return fail(400, 'reason_required');
  if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');
  const minor = isMinorOn(ctx.db, ctx.stId, from);
  if (minor && input.guardianConsent !== true) return fail(400, 'guardian_consent_required');

  const lastNight = addDays(until, -1);
  const win = requestWindows(ctx.db, ctx.stId).find((w) => w.from <= from && lastNight <= w.to);
  if (!win) return fail(400, 'date_out_of_range');
  if (mine.some((o) => live(o.status) && o.from < until && from < o.until)) return fail(409, 'duplicate');

  return done({ ...base(ctx, win.trId, reason), from, until, destination, accommodation, contact, companions, guardianConsent: minor }, 201);
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
