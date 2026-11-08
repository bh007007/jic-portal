/**
 * 인트라넷 /api/* 계산. 파일·네트워크에 의존하지 않는다.
 * - 학생·연수는 관리자 앱 core(createDb)를 그대로 쓴다(재학생 명단, 이름·캠퍼스).
 * - 외출·귀가 기록, 패널티, 설정은 Stores 로 분리한다. 로컬은 파일(server/localData.ts), 배포는 Supabase(예정, docs/intranet.md).
 * - 학생 신청(결석·외박)은 학생 앱의 server/requests.ts 모양·규칙을 그대로 쓴다(같은 저장소를 학생 앱과 같이 씀).
 * - 시각은 ISO(UTC)로 저장하고, 날짜·통금 판정은 필리핀 시간(UTC+8, 일광절약 없음)으로 한다.
 */
import type { Db } from '../../admin/server/core';
import { COMMENT_MAX, decideRequest, nightsBetween, overnightFor, type Absence, type Overnight, type RequestStatus, type RequestStore } from '../../student/server/requests';

// ── 시간
const TZ_OFFSET_MS = 8 * 3600e3;
/** 이 시각 전의 외출·귀가는 전날 밤으로 본다. */
export const NIGHT_CUTOFF_HOUR = 5;
const localIso = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString();
const localDate = (ms: number) => localIso(ms).slice(0, 10);
export const localHm = (ms: number) => localIso(ms).slice(11, 16);
const nightOf = (ms: number) => localDate(ms - NIGHT_CUTOFF_HOUR * 3600e3);
/** 그날 밤의 통금 시각(ms). 통금이 자정 이후(예: 00:30)면 다음 날로 넘긴다. */
function deadlineOf(night: string, curfew: string) {
  const base = Date.parse(`${night}T${curfew}:00+08:00`);
  return Number(curfew.slice(0, 2)) < NIGHT_CUTOFF_HOUR ? base + 864e5 : base;
}
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const isHm = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ── 저장 형태
export interface Outing {
  id: string;
  stId: string;
  trId: string;
  campus: string; // 기록한 출입구의 캠퍼스
  outAt: string | null; // 외출 기록 없이 귀가만 찍힌 경우 null
  outBy: string;
  inAt: string | null; // 외출 중이면 null
  inBy: string;
}

export type PenaltyStatus = 'pending' | 'approved' | 'rejected';
export interface Penalty {
  id: string;
  stId: string;
  kind: string; // PenaltyRules.kinds[].code
  date: string; // 발생일(통금 위반은 그날 밤)
  campus: string;
  basis: string; // 근거 문장
  source: 'outing';
  sourceId: string;
  status: PenaltyStatus;
  score: number | null; // 승인할 때의 점수표 점수(이후 점수표가 바뀌어도 그대로)
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
}

export interface Settings {
  curfew: string; // 'HH:MM'
  guards: string[];
}

export interface PenaltyKind {
  code: string;
  name: string;
  score: number | null; // null = 점수 미정
  approver: string; // 승인 권한(역할 이름). 역할별 권한이 생기기 전에는 안내용
}
export interface PenaltyStage {
  name: string;
  min: number | null; // 누적 점수 기준, null = 미정
}
export interface PenaltyRules {
  kinds: PenaltyKind[];
  stages: PenaltyStage[];
}

/** 통금 시각은 디자인(I1·I2)에 적힌 23:00 을 처음 값으로 둔다. 설정 화면에서 바꾼다. */
export const DEFAULT_SETTINGS: Settings = { curfew: '23:00', guards: [] };
/** 위반 종류는 디자인의 4가지. 점수·승인 권한·경고 기준은 정해지지 않아 비워 둔다(HANDOFF 7). */
export const DEFAULT_RULES: PenaltyRules = {
  kinds: [
    { code: 'absence', name: '무단결석', score: null, approver: '' },
    { code: 'curfew', name: '통금 위반', score: null, approver: '' },
    { code: 'alcohol', name: '음주', score: null, approver: '' },
    { code: 'other', name: '기타', score: null, approver: '' },
  ],
  stages: [
    { name: '1단계', min: null },
    { name: '2단계', min: null },
    { name: '3단계', min: null },
  ],
};

