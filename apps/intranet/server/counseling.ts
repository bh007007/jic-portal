/**
 * 상담 기록과 접근 기록(기획안 I5, '권한·보안 > 접근 기록'). 파일·네트워크에 의존하지 않는다.
 * - 목록에는 제목만 내보낸다. 내용은 상세를 열어야 보이고, 열 때마다 접근 기록을 남긴다.
 * - 작성·수정·후속 조치 처리도 접근 기록에 남긴다. 기록은 고치거나 지우지 않는다(추가만).
 * - 처리자(actor)는 로컬에서는 브라우저에 입력한 직원 이름, 배포에서는 로그인한 직원이다.
 * - 배포(Supabase)에서는 테이블을 직접 읽거나 쓰지 못하므로 stores.remote(DB 함수)로 열람·작성·수정·후속 조치를 한다.
 *   그때 접근 기록과 캠퍼스 범위는 DB 함수가 처리한다(supabase/migrations/20261108100000_student_intranet.sql).
 */

export interface CounselingNote {
  id: string;
  stId: string;
  date: string; // 상담일
  title: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  followUpDue: string | null; // 후속 조치 기한(확인할 일)
  followUpDone: boolean;
  followUpDoneAt: string | null;
  followUpDoneBy: string | null;
}

export type AuditAction = 'view' | 'create' | 'update' | 'followup_done' | 'followup_reopen';
export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  target: 'counseling';
  targetId: string;
  stId: string;
}

export const TITLE_MAX = 100;
export const CONTENT_MAX = 3000;
export const ACTOR_MAX = 40;
/** 같은 직원이 이 시간 안에 같은 기록을 다시 열면 열람을 한 번으로 센다. */
export const VIEW_DEDUPE_MS = 10_000;

/** 배포: DB 함수(counseling_open/create/update/followup)가 내용을 다루고 접근 기록을 남긴다. 실패는 오류 코드로 던진다. */
export interface CounselingRemote {
  /** 내용까지. 없거나 맡지 않은 캠퍼스면 null */
  open(id: string): Promise<CounselingNote | null>;
  create(v: { stId: string; campus: string; date: string; title: string; content: string; followUpDue: string | null }): Promise<string>;
  update(id: string, v: { date: string; title: string; content: string; followUpDue: string | null }): Promise<void>;
  followUp(id: string, done: boolean): Promise<void>;
}
export interface CounselingStores {
  /** 배포에서는 all() 이 내용 없는 목록(맡은 캠퍼스만)이다. */
  counseling: { all(): Promise<CounselingNote[]>; put(x: CounselingNote): Promise<void> };
  audit: { all(): Promise<AuditLog[]>; put(x: AuditLog): Promise<void> };
  remote?: CounselingRemote;
}
export interface CounselingCtx {
  stores: CounselingStores;
  /** 처리자 이름. 없으면 null(상담 기록은 열 수 없다). */
  actor: string | null;
  now: () => Date;
  newId: () => string;
  /** 학생 번호 → 이름·캠퍼스. 없는 학생이면 null. */
  student: (stId: string) => { name: string; campus: string } | null;
  /** 오늘(필리핀 날짜, YYYY-MM-DD) */
  today: () => string;
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** 기록 시각(ISO, UTC) → 필리핀 날짜 */
const localDateOf = (iso: string) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10);

/** 최근 것부터. 같은 시각이면 나중에 남긴 것이 먼저(저장 순서). */
const newestFirst = <T extends { at: string }>(list: T[]) =>
  list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.at.localeCompare(a.x.at) || b.i - a.i)
    .map(({ x }) => x);

async function audit(ctx: CounselingCtx, action: AuditAction, note: CounselingNote) {
  await ctx.stores.audit.put({ id: ctx.newId(), at: ctx.now().toISOString(), actor: ctx.actor!, action, target: 'counseling', targetId: note.id, stId: note.stId });
}

/** 목록에 내보내는 모양: 내용은 뺀다. */
function summaryOf(ctx: CounselingCtx, n: CounselingNote) {
  const s = ctx.student(n.stId);
  const today = ctx.today();
  return {
    id: n.id,
    stId: n.stId,
    date: n.date,
    title: n.title,
    author: n.author,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    updatedBy: n.updatedBy,
    followUpDue: n.followUpDue,
    followUpDone: n.followUpDone,
    followUpDoneAt: n.followUpDoneAt,
    followUpDoneBy: n.followUpDoneBy,
    name: s?.name ?? n.stId,
    campus: s?.campus ?? '-',
    followUpOpen: !!n.followUpDue && !n.followUpDone,
    overdue: !!n.followUpDue && !n.followUpDone && n.followUpDue < today,
  };
}
export type CounselingSummary = ReturnType<typeof summaryOf>;

