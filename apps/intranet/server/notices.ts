/**
 * 인트라넷 내부 공지(기획안 I10, 업체 게시판 → 내부 공지). 파일·네트워크에 의존하지 않는다.
 * - 대상은 전체 또는 캠퍼스 하나. 상단 고정, 게시 종료일(지나면 '지난 공지').
 * - 직원이 공지를 열면 읽음(누가·언제)을 남긴다. 직원마다 한 번만.
 * - 작성자·읽은 사람은 로컬에서는 브라우저에 입력한 직원 이름, 배포에서는 로그인한 직원이다.
 */

export interface Notice {
  id: string;
  title: string;
  content: string;
  campus: string; // '' = 전체
  pinned: boolean;
  until: string | null; // 게시 종료일(이날까지 게시 중)
  author: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface NoticeRead {
  id: string; // `${noticeId}:${name}`
  noticeId: string;
  name: string;
  at: string;
}

export const NOTICE_TITLE_MAX = 120;
export const NOTICE_CONTENT_MAX = 5000;

export interface NoticeCtx {
  stores: {
    notices: { all(): Promise<Notice[]>; put(x: Notice): Promise<void> };
    noticeReads: { all(): Promise<NoticeRead[]>; put(x: NoticeRead): Promise<void> };
  };
  actor: string | null;
  now: () => Date;
  newId: () => string;
  /** 오늘(필리핀 날짜) */
  today: () => string;
  /** 대상으로 고를 수 있는 캠퍼스 */
  campuses: () => string[];
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isCurrent = (n: Notice, today: string) => !n.until || n.until >= today;
/** 고정 먼저, 그다음 최근 게시 순 */
const order = (a: Notice, b: Notice) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt);

async function readMap(ctx: NoticeCtx) {
  const m = new Map<string, NoticeRead[]>();
  for (const r of await ctx.stores.noticeReads.all()) m.set(r.noticeId, [...(m.get(r.noticeId) ?? []), r]);
  return m;
}

function row(n: Notice, reads: NoticeRead[], actor: string | null, today: string) {
  return {
    id: n.id,
    title: n.title,
    campus: n.campus,
    pinned: n.pinned,
    until: n.until,
    author: n.author,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    current: isCurrent(n, today),
    readCount: reads.length,
    readByMe: !!actor && reads.some((r) => r.name === actor),
  };
}
export type NoticeRow = ReturnType<typeof row>;

export async function listNotices(ctx: NoticeCtx, q: URLSearchParams) {
  const today = ctx.today();
  const view = q.get('view') === 'past' ? 'past' : 'current';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const reads = await readMap(ctx);
  const all = await ctx.stores.notices.all();
  const rows = all
    .filter((n) => (view === 'current' ? isCurrent(n, today) : !isCurrent(n, today)))
    // 캠퍼스를 고르면 그 캠퍼스 공지와 전체 공지
    .filter((n) => !campus || n.campus === '' || n.campus === campus)
    .filter((n) => !kw || n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw) || n.author.toLowerCase().includes(kw))
    .sort(view === 'current' ? order : (a, b) => (b.until ?? '').localeCompare(a.until ?? '') || order(a, b))
    .map((n) => row(n, reads.get(n.id) ?? [], ctx.actor, today));
  return {
    view,
    counts: { current: all.filter((n) => isCurrent(n, today)).length, past: all.filter((n) => !isCurrent(n, today)).length },
    campuses: ctx.campuses(),
    rows,
  };
}
export type NoticeList = Awaited<ReturnType<typeof listNotices>>;

/** 상세. 직원 이름이 있으면 읽음을 남긴다(직원마다 처음 한 번). */
export async function openNotice(ctx: NoticeCtx, id: string): Promise<Result> {
  const n = (await ctx.stores.notices.all()).find((x) => x.id === id);
  if (!n) return fail(404, 'not_found');
  if (ctx.actor) {
    const rid = `${id}:${ctx.actor}`;
    if (!(await ctx.stores.noticeReads.all()).some((r) => r.id === rid)) {
      await ctx.stores.noticeReads.put({ id: rid, noticeId: id, name: ctx.actor, at: ctx.now().toISOString() });
    }
  }
  const reads = ((await readMap(ctx)).get(id) ?? []).sort((a, b) => a.at.localeCompare(b.at));
  return ok({ ...row(n, reads, ctx.actor, ctx.today()), content: n.content, updatedBy: n.updatedBy, reads });
}
export type NoticeDetail = NoticeRow & { content: string; updatedBy: string; reads: NoticeRead[] };

interface NoticeInput {
  title?: unknown;
  content?: unknown;
  campus?: unknown;
  pinned?: unknown;
  until?: unknown;
}
function validate(ctx: NoticeCtx, input: NoticeInput) {
  const title = text(input.title);
  const content = text(input.content);
  const campus = text(input.campus);
  const until = input.until === null || input.until === undefined || input.until === '' ? null : input.until;
  if (!title || title.length > NOTICE_TITLE_MAX) return { error: 'invalid_title' } as const;
  if (!content || content.length > NOTICE_CONTENT_MAX) return { error: 'invalid_content' } as const;
  if (campus && !ctx.campuses().includes(campus)) return { error: 'invalid_campus' } as const;
  if (until !== null && !isDate(until)) return { error: 'invalid_until' } as const;
  return { title, content, campus, pinned: input.pinned === true, until: until as string | null };
}

export async function createNotice(ctx: NoticeCtx, input: NoticeInput): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  const v = validate(ctx, input);
  if ('error' in v) return fail(400, v.error!);
  if (v.until !== null && v.until < ctx.today()) return fail(400, 'invalid_until'); // 새 공지는 오늘 이후까지
  const now = ctx.now().toISOString();
  const n: Notice = { id: ctx.newId(), ...v, author: ctx.actor, createdAt: now, updatedAt: now, updatedBy: ctx.actor };
  await ctx.stores.notices.put(n);
  return ok({ id: n.id }, 201);
}

/** 수정. 게시 종료일을 지난 날로 바꾸면 바로 '지난 공지'가 된다(게시 내리기). */
export async function updateNotice(ctx: NoticeCtx, id: string, input: NoticeInput): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  const n = (await ctx.stores.notices.all()).find((x) => x.id === id);
  if (!n) return fail(404, 'not_found');
  const v = validate(ctx, input);
  if ('error' in v) return fail(400, v.error!);
  await ctx.stores.notices.put({ ...n, ...v, updatedAt: ctx.now().toISOString(), updatedBy: ctx.actor });
  return ok({ id });
}

/** 홈·메뉴: 게시 중인 공지 중 이 직원이 안 읽은 수, 최근 공지 5개. */
export async function noticeSummary(ctx: NoticeCtx) {
  const today = ctx.today();
  const reads = await readMap(ctx);
  const current = (await ctx.stores.notices.all()).filter((n) => isCurrent(n, today)).sort(order);
  const rows = current.map((n) => row(n, reads.get(n.id) ?? [], ctx.actor, today));
  return { unreadNotices: ctx.actor ? rows.filter((r) => !r.readByMe).length : 0, latestNotices: rows.slice(0, 5) };
}