export interface Repo<T extends { id: string }> {
  all(): Promise<T[]>;
  put(x: T): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface DocRepo<T> {
  get(): Promise<T | null>;
  set(v: T): Promise<void>;
}
export interface Stores {
  outings: Repo<Outing>;
  penalties: Repo<Penalty>;
  settings: DocRepo<Settings>;
  rules: DocRepo<PenaltyRules>;
  /** 학생 앱과 같이 쓰는 신청 저장소 */
  absences: RequestStore<Absence>;
  overnights: RequestStore<Overnight>;
}

export interface IntranetCtx {
  db: Db;
  stores: Stores;
  now: () => Date;
  newId: () => string;
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string, extra?: Record<string, unknown>): Result => ({ status, body: { error, ...extra } });

// ── 학생: 재학생 명단(관리자 core 의 '재학' 분류)과 이름 찾기
interface StudentRef {
  stId: string;
  trId: string;
  name: string;
  campus: string;
  current: boolean;
}
const indexCache = new WeakMap<Db, Map<string, StudentRef>>();
function currentIndex(db: Db) {
  let m = indexCache.get(db);
  if (!m) {
    m = new Map();
    for (const r of db.listEnrollments(new URLSearchParams({ tab: 'current', all: '1' })).rows) {
      if (!m.has(r.stId)) m.set(r.stId, { stId: r.stId, trId: r.trId, name: r.name, campus: r.campus, current: true });
    }
    indexCache.set(db, m);
  }
  return m;
}
function studentRef(db: Db, stId: string): StudentRef {
  const cur = currentIndex(db).get(stId);
  if (cur) return cur;
  const d = db.studentDetail(stId);
  return { stId, trId: d?.enrollments[0]?.trId ?? '', name: d?.student.name ?? stId, campus: d?.enrollments[0]?.campus ?? '-', current: false };
}

async function loadSettings(ctx: IntranetCtx): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await ctx.stores.settings.get()) ?? {}) };
}
async function loadRules(ctx: IntranetCtx): Promise<PenaltyRules> {
  const saved = await ctx.stores.rules.get();
  if (!saved) return DEFAULT_RULES;
  // 저장된 값에 없는 종류·단계가 생기면 기본값으로 채운다.
  return {
    kinds: DEFAULT_RULES.kinds.map((k) => ({ ...k, ...saved.kinds.find((s) => s.code === k.code), code: k.code, name: k.name })),
    stages: DEFAULT_RULES.stages.map((st, i) => ({ ...st, min: saved.stages[i]?.min ?? null })),
  };
}

// ── 통금 판정
const minutesBetween = (a: number, b: number) => Math.max(0, Math.round((b - a) / 60000));

function outingTimes(o: Outing) {
  const outMs = o.outAt ? Date.parse(o.outAt) : null;
  const inMs = o.inAt ? Date.parse(o.inAt) : null;
  const night = nightOf((outMs ?? inMs)!);
  return { outMs, inMs, night };
}

/** 통금 위반이면 근거 문장, 아니면 null. 외출 중이면 지금 시각으로 판단한다. 승인된 외박이 있는 밤은 위반이 아니다. */
function curfewBreach(o: Outing, curfew: string, now: number, overnights: Overnight[]): string | null {
  const { outMs, inMs, night } = outingTimes(o);
  if (overnightFor(overnights, o.stId, night)) return null;
  const deadline = deadlineOf(night, curfew);
  const back = inMs !== null ? `귀가 ${localHm(inMs)}` : '미귀가';
  if (outMs !== null && outMs > deadline) return `통금 ${curfew} 이후 외출 ${localHm(outMs)}, ${back}`;
  if (inMs !== null && inMs > deadline) return `통금 ${curfew}, ${back}${outMs === null ? ' (외출 기록 없음)' : ''}`;
  if (inMs === null && now > deadline) return `통금 ${curfew}, ${back}`;
  return null;
}

/**
 * 외출 기록에서 통금 위반 패널티 후보를 만든다(여러 번 불러도 같은 결과).
 * 승인 대기 중인 후보는 근거를 다시 계산하고, 더는 위반이 아니면(통금 변경 등) 지운다. 처리된 건은 건드리지 않는다.
 */