export async function listCounseling(ctx: CounselingCtx, q: URLSearchParams) {
  const all = (await ctx.stores.counseling.all()).map((n) => summaryOf(ctx, n));
  const view = q.get('view') === 'followup' ? 'followup' : 'all';
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  // 검색은 학생·제목·작성자만. 내용 검색은 열람과 같아서 하지 않는다.
  const rows = all
    .filter((n) => view === 'all' || n.followUpOpen)
    .filter((n) => (!from || n.date >= from) && (!to || n.date <= to) && (!campus || n.campus === campus))
    .filter((n) => !kw || n.stId.includes(kw) || n.name.toLowerCase().includes(kw) || n.title.toLowerCase().includes(kw) || n.author.toLowerCase().includes(kw))
    .sort((a, b) => (view === 'followup' ? a.followUpDue!.localeCompare(b.followUpDue!) : b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  return {
    view,
    counts: { all: all.length, followup: all.filter((n) => n.followUpOpen).length, overdue: all.filter((n) => n.overdue).length },
    campuses: [...new Set(all.map((n) => n.campus))].sort(),
    rows,
  };
}
export type CounselingList = Awaited<ReturnType<typeof listCounseling>>;

/** 상세: 내용과 이 기록의 접근 기록. 열 때마다 'view' 를 남긴다. */
export async function openCounseling(ctx: CounselingCtx, id: string): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  if (ctx.stores.remote) {
    const full = await ctx.stores.remote.open(id); // 열람 기록은 DB 함수가 남긴다
    if (!full) return fail(404, 'not_found');
    const trail = newestFirst((await ctx.stores.audit.all()).filter((l) => l.targetId === id));
    return ok({ note: { ...summaryOf(ctx, full), content: full.content }, trail: trail.slice(0, 50), trailCount: trail.length });
  }
  const note = (await ctx.stores.counseling.all()).find((n) => n.id === id);
  if (!note) return fail(404, 'not_found');
  const logs = await ctx.stores.audit.all();
  const nowMs = ctx.now().getTime();
  // 같은 직원이 같은 기록을 짧은 시간 안에 다시 연 것(새로고침, 개발 모드의 두 번 실행)은 한 번으로 센다.
  const recent = logs.some((l) => l.targetId === id && l.actor === ctx.actor && l.action === 'view' && nowMs - Date.parse(l.at) < VIEW_DEDUPE_MS);
  if (!recent) await audit(ctx, 'view', note);
  const trail = newestFirst((await ctx.stores.audit.all()).filter((l) => l.targetId === id));
  return ok({ note: { ...summaryOf(ctx, note), content: note.content }, trail: trail.slice(0, 50), trailCount: trail.length });
}
export interface CounselingDetail {
  note: CounselingSummary & { content: string };
  trail: AuditLog[];
  trailCount: number;
}

interface NoteInput {
  stId?: unknown;
  date?: unknown;
  title?: unknown;
  content?: unknown;
  followUpDue?: unknown;
}
function validate(ctx: CounselingCtx, input: NoteInput): { error: string } | { date: string; title: string; content: string; followUpDue: string | null } {
  const title = text(input.title);
  const content = text(input.content);
  const due = input.followUpDue === null || input.followUpDue === undefined || input.followUpDue === '' ? null : input.followUpDue;
  if (!isDate(input.date) || input.date > ctx.today()) return { error: 'invalid_date' };
  if (!title || title.length > TITLE_MAX) return { error: 'invalid_title' };
  if (!content || content.length > CONTENT_MAX) return { error: 'invalid_content' };
  if (due !== null && (!isDate(due) || due < input.date)) return { error: 'invalid_followup' };
  return { date: input.date, title, content, followUpDue: due as string | null };
}

export async function createCounseling(ctx: CounselingCtx, input: NoteInput): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  const stId = String(input.stId ?? '').replace(/\D/g, '');
  if (!stId || !ctx.student(stId)) return fail(400, 'unknown_student');
  const v = validate(ctx, input);
  if ('error' in v) return fail(400, v.error);
  if (ctx.stores.remote) return ok({ id: await ctx.stores.remote.create({ stId, campus: ctx.student(stId)!.campus, ...v }) }, 201);
  const now = ctx.now().toISOString();
  const note: CounselingNote = {
    id: ctx.newId(),
    stId,
    ...v,
    author: ctx.actor,
    createdAt: now,
    updatedAt: now,
    updatedBy: ctx.actor,
    followUpDone: false,
    followUpDoneAt: null,
    followUpDoneBy: null,
  };
  await ctx.stores.counseling.put(note);
  await audit(ctx, 'create', note);
  return ok({ id: note.id }, 201);
}

