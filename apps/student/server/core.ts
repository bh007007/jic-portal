/**
 * 학생 앱 /api/* 계산. 파일·네트워크에 의존하지 않는다.
 * - 학생·연수 정보는 관리자 앱 core(createDb → studentDetail)를 그대로 쓰고, 학생 본인에게 보여도 되는 항목만 골라 내보낸다.
 *   메모(에이전시·회계 등), 입금액·포인트 금액, 에이전시·납부 방법은 내보내지 않는다.
 * - 결석·외박 신청의 모양과 규칙은 server/requests.ts(인트라넷과 같이 씀). 저장은 RequestStore 로 분리한다.
 */
import type { Db } from '../../admin/server/core';
import {
  cancelRequest,
  newAbsence,
  newOvernight,
  nightsBetween,
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

export { ABSENCE_KINDS, PERIOD_COUNT, REASON_MAX } from './requests';
export type { Absence, AbsenceInput, AbsenceKind, AbsenceStore, Overnight, OvernightInput, OvernightStore, RequestStatus } from './requests';

export interface StudentCtx {
  db: Db;
  store: AbsenceStore;
  overnights: OvernightStore;
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
const fromOutcome = <T>(o: Outcome<T>): Result => (o.ok ? ok(o.value, o.status) : fail(o.status, o.error));

const DAY = 864e5;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
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

const byNewest = (a: { submittedAt: string }, b: { submittedAt: string }) => b.submittedAt.localeCompare(a.submittedAt);

async function listAbsences(ctx: StudentCtx, stId: string) {
  const rows = (await ctx.store.listByStudent(stId)).sort(byNewest);
  return { refDate: ctx.db.refDate, periodCount: PERIOD_COUNT, reasonMax: REASON_MAX, windows: requestWindows(ctx.db, stId), rows };
}
export type AbsenceList = Awaited<ReturnType<typeof listAbsences>>;

async function createAbsence(ctx: StudentCtx, stId: string, input: AbsenceInput): Promise<Result> {
  const out = newAbsence({ ...ctx, stId }, await ctx.store.listByStudent(stId), input);
  if (out.ok) await ctx.store.put(out.value);
  return fromOutcome(out);
}

async function listOvernights(ctx: StudentCtx, stId: string) {
  const rows = (await ctx.overnights.listByStudent(stId)).sort(byNewest).map((o) => ({ ...o, nights: nightsBetween(o.from, o.until) }));
  return { refDate: ctx.db.refDate, reasonMax: REASON_MAX, windows: requestWindows(ctx.db, stId), rows };
}
export type OvernightList = Awaited<ReturnType<typeof listOvernights>>;
export type OvernightRow = OvernightList['rows'][number];

async function createOvernight(ctx: StudentCtx, stId: string, input: OvernightInput): Promise<Result> {
  const out = newOvernight({ ...ctx, stId }, await ctx.overnights.listByStudent(stId), input);
  if (out.ok) await ctx.overnights.put(out.value);
  return fromOutcome(out);
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

    if (p === '/me' && method === 'GET') {
      const pr = profile(ctx.db, stId);
      return pr ? ok(pr) : fail(401, 'unauthorized');
    }
    if (p === '/absences' && method === 'GET') return ok(await listAbsences(ctx, stId));
    if (p === '/absences' && method === 'POST') return await createAbsence(ctx, stId, input);
    if (p === '/overnights' && method === 'GET') return ok(await listOvernights(ctx, stId));
    if (p === '/overnights' && method === 'POST') return await createOvernight(ctx, stId, input);
    const m = p.match(/^\/(absences|overnights)\/([\w-]+)\/cancel$/);
    if (m && method === 'POST') {
      return m[1] === 'absences' ? await cancelIn(ctx.store, stId, m[2], ctx.now()) : await cancelIn(ctx.overnights, stId, m[2], ctx.now());
    }

    return fail(404, 'not_found');
  } catch (e) {
    return fail(500, (e as Error).message);
  }
}