async function syncCurfewPenalties(ctx: IntranetCtx) {
  const { curfew } = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const [outings, penalties, overnights] = await Promise.all([ctx.stores.outings.all(), ctx.stores.penalties.all(), ctx.stores.overnights.listAll()]);
  const bySource = new Map(penalties.filter((p) => p.source === 'outing').map((p) => [p.sourceId, p]));
  for (const o of outings) {
    const basis = curfewBreach(o, curfew, now, overnights);
    const existing = bySource.get(o.id);
    if (existing && existing.status !== 'pending') continue;
    if (!basis) {
      if (existing) await ctx.stores.penalties.remove(existing.id);
      continue;
    }
    const date = outingTimes(o).night;
    if (existing && existing.basis === basis && existing.date === date) continue;
    await ctx.stores.penalties.put(
      existing
        ? { ...existing, basis, date }
        : {
            id: 'curfew-' + o.id,
            stId: o.stId,
            kind: 'curfew',
            date,
            campus: o.campus,
            basis,
            source: 'outing',
            sourceId: o.id,
            status: 'pending',
            score: null,
            createdAt: ctx.now().toISOString(),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
    );
  }
}

// ── 가드 태블릿
function outingRow(ctx: IntranetCtx, o: Outing, curfew: string, now: number, overnights: Overnight[]) {
  const s = studentRef(ctx.db, o.stId);
  const { outMs, inMs, night } = outingTimes(o);
  const permit = overnightFor(overnights, o.stId, night);
  return {
    id: o.id,
    stId: o.stId,
    name: s.name,
    campus: o.campus,
    night,
    outAt: o.outAt,
    inAt: o.inAt,
    outBy: o.outBy,
    inBy: o.inBy,
    minutes: outMs !== null ? minutesBetween(outMs, inMs ?? now) : null,
    breach: curfewBreach(o, curfew, now, overnights),
    overnightUntil: permit?.until ?? null, // 승인된 외박의 복귀일
  };
}
export type OutingRow = ReturnType<typeof outingRow>;

async function guardView(ctx: IntranetCtx, q: URLSearchParams) {
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const campuses = [...new Set([...currentIndex(ctx.db).values()].map((s) => s.campus))].filter((c) => c && c !== '-').sort();
  const campus = q.get('campus') ?? '';
  const overnights = await ctx.stores.overnights.listAll();
  const outings = (await ctx.stores.outings.all()).filter((o) => !campus || o.campus === campus);
  const rows = outings.map((o) => outingRow(ctx, o, settings.curfew, now, overnights));
  const tonight = nightOf(now);
  const overnightTonight = overnights.filter((o) => overnightFor([o], o.stId, tonight) && (!campus || studentRef(ctx.db, o.stId).campus === campus)).length;
  const out = rows.filter((r) => r.inAt === null).sort((a, b) => (a.outAt ?? '').localeCompare(b.outAt ?? ''));
  const touched = (r: OutingRow) => r.inAt ?? r.outAt ?? '';
  const recent = rows.sort((a, b) => touched(b).localeCompare(touched(a))).slice(0, 5);
  return { now: ctx.now().toISOString(), curfew: settings.curfew, guards: settings.guards, campus, campuses, out, recent, overnightTonight };
}
export type GuardView = Awaited<ReturnType<typeof guardView>>;

async function guardScan(ctx: IntranetCtx, input: Record<string, unknown>): Promise<Result> {
  const stId = String(input.code ?? '').replace(/\D/g, '');
  const mode = input.mode;
  const campus = typeof input.campus === 'string' ? input.campus.trim() : '';
  const guard = typeof input.guard === 'string' ? input.guard.trim().slice(0, 40) : '';
  if (mode !== 'out' && mode !== 'in') return fail(400, 'invalid_mode');
  if (!campus) return fail(400, 'campus_required');
  if (!stId) return fail(400, 'code_required');
  const s = currentIndex(ctx.db).get(stId);
  if (!s) return fail(404, 'not_current');

  const settings = await loadSettings(ctx);
  if (settings.guards.length && !settings.guards.includes(guard)) return fail(400, 'guard_required');
  const nowIso = ctx.now().toISOString();
  const open = (await ctx.stores.outings.all()).filter((o) => o.stId === stId && o.inAt === null).sort((a, b) => (b.outAt ?? '').localeCompare(a.outAt ?? ''))[0];

  let rec: Outing;
  if (mode === 'out') {
    if (open) return fail(409, 'already_out', { outAt: open.outAt });
    rec = { id: ctx.newId(), stId, trId: s.trId, campus, outAt: nowIso, outBy: guard, inAt: null, inBy: '' };
  } else {
    // 외출 기록이 없어도 귀가는 남긴다(통금 확인에 필요). 화면에 '외출 기록 없음'으로 보인다.
    rec = open ? { ...open, inAt: nowIso, inBy: guard } : { id: ctx.newId(), stId, trId: s.trId, campus, outAt: null, outBy: '', inAt: nowIso, inBy: guard };
  }
  await ctx.stores.outings.put(rec);
  if (mode === 'in') await syncCurfewPenalties(ctx);
  return ok({ mode, row: outingRow(ctx, rec, settings.curfew, ctx.now().getTime(), await ctx.stores.overnights.listAll()) }, mode === 'out' || !open ? 201 : 200);
}

// ── 외출·귀가 기록 / 통금 확인
async function listOutings(ctx: IntranetCtx, q: URLSearchParams) {
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const night = isDate(q.get('date')) ? q.get('date')! : nightOf(now);
  const view = q.get('view') || 'all';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();

  const overnights = await ctx.stores.overnights.listAll();
  const all = (await ctx.stores.outings.all()).map((o) => outingRow(ctx, o, settings.curfew, now, overnights));
  const scoped = all.filter((r) => (!campus || r.campus === campus) && (!kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw)));
  const ofNight = scoped.filter((r) => r.night === night);
  const outNow = scoped.filter((r) => r.inAt === null);
  const lists: Record<string, OutingRow[]> = {
    all: ofNight,
    out: outNow,
    breach: ofNight.filter((r) => r.breach),
  };
  const rows = [...(lists[view] ?? lists.all)].sort((a, b) => (a.outAt ?? a.inAt ?? '').localeCompare(b.outAt ?? b.inAt ?? ''));
  const campuses = [...new Set(all.map((r) => r.campus))].sort();
  return {
    night,
    curfew: settings.curfew,
    view,
    counts: { all: lists.all.length, out: lists.out.length, breach: lists.breach.length },
    campuses,
    rows,
  };
}
export type OutingList = Awaited<ReturnType<typeof listOutings>>;