export async function updateCounseling(ctx: CounselingCtx, id: string, input: NoteInput): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  const note = (await ctx.stores.counseling.all()).find((n) => n.id === id);
  if (!note) return fail(404, 'not_found');
  const v = validate(ctx, input);
  if ('error' in v) return fail(400, v.error);
  if (ctx.stores.remote) {
    await ctx.stores.remote.update(id, v); // 기한을 바꾸면 후속 조치를 다시 여는 것도 DB 함수가 한다
    return ok({ id });
  }
  // 기한을 바꾸면 후속 조치를 다시 열린 상태로 둔다.
  const reopen = v.followUpDue !== note.followUpDue;
  const next: CounselingNote = {
    ...note,
    ...v,
    updatedAt: ctx.now().toISOString(),
    updatedBy: ctx.actor,
    ...(reopen ? { followUpDone: false, followUpDoneAt: null, followUpDoneBy: null } : {}),
  };
  await ctx.stores.counseling.put(next);
  await audit(ctx, 'update', next);
  return ok({ id });
}

export async function setFollowUp(ctx: CounselingCtx, id: string, input: { done?: unknown }): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  if (typeof input.done !== 'boolean') return fail(400, 'invalid_decision');
  const note = (await ctx.stores.counseling.all()).find((n) => n.id === id);
  if (!note) return fail(404, 'not_found');
  if (!note.followUpDue) return fail(409, 'no_followup');
  if (note.followUpDone === input.done) return ok({ id });
  if (ctx.stores.remote) {
    await ctx.stores.remote.followUp(id, input.done);
    return ok({ id });
  }
  const now = ctx.now().toISOString();
  const next: CounselingNote = input.done
    ? { ...note, followUpDone: true, followUpDoneAt: now, followUpDoneBy: ctx.actor }
    : { ...note, followUpDone: false, followUpDoneAt: null, followUpDoneBy: null };
  await ctx.stores.counseling.put(next);
  await audit(ctx, input.done ? 'followup_done' : 'followup_reopen', next);
  return ok({ id });
}

export async function listAudit(ctx: CounselingCtx, q: URLSearchParams) {
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const action = q.get('action') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const notes = new Map((await ctx.stores.counseling.all()).map((n) => [n.id, n]));
  const rows = newestFirst(await ctx.stores.audit.all())
    .map((l) => ({ ...l, name: ctx.student(l.stId)?.name ?? l.stId, title: notes.get(l.targetId)?.title ?? '' }))
    .filter((l) => (!from || localDateOf(l.at) >= from) && (!to || localDateOf(l.at) <= to) && (!action || l.action === action))
    .filter((l) => !kw || l.actor.toLowerCase().includes(kw) || l.stId.includes(kw) || l.name.toLowerCase().includes(kw));
  return { total: rows.length, rows: rows.slice(0, 500) };
}
export type AuditList = Awaited<ReturnType<typeof listAudit>>;

/** Student File: 그 학생의 상담 기록 제목(내용 없음). */
export async function counselingOf(ctx: CounselingCtx, stId: string) {
  return (await ctx.stores.counseling.all())
    .filter((n) => n.stId === stId)
    .map((n) => summaryOf(ctx, n))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 홈: 열린 후속 조치 수, 그중 기한이 지났거나 오늘인 수. */
export async function followUpCounts(ctx: CounselingCtx) {
  const today = ctx.today();
  const open = (await ctx.stores.counseling.all()).filter((n) => n.followUpDue && !n.followUpDone);
  return { followUpOpen: open.length, followUpDue: open.filter((n) => n.followUpDue! <= today).length };
}
