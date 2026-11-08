/**
 * 학생 앱 /api/* 계산. 파일·네트워크에 의존하지 않는다.
 * - 학생·연수 정보는 관리자 앱 core(createDb → studentDetail)를 그대로 쓰고, 학생 본인에게 보여도 되는 항목만 골라 내보낸다.
 *   메모(에이전시·회계 등), 입금액·포인트 금액, 에이전시·납부 방법은 내보내지 않는다.
 * - 결석 신청 저장은 AbsenceStore 로 분리한다. 로컬은 파일(server/localData.ts), 배포는 Supabase absence_requests(예정, docs/student-app.md).
 */
import type { Db } from '../../admin/server/core';

export const ABSENCE_KINDS = ['sick', 'official', 'personal'] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];
export type AbsenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** 교시 수. 시간표가 연결되기 전 임시값이며 LMS 담당자와 확인 후 확정한다(docs/student-app.md). */
export const PERIOD_COUNT = 8;
export const REASON_MAX = 500;

export interface Absence {
  id: string;
  stId: string;
  trId: string;
  date: string; // YYYY-MM-DD
  periods: number[]; // 빈 배열 = 종일
  kind: AbsenceKind;
  reason: string;
  status: AbsenceStatus;
  submittedAt: string; // ISO
  updatedAt: string;
  decidedAt: string | null; // 담당자 승인·반려 시각
  decidedBy: string | null;
  comment: string | null; // 담당자 메모(반려 사유 등)
}

export interface AbsenceStore {
  listByStudent(stId: string): Promise<Absence[]>;
  get(id: string): Promise<Absence | null>;
  put(a: Absence): Promise<void>;
}

export interface StudentCtx {
  db: Db;
  store: AbsenceStore;
  /** 로그인한 학생 번호. 없으면 null. */
  stId: string | null;
  /** 학생번호 + 생년월일 로그인(/api/login)을 열지. 로컬 개발 서버에서만 true. */
  localLogin: boolean;
  now: () => Date;
  newId: () => string;
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });

const DAY = 864e5;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** 졸업 전 확인 목록을 보여 주는 기간(관리자 앱의 '졸업임박'과 같은 14일). */
const CHECKOUT_DAYS = 14;

function profile(db: Db, stId: string) {
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
export type Profile = NonNullable<ReturnType<typeof profile>>;

/** 결석 신청이 가능한 기간: 재학 중이거나 입학 예정인 연수의 기간. 연장으로 연수가 여러 개면 여러 구간이 된다. */
function absenceWindows(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return [];
  return d.enrollments
    .filter((e) => (e.status === 'current' || e.status === 'upcoming') && e.start && e.end)
    .map((e) => ({ trId: e.trId, from: e.start, to: e.end }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

const overlaps = (a: number[], b: number[]) => a.length === 0 || b.length === 0 || a.some((p) => b.includes(p));
const byNewest = (a: Absence, b: Absence) => b.submittedAt.localeCompare(a.submittedAt);

async function listAbsences(ctx: StudentCtx, stId: string) {
  const rows = (await ctx.store.listByStudent(stId)).sort(byNewest);
  return { refDate: ctx.db.refDate, periodCount: PERIOD_COUNT, reasonMax: REASON_MAX, windows: absenceWindows(ctx.db, stId), rows };
}
export type AbsenceList = Awaited<ReturnType<typeof listAbsences>>;

export interface AbsenceInput {
  date?: unknown;
  periods?: unknown;
  kind?: unknown;
  reason?: unknown;
}

async function createAbsence(ctx: StudentCtx, stId: string, input: AbsenceInput): Promise<Result> {
  const { date, kind } = input;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const periodsIn = Array.isArray(input.periods) ? input.periods : [];
  const periods = [...new Set(periodsIn.map(Number))].sort((a, b) => a - b);

  if (!isDate(date)) return fail(400, 'invalid_date');
  if (!ABSENCE_KINDS.includes(kind as AbsenceKind)) return fail(400, 'invalid_kind');
  if (periods.some((p) => !Number.isInteger(p) || p < 1 || p > PERIOD_COUNT)) return fail(400, 'invalid_periods');
  if (!reason) return fail(400, 'reason_required');
  if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');

  const win = absenceWindows(ctx.db, stId).find((w) => w.from <= date && date <= w.to);
  if (!win) return fail(400, 'date_out_of_range');

  const mine = await ctx.store.listByStudent(stId);
  const clash = mine.some((a) => a.date === date && (a.status === 'pending' || a.status === 'approved') && overlaps(a.periods, periods));
  if (clash) return fail(409, 'duplicate');

  const now = ctx.now().toISOString();
  const rec: Absence = {
    id: ctx.newId(),
    stId,
    trId: win.trId,
    date,
    periods,
    kind: kind as AbsenceKind,
    reason,
    status: 'pending',
    submittedAt: now,
    updatedAt: now,
    decidedAt: null,
    decidedBy: null,
    comment: null,
  };
  await ctx.store.put(rec);
  return ok(rec, 201);
}

async function cancelAbsence(ctx: StudentCtx, stId: string, id: string): Promise<Result> {
  const a = await ctx.store.get(id);
  if (!a || a.stId !== stId) return fail(404, 'not_found');
  if (a.status !== 'pending') return fail(409, 'not_pending');
  const next: Absence = { ...a, status: 'cancelled', updatedAt: ctx.now().toISOString() };
  await ctx.store.put(next);
  return ok(next);
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

    if (p === '/me' && method === 'GET') {
      const pr = profile(ctx.db, stId);
      return pr ? ok(pr) : fail(401, 'unauthorized');
    }
    if (p === '/absences' && method === 'GET') return ok(await listAbsences(ctx, stId));
    if (p === '/absences' && method === 'POST') return await createAbsence(ctx, stId, input);
    const m = p.match(/^\/absences\/([\w-]+)\/cancel$/);
    if (m && method === 'POST') return await cancelAbsence(ctx, stId, m[1]);

    return fail(404, 'not_found');
  } catch (e) {
    return fail(500, (e as Error).message);
  }
}