// ── 패널티
function stageOf(stages: PenaltyStage[], total: number) {
  const set = stages.filter((s) => s.min !== null).sort((a, b) => a.min! - b.min!);
  if (!set.length) return null; // 기준 미정
  return set.filter((s) => total >= s.min!).pop()?.name ?? '-';
}

async function listPenalties(ctx: IntranetCtx, q: URLSearchParams) {
  await syncCurfewPenalties(ctx);
  const rules = await loadRules(ctx);
  const kindOf = new Map(rules.kinds.map((k) => [k.code, k]));
  const all = await ctx.stores.penalties.all();

  const approvedTotal = new Map<string, number>();
  for (const p of all) if (p.status === 'approved') approvedTotal.set(p.stId, (approvedTotal.get(p.stId) ?? 0) + (p.score ?? 0));
  const stagesSet = rules.stages.some((s) => s.min !== null);

  const tab = (q.get('tab') as PenaltyStatus) || 'pending';
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const campus = q.get('campus') || '';
  const kind = q.get('kind') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();

  const rows = all
    .map((p) => {
      const s = studentRef(ctx.db, p.stId);
      const k = kindOf.get(p.kind);
      const score = p.status === 'pending' ? (k?.score ?? null) : p.score;
      const total = approvedTotal.get(p.stId) ?? 0;
      const after = p.status === 'pending' && score !== null ? total + score : total;
      const before = stageOf(rules.stages, total);
      const next = stageOf(rules.stages, after);
      return {
        ...p,
        name: s.name,
        kindName: k?.name ?? p.kind,
        approver: k?.approver ?? '',
        score,
        total: p.status === 'pending' ? (score === null ? null : after) : total,
        stage: !stagesSet ? null : before === next ? next : `${before} → ${next}`,
      };
    })
    .filter((r) => r.status === tab)
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!campus || r.campus === campus) && (!kind || r.kind === kind))
    .filter((r) => !kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw))
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const p of all) counts[p.status]++;
  return {
    tab,
    counts,
    kinds: rules.kinds.map((k) => ({ code: k.code, name: k.name })),
    stages: rules.stages,
    campuses: [...new Set(all.map((p) => p.campus))].sort(),
    rows,
  };
}
export type PenaltyList = Awaited<ReturnType<typeof listPenalties>>;

async function decidePenalties(ctx: IntranetCtx, input: Record<string, unknown>): Promise<Result> {
  const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
  const approve = input.approve === true;
  if (input.approve !== true && input.approve !== false) return fail(400, 'invalid_decision');
  if (!ids.length || ids.length > 200) return fail(400, 'ids_required');
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;

  const rules = await loadRules(ctx);
  const all = await ctx.stores.penalties.all();
  const nowIso = ctx.now().toISOString();
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const p = all.find((x) => x.id === id);
    if (!p || p.status !== 'pending') {
      skipped.push(id);
      continue;
    }
    const score = approve ? (rules.kinds.find((k) => k.code === p.kind)?.score ?? null) : null;
    // 로컬에는 로그인이 없어 처리자를 남기지 않는다. 배포에서는 로그인한 직원으로 채운다.
    await ctx.stores.penalties.put({ ...p, status: approve ? 'approved' : 'rejected', score, decidedAt: nowIso, decidedBy: null, note });
    done++;
  }
  return ok({ done, skipped });
}

function validRules(input: Record<string, unknown>): PenaltyRules | null {
  const kinds = Array.isArray(input.kinds) ? input.kinds : null;
  const stages = Array.isArray(input.stages) ? input.stages : null;
  if (!kinds || !stages || stages.length !== DEFAULT_RULES.stages.length) return null;
  const outKinds: PenaltyKind[] = [];
  for (const base of DEFAULT_RULES.kinds) {
    const k = kinds.find((x) => x && typeof x === 'object' && (x as PenaltyKind).code === base.code) as PenaltyKind | undefined;
    if (!k) return null;
    const score = k.score === null || k.score === undefined ? null : Number(k.score);
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) return null;
    const approver = typeof k.approver === 'string' ? k.approver.trim().slice(0, 20) : '';
    outKinds.push({ ...base, score, approver });
  }
  const outStages: PenaltyStage[] = [];
  for (let i = 0; i < stages.length; i++) {
    const raw = (stages[i] as PenaltyStage | null)?.min;
    const min = raw === null || raw === undefined ? null : Number(raw);
    if (min !== null && (!Number.isInteger(min) || min < 1 || min > 1000)) return null;
    outStages.push({ name: DEFAULT_RULES.stages[i].name, min });
  }
  const mins = outStages.map((s) => s.min).filter((m): m is number => m !== null);
  if (mins.some((m, i) => i > 0 && m <= mins[i - 1])) return null; // 단계가 올라갈수록 커야 한다
  return { kinds: outKinds, stages: outStages };
}

function validSettings(input: Record<string, unknown>): Settings | null {
  if (!isHm(input.curfew)) return null;
  const guards = Array.isArray(input.guards) ? input.guards.map((g) => String(g).trim()).filter(Boolean) : [];
  if (guards.length > 50 || guards.some((g) => g.length > 40)) return null;
  return { curfew: input.curfew, guards: [...new Set(guards)] };
}

// ── 학생 신청 처리(결석·외박)
type RequestKind = 'absences' | 'overnights';
const REQUEST_TABS: RequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

function requestRow(ctx: IntranetCtx, r: Absence | Overnight) {
  const s = studentRef(ctx.db, r.stId);
  return { name: s.name, campus: s.campus, current: s.current };
}

async function listRequests(ctx: IntranetCtx, kind: RequestKind, q: URLSearchParams) {
  const tab = (REQUEST_TABS as string[]).includes(q.get('tab') ?? '') ? (q.get('tab') as RequestStatus) : 'pending';
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const campus = q.get('campus') || '';
  const absKind = q.get('kind') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();

  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  const match = (r: { stId: string; name: string; campus: string; status: RequestStatus }) =>
    r.status === tab && (!campus || r.campus === campus) && (!kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw));
  // 대기는 날짜가 가까운 순(처리할 순서), 처리된 건은 최근 처리 순
  const order = <T extends { status: RequestStatus; decidedAt: string | null; updatedAt: string }>(day: (x: T) => string) => (a: T, b: T) =>
    tab === 'pending' ? day(a).localeCompare(day(b)) : (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt);

  if (kind === 'absences') {
    const all = (await ctx.stores.absences.listAll()).map((a) => ({ ...a, ...requestRow(ctx, a) }));
    for (const a of all) counts[a.status]++;
    const rows = all
      .filter((a) => match(a) && (!from || a.date >= from) && (!to || a.date <= to) && (!absKind || a.kind === absKind))
      .sort(order((a) => a.date));
    return { kind, tab, counts, campuses: [...new Set(all.map((a) => a.campus))].sort(), commentMax: COMMENT_MAX, absences: rows, overnights: [] };
  }
  const all = (await ctx.stores.overnights.listAll()).map((o) => ({ ...o, ...requestRow(ctx, o), nights: nightsBetween(o.from, o.until) }));
  for (const o of all) counts[o.status]++;
  // 기간 검색은 외박 기간이 조회 범위와 겹치는 건
  const rows = all.filter((o) => match(o) && (!from || o.until > from) && (!to || o.from <= to)).sort(order((o) => o.from));
  return { kind, tab, counts, campuses: [...new Set(all.map((o) => o.campus))].sort(), commentMax: COMMENT_MAX, absences: [], overnights: rows };
}
export type RequestList = Awaited<ReturnType<typeof listRequests>>;

async function decideRequests(ctx: IntranetCtx, kind: RequestKind, input: Record<string, unknown>): Promise<Result> {
  const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
  if (input.approve !== true && input.approve !== false) return fail(400, 'invalid_decision');
  if (!ids.length || ids.length > 200) return fail(400, 'ids_required');
  const comment = typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim().slice(0, COMMENT_MAX) : null;
  // 로컬에는 로그인이 없어 처리자를 남기지 않는다. 배포에서는 로그인한 직원으로 채운다.
  const store = (kind === 'absences' ? ctx.stores.absences : ctx.stores.overnights) as RequestStore<Absence | Overnight>;
  let doneCount = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const x = await store.get(id);
    const out = x ? decideRequest(x, input.approve, comment, null, ctx.now()) : null;
    if (!out || !out.ok) {
      skipped.push(id);
      continue;
    }
    await store.put(out.value);
    doneCount++;
  }
  // 외박 승인·반려는 통금 위반 후보에 바로 반영한다.
  if (kind === 'overnights' && doneCount) await syncCurfewPenalties(ctx);
  return ok({ done: doneCount, skipped });
}

async function summary(ctx: IntranetCtx) {
  await syncCurfewPenalties(ctx);
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const night = nightOf(now);
  const [outings, penalties, absences, overnights] = await Promise.all([
    ctx.stores.outings.all(),
    ctx.stores.penalties.all(),
    ctx.stores.absences.listAll(),
    ctx.stores.overnights.listAll(),
  ]);
  return {
    night,
    curfew: settings.curfew,
    outNow: outings.filter((o) => o.inAt === null).length,
    breachTonight: outings.filter((o) => outingTimes(o).night === night && curfewBreach(o, settings.curfew, now, overnights)).length,
    overnightTonight: overnights.filter((o) => overnightFor([o], o.stId, night)).length,
    pending: penalties.filter((p) => p.status === 'pending').length,
    pendingAbsences: absences.filter((a) => a.status === 'pending').length,
    pendingOvernights: overnights.filter((o) => o.status === 'pending').length,
    current: currentIndex(ctx.db).size,
  };
}
export type Summary = Awaited<ReturnType<typeof summary>>;

/** /api 아래 경로를 처리한다. */
export async function handleIntranetApi(ctx: IntranetCtx, method: string, pathname: string, q: URLSearchParams, body: unknown): Promise<Result> {
  try {
    const p = pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const route = `${method} ${p}`;
    switch (route) {
      case 'GET /meta': {
        const m = ctx.db.meta();
        return ok({ source: m.source, refDate: m.refDate });
      }
      case 'GET /summary':
        return ok(await summary(ctx));
      case 'GET /guard':
        return ok(await guardView(ctx, q));
      case 'POST /guard/scan':
        return await guardScan(ctx, input);
      case 'GET /outings':
        return ok(await listOutings(ctx, q));
      case 'GET /penalties':
        return ok(await listPenalties(ctx, q));
      case 'POST /penalties/decide':
        return await decidePenalties(ctx, input);
      case 'GET /penalty-rules':
        return ok(await loadRules(ctx));
      case 'PUT /penalty-rules': {
        const r = validRules(input);
        if (!r) return fail(400, 'invalid_rules');
        await ctx.stores.rules.set(r);
        return ok(r);
      }
      case 'GET /requests/absences':
        return ok(await listRequests(ctx, 'absences', q));
      case 'GET /requests/overnights':
        return ok(await listRequests(ctx, 'overnights', q));
      case 'POST /requests/absences/decide':
        return await decideRequests(ctx, 'absences', input);
      case 'POST /requests/overnights/decide':
        return await decideRequests(ctx, 'overnights', input);
      case 'GET /settings':
        return ok(await loadSettings(ctx));
      case 'PUT /settings': {
        const s = validSettings(input);
        if (!s) return fail(400, 'invalid_settings');
        await ctx.stores.settings.set(s);
        return ok(s);
      }
    }
    return fail(404, 'not_found');
  } catch (e) {
    return fail(500, (e as Error).message);
  }
}
