/**
 * 인트라넷 /api/* 계산. 파일·네트워크에 의존하지 않는다.
 * - 학생·연수는 관리자 앱 core(createDb)를 그대로 쓴다(재학생 명단, 이름·캠퍼스).
 * - 외출·귀가 기록, 패널티, 설정은 Stores 로 분리한다. 로컬은 파일(server/localData.ts), 배포는 Supabase(server/supabaseStores.ts).
 * - 학생 신청(결석·외박)은 학생 앱의 server/requests.ts 모양·규칙을 그대로 쓴다(같은 저장소를 학생 앱과 같이 씀).
 * - 시각은 ISO(UTC)로 저장하고, 날짜·통금 판정은 필리핀 시간(UTC+8, 일광절약 없음)으로 한다.
 */
import type { Db } from '../../admin/server/core';
import {
  counselingOf,
  createCounseling,
  followUpCounts,
  listAudit,
  listCounseling,
  openCounseling,
  setFollowUp,
  updateCounseling,
  type AuditLog,
  type CounselingCtx,
  type CounselingNote,
  type CounselingRemote,
} from './counseling';
import { decideRide, rideState, type Departure, type DepartureStore, type RideState, type RideStore } from '../../student/server/departures';
import { handleLifeRequest, LIFE_CATEGORIES, LIFE_REPLY_MAX, type LifeRequestStore, type LifeStatus } from '../../student/server/lifeRequests';
import { PENALTY_KIND_OF, REPORT_KINDS, REPORT_LABEL, REPORT_NOTE_MAX, type IncidentReport, type ReportKind } from './reports';
import { createNotice, listNotices, noticeSummary, openNotice, updateNotice, type Notice, type NoticeCtx, type NoticeRead } from './notices';
import { COMMENT_MAX, decideRequest, nightsBetween, overnightFor, type Absence, type Overnight, type RequestStatus, type RequestStore } from '../../student/server/requests';
import { readKeycard, type KeycardSecret } from '../../student/server/keycard';
import {
  isAccepting,
  REMOVE_REASON_MAX,
  removeSignup,
  saveTrip,
  setTripStatus,
  TRIP_CAPACITY_MAX,
  TRIP_DESC_MAX,
  TRIP_MEETING_MAX,
  TRIP_NIGHTS_MAX,
  TRIP_PLACE_MAX,
  TRIP_TITLE_MAX,
  tripNights,
  tripPermits,
  type Trip,
  type TripStore,
} from '../../student/server/trips';

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
  /** 찍은 방법: 카드키 QR 또는 학생번호 직접 입력(11/8 전 기록은 없음) */
  outVia?: 'qr' | 'number' | null;
  inVia?: 'qr' | 'number' | null;
}

export type PenaltyStatus = 'pending' | 'approved' | 'rejected';
export interface Penalty {
  id: string;
  stId: string;
  kind: string; // PenaltyRules.kinds[].code
  date: string; // 발생일(통금 위반은 그날 밤)
  campus: string;
  basis: string; // 근거 문장
  source: 'outing' | 'guard'; // 외출 기록(통금 위반 자동) | 가드 리포트
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
  /** 상담 기록과 접근 기록(추가만) */
  counseling: Repo<CounselingNote>;
  audit: Repo<AuditLog>;
  /** 배포: 상담 기록 열람·작성·수정·후속 조치는 DB 함수로(counseling.ts) */
  counselingRemote?: CounselingRemote;
  /** 내부 공지와 읽음 */
  notices: Repo<Notice>;
  noticeReads: Repo<NoticeRead>;
  /** 가드 리포트(사건 리포트) */
  reports: Repo<IncidentReport>;
  /** 학생 앱과 같이 쓰는 생활 요청(학생이 내고 직원이 처리, 학생 앱 server/lifeRequests.ts) */
  lifeRequests: LifeRequestStore;
  /** 학교 여행·액티비티(직원이 올림)와 참가 신청(학생이 냄, 학생 앱 server/trips.ts) */
  trips: TripStore;
  /** 학생 앱과 같이 쓰는 귀국 항공편과, 직원이 쓰는 공항 이동 배차 */
  departures: DepartureStore;
  rides: RideStore;
}

export interface IntranetCtx {
  db: Db;
  stores: Stores;
  now: () => Date;
  newId: () => string;
  /** 처리자 이름: 로컬은 브라우저에 입력한 직원 이름, 배포는 로그인한 직원. 상담 기록 열람·작성과 접근 기록에 쓴다. */
  actor?: string | null;
  /** 카드키 QR 서명 비밀 값(학생 앱 server/keycard.ts). 로컬은 파일, 배포는 가드 요청에서 서비스 키로. 없으면 QR 은 받지 않고 번호만 */
  keycardSecret?: KeycardSecret;
  /** 배포: 로그인한 계정 종류. 가드 공용 계정은 그 출입구(캠퍼스)로 고정한다. 로컬은 없음. */
  session?: { role: 'staff' | 'guard'; campus?: string | null };
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

/**
 * 통금 확인·가드 태블릿이 보는 외박 허용: 승인된 외박·여행 신청과, 1박 이상 학교 여행의 참가 신청(trips.ts tripPermits).
 * 신청 처리 목록·Student File 의 외박 신청 목록은 이것 대신 신청 저장소(overnights)만 본다.
 */
async function permitsOf(ctx: IntranetCtx): Promise<Overnight[]> {
  const [overnights, trips, signups] = await Promise.all([ctx.stores.overnights.listAll(), ctx.stores.trips.listTrips(), ctx.stores.trips.listSignups()]);
  return [...overnights, ...tripPermits(trips, signups)];
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
  const [outings, penalties, overnights] = await Promise.all([ctx.stores.outings.all(), ctx.stores.penalties.all(), permitsOf(ctx)]);
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
    overnightTrip: permit?.tripId ? permit.reason : null, // 학교 여행 참가로 허용된 외박이면 여행 이름
    outVia: o.outVia ?? null, // 카드키 QR('qr') 또는 학생번호 직접 입력('number')
    inVia: o.inVia ?? null,
  };
}
export type OutingRow = ReturnType<typeof outingRow>;

async function guardView(ctx: IntranetCtx, q: URLSearchParams) {
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  // 가드 공용 계정은 자기 출입구만(화면은 캠퍼스가 하나면 고르지 않고 그대로 쓴다)
  const guardCampus = ctx.session?.role === 'guard' ? (ctx.session.campus ?? '') : null;
  const campuses = guardCampus !== null ? [guardCampus] : [...new Set([...currentIndex(ctx.db).values()].map((s) => s.campus))].filter((c) => c && c !== '-').sort();
  const campus = guardCampus ?? q.get('campus') ?? '';
  const overnights = await permitsOf(ctx);
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
  const read = await readKeycard(ctx.keycardSecret, input.code, ctx.now().getTime());
  const mode = input.mode;
  const campus = typeof input.campus === 'string' ? input.campus.trim() : '';
  const guard = typeof input.guard === 'string' ? input.guard.trim().slice(0, 40) : '';
  if (mode !== 'out' && mode !== 'in') return fail(400, 'invalid_mode');
  if (!campus) return fail(400, 'campus_required');
  if (!read.ok) return fail(read.error === 'qr_unavailable' ? 503 : 400, read.error);
  const { stId, via } = read;
  const s = currentIndex(ctx.db).get(stId);
  if (!s) return fail(404, 'not_current');

  const settings = await loadSettings(ctx);
  if (settings.guards.length && !settings.guards.includes(guard)) return fail(400, 'guard_required');
  const nowIso = ctx.now().toISOString();
  const open = (await ctx.stores.outings.all()).filter((o) => o.stId === stId && o.inAt === null).sort((a, b) => (b.outAt ?? '').localeCompare(a.outAt ?? ''))[0];

  let rec: Outing;
  if (mode === 'out') {
    if (open) return fail(409, 'already_out', { outAt: open.outAt });
    rec = { id: ctx.newId(), stId, trId: s.trId, campus, outAt: nowIso, outBy: guard, inAt: null, inBy: '', outVia: via, inVia: null };
  } else {
    // 외출 기록이 없어도 귀가는 남긴다(통금 확인에 필요). 화면에 '외출 기록 없음'으로 보인다.
    rec = open ? { ...open, inAt: nowIso, inBy: guard, inVia: via } : { id: ctx.newId(), stId, trId: s.trId, campus, outAt: null, outBy: '', inAt: nowIso, inBy: guard, outVia: null, inVia: via };
  }
  await ctx.stores.outings.put(rec);
  // 통금 위반 후보 정리는 직원 일이다(직원 화면을 열 때도 정리한다). 배포의 가드 계정은 후보를 쓸 권한이 없어 건너뛴다.
  if (mode === 'in' && ctx.session?.role !== 'guard') await syncCurfewPenalties(ctx);
  return ok({ mode, row: outingRow(ctx, rec, settings.curfew, ctx.now().getTime(), await permitsOf(ctx)) }, mode === 'out' || !open ? 201 : 200);
}

/**
 * 가드 리포트 등록 → 패널티 승인 대기 후보(출처 'guard')를 바로 만든다.
 * 발생 시각은 'HH:MM'(필리핀 시간)으로 받고, 지금보다 뒤면 전날로 본다(자정 넘어 쓰는 리포트). 없으면 지금.
 */
async function guardReport(ctx: IntranetCtx, input: Record<string, unknown>): Promise<Result> {
  // 학생번호 또는 카드키 QR(시간이 지난 QR 도 그 학생으로 본다: 리포트는 누구인지만 필요하다)
  const raw = String(input.code ?? '').trim();
  const read = await readKeycard(ctx.keycardSecret, raw, ctx.now().getTime());
  const stId = read.ok ? read.stId : read.error === 'qr_expired' ? raw.split('.')[1] : '';
  const campus = typeof input.campus === 'string' ? input.campus.trim() : '';
  const guard = typeof input.guard === 'string' ? input.guard.trim().slice(0, 40) : '';
  const kind = input.kind as ReportKind;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!campus) return fail(400, 'campus_required');
  if (!stId) return fail(read.ok ? 400 : read.error === 'qr_unavailable' ? 503 : 400, read.ok ? 'code_required' : read.error);
  const s = currentIndex(ctx.db).get(stId);
  if (!s) return fail(404, 'not_current');
  if (!REPORT_KINDS.includes(kind)) return fail(400, 'invalid_kind');
  if (!note || note.length > REPORT_NOTE_MAX) return fail(400, 'invalid_note');
  const settings = await loadSettings(ctx);
  if (settings.guards.length && !settings.guards.includes(guard)) return fail(400, 'guard_required');

  const nowMs = ctx.now().getTime();
  let occurredMs = nowMs;
  if (input.time !== undefined && input.time !== null && input.time !== '') {
    if (!isHm(input.time)) return fail(400, 'invalid_time');
    occurredMs = Date.parse(`${localDate(nowMs)}T${input.time}:00+08:00`);
    if (occurredMs > nowMs) occurredMs -= 864e5;
  }
  const createdAt = ctx.now().toISOString();
  const rep: IncidentReport = { id: ctx.newId(), stId, trId: s.trId, campus, kind, note, occurredAt: new Date(occurredMs).toISOString(), reportedBy: guard, createdAt };
  await ctx.stores.reports.put(rep);
  const short = note.length > 60 ? note.slice(0, 60) + '…' : note;
  await ctx.stores.penalties.put({
    id: 'guard-' + rep.id,
    stId,
    kind: PENALTY_KIND_OF[kind],
    date: nightOf(occurredMs),
    campus,
    basis: `가드 리포트(${localHm(occurredMs)}): ${REPORT_LABEL[kind]} — ${short}`,
    source: 'guard',
    sourceId: rep.id,
    status: 'pending',
    score: null,
    createdAt,
    decidedAt: null,
    decidedBy: null,
    note: null,
  });
  return ok({ report: { ...rep, name: s.name, kindLabel: REPORT_LABEL[kind] } }, 201);
}

async function listReports(ctx: IntranetCtx, q: URLSearchParams) {
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const campus = q.get('campus') || '';
  const kind = q.get('kind') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const penalties = new Map((await ctx.stores.penalties.all()).filter((p) => p.source === 'guard').map((p) => [p.sourceId, p]));
  const all = (await ctx.stores.reports.all()).map((r) => {
    const p = penalties.get(r.id);
    return { ...r, name: studentRef(ctx.db, r.stId).name, kindLabel: REPORT_LABEL[r.kind], date: localDate(Date.parse(r.occurredAt)), penaltyStatus: p?.status ?? null, penaltyId: p?.id ?? null };
  });
  const rows = all
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!campus || r.campus === campus) && (!kind || r.kind === kind))
    .filter((r) => !kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw) || r.reportedBy.toLowerCase().includes(kw))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return {
    kinds: REPORT_KINDS.map((k) => ({ code: k, name: REPORT_LABEL[k] })),
    campuses: [...new Set(all.map((r) => r.campus))].sort(),
    rows,
  };
}
export type ReportList = Awaited<ReturnType<typeof listReports>>;

// ── 귀국 일정: 학생 앱에서 등록한 귀국 항공편(공항 이동 배차용)과 졸업이 가까운 미등록 학생
const DEPARTURE_SOON_DAYS = 14; // 관리자 앱의 '졸업임박'과 같은 14일
const addDaysTo = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

async function listDepartures(ctx: IntranetCtx, q: URLSearchParams) {
  const today = localDate(ctx.now().getTime());
  const soon = addDaysTo(today, DEPARTURE_SOON_DAYS);
  const view = q.get('view') === 'missing' ? 'missing' : 'registered';
  const from = q.get('from') || today;
  const to = q.get('to') || soon;
  const campus = q.get('campus') || '';
  const rideFilter = q.get('ride') || ''; // '1' = 차량 요청만, 'pending' = 처리할 것(요청·재확인)
  const all = await ctx.stores.departures.listAll();
  const rides = new Map((await ctx.stores.rides.listAll()).map((r) => [r.id, r]));
  const PENDING: RideState[] = ['requested', 'changed'];
  const byTr = new Map(all.map((d) => [d.trId, d]));
  const cur = [...new Map(currentRows(ctx).map((r) => [r.stId, r] as const)).values()];
  const endOf = new Map(cur.map((r) => [r.trId, r.end]));

  const registered = all
    .map((d) => {
      const s = studentRef(ctx.db, d.stId);
      const r = rides.get(d.id) ?? null;
      return { ...d, name: s.name, campus: s.campus, end: endOf.get(d.trId) ?? '', ride: { state: rideState(d, r), record: r } };
    })
    .filter((d) => d.date >= from && d.date <= to && (!campus || d.campus === campus))
    .filter((d) => !rideFilter || (rideFilter === 'pending' ? PENDING.includes(d.ride.state) : d.needsRide))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const missing = cur
    .filter((r) => r.end >= today && r.end <= soon && !byTr.has(r.trId) && (!campus || r.campus === campus))
    .map((r) => ({ stId: r.stId, trId: r.trId, name: r.name, campus: r.campus, end: r.end, daysLeft: Math.round((Date.parse(r.end) - Date.parse(today)) / 864e5) }))
    .sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
  return {
    view,
    today,
    from,
    to,
    counts: {
      registered: registered.length,
      missing: missing.length,
      rides: registered.filter((d) => d.needsRide).length,
      // 메뉴 숫자: 오늘 이후 출발 중 처리할 배차(기간·검색과 관계없이)
      ridePending: all.filter((d) => d.date >= today && PENDING.includes(rideState(d, rides.get(d.id) ?? null))).length,
    },
    campuses: [...new Set(cur.map((r) => r.campus))].sort(),
    registered,
    missing,
  };
}
export type DepartureList = Awaited<ReturnType<typeof listDepartures>>;

/** 공항 이동 배차 확정·불가. 처리자는 직원 이름(로컬: 오른쪽 위 입력, 배포: 로그인). 다시 처리하면 덮어쓴다. */
async function decideDepartureRide(ctx: IntranetCtx, id: string, input: Record<string, unknown>): Promise<Result> {
  if (!ctx.actor) return fail(400, 'actor_required');
  const d = await ctx.stores.departures.get(id);
  if (!d) return fail(404, 'not_found');
  if (d.date < localDate(ctx.now().getTime())) return fail(409, 'departure_passed');
  const out = decideRide(d, input, ctx.actor, ctx.now());
  if (!out.ok) return fail(out.status, out.error);
  await ctx.stores.rides.put(out.value);
  return ok({ id, state: rideState(d, out.value) });
}

// ── 외출·귀가 기록 / 통금 확인
async function listOutings(ctx: IntranetCtx, q: URLSearchParams) {
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const night = isDate(q.get('date')) ? q.get('date')! : nightOf(now);
  const view = q.get('view') || 'all';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();

  const overnights = await permitsOf(ctx);
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

function requestRow(ctx: IntranetCtx, r: { stId: string }) {
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
  const list = await ctx.stores.overnights.listAll();
  // 같이 가는 학생: 이름과, 그 학생도 같은 기간에 외박·여행 신청(대기·승인)을 냈는지(혼자만 신청한 동행을 직원이 바로 보게)
  const companionsOf = (o: Overnight) =>
    (o.companions ?? []).map((c) => ({
      stId: c,
      name: studentRef(ctx.db, c).name,
      requested: list.some((x) => x.stId === c && (x.status === 'pending' || x.status === 'approved') && x.from < o.until && o.from < x.until),
    }));
  const all = list.map((o) => ({ ...o, ...requestRow(ctx, o), nights: nightsBetween(o.from, o.until), companionInfo: companionsOf(o) }));
  for (const o of all) counts[o.status]++;
  // 기간 검색은 외박 기간이 조회 범위와 겹치는 건
  const rows = all.filter((o) => match(o) && (!from || o.until > from) && (!to || o.from <= to)).sort(order((o) => o.from));
  return { kind, tab, counts, campuses: [...new Set(all.map((o) => o.campus))].sort(), commentMax: COMMENT_MAX, absences: [], overnights: rows };
}
export type RequestList = Awaited<ReturnType<typeof listRequests>>;

// ── 생활 요청(업체 '요청사항(학생)'·'ID 카드 교체'): 접수 → 처리 중 → 완료·반려
const LIFE_TABS: LifeStatus[] = ['received', 'in_progress', 'done', 'rejected', 'cancelled'];
async function listLifeRequests(ctx: IntranetCtx, q: URLSearchParams) {
  const tab = (LIFE_TABS as string[]).includes(q.get('tab') ?? '') ? (q.get('tab') as LifeStatus) : 'received';
  const category = q.get('category') || '';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const all = (await ctx.stores.lifeRequests.listAll()).map((r) => ({ ...r, ...requestRow(ctx, r) }));
  const counts = Object.fromEntries(LIFE_TABS.map((t) => [t, 0])) as Record<LifeStatus, number>;
  for (const r of all) counts[r.status]++;
  const open = tab === 'received' || tab === 'in_progress';
  const rows = all
    .filter((r) => r.status === tab && (!category || r.category === category) && (!campus || r.campus === campus))
    .filter((r) => !kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw) || r.content.toLowerCase().includes(kw))
    // 처리할 건은 오래된 순, 끝난 건은 최근 처리 순
    .sort((a, b) => (open ? a.submittedAt.localeCompare(b.submittedAt) : (b.handledAt ?? b.updatedAt).localeCompare(a.handledAt ?? a.updatedAt)));
  return { tab, counts, categories: LIFE_CATEGORIES, campuses: [...new Set(all.map((r) => r.campus))].sort(), replyMax: LIFE_REPLY_MAX, rows };
}
export type LifeRequestList = Awaited<ReturnType<typeof listLifeRequests>>;

async function handleLifeRequestRoute(ctx: IntranetCtx, id: string, input: Record<string, unknown>): Promise<Result> {
  const out = handleLifeRequest(await ctx.stores.lifeRequests.get(id), input, ctx.actor ?? null, ctx.now());
  if (!out.ok) return fail(out.status, out.error);
  await ctx.stores.lifeRequests.put(out.value);
  return ok(out.value);
}

// ── 학교 여행·액티비티(업체 'Outing > Travel'): 직원이 올리고 학생이 앱에서 참가 신청한다(학생 앱 server/trips.ts)
const tripCampuses = (ctx: IntranetCtx) => [...new Set([...currentIndex(ctx.db).values()].map((s) => s.campus))].filter((c) => c && c !== '-').sort();
const TRIP_LIMITS = { title: TRIP_TITLE_MAX, place: TRIP_PLACE_MAX, meeting: TRIP_MEETING_MAX, description: TRIP_DESC_MAX, capacity: TRIP_CAPACITY_MAX, nights: TRIP_NIGHTS_MAX, reason: REMOVE_REASON_MAX };
const tripRow = (t: Trip, today: string) => ({ ...t, nights: tripNights(t), accepting: isAccepting(t, today) });

async function listTrips(ctx: IntranetCtx, q: URLSearchParams) {
  const today = localDate(ctx.now().getTime());
  const tab = q.get('tab') === 'past' ? 'past' : 'upcoming';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const all = await ctx.stores.trips.listTrips();
  const past = (t: Trip) => t.end < today;
  const counts = { upcoming: all.filter((t) => !past(t)).length, past: all.filter(past).length };
  const rows = all
    .filter((t) => past(t) === (tab === 'past') && (!campus || t.campus === campus || t.campus === ''))
    .filter((t) => !kw || t.title.toLowerCase().includes(kw) || t.place.toLowerCase().includes(kw))
    // 다가오는 여행은 가까운 순, 지난 여행은 최근 순
    .sort((a, b) => (tab === 'past' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)) || a.title.localeCompare(b.title))
    .map((t) => tripRow(t, today));
  return { today, tab, counts, campuses: tripCampuses(ctx), limits: TRIP_LIMITS, rows };
}
export type TripList = Awaited<ReturnType<typeof listTrips>>;

async function tripDetail(ctx: IntranetCtx, id: string) {
  const t = await ctx.stores.trips.getTrip(id);
  if (!t) return null;
  const today = localDate(ctx.now().getTime());
  const signups = (await ctx.stores.trips.listSignups(id))
    .map((x) => ({ ...x, ...requestRow(ctx, x) }))
    // 참가 신청을 먼저(신청 순), 취소·제외는 뒤에
    .sort((a, b) => Number(b.status === 'applied') - Number(a.status === 'applied') || a.createdAt.localeCompare(b.createdAt));
  return { today, trip: tripRow(t, today), campuses: tripCampuses(ctx), limits: TRIP_LIMITS, signups };
}
export type TripDetail = NonNullable<Awaited<ReturnType<typeof tripDetail>>>;

async function saveTripRoute(ctx: IntranetCtx, id: string | null, input: Record<string, unknown>): Promise<Result> {
  const cur = id ? await ctx.stores.trips.getTrip(id) : null;
  if (id && !cur) return fail(404, 'not_found');
  const out = saveTrip({ now: ctx.now, newId: ctx.newId, today: localDate(ctx.now().getTime()), actor: ctx.actor ?? null, campuses: tripCampuses(ctx) }, cur, input);
  if (!out.ok) return fail(out.status, out.error);
  await ctx.stores.trips.putTrip(out.value);
  // 날짜를 바꾸면 외박 허용 밤이 달라진다
  if (cur && (cur.start !== out.value.start || cur.end !== out.value.end)) await syncCurfewPenalties(ctx);
  return ok(out.value, out.status);
}

async function tripStatusRoute(ctx: IntranetCtx, id: string, input: Record<string, unknown>): Promise<Result> {
  const out = setTripStatus(await ctx.stores.trips.getTrip(id), input.status, ctx.now());
  if (!out.ok) return fail(out.status, out.error);
  await ctx.stores.trips.putTrip(out.value);
  if (out.value.status === 'cancelled') await syncCurfewPenalties(ctx); // 취소한 여행은 외박 허용이 아니다
  return ok(out.value);
}

async function removeSignupRoute(ctx: IntranetCtx, id: string, input: Record<string, unknown>): Promise<Result> {
  const out = removeSignup(await ctx.stores.trips.getSignup(id), input, ctx.actor ?? null, ctx.now());
  if (!out.ok) return fail(out.status, out.error);
  await ctx.stores.trips.putSignup(out.value);
  await syncCurfewPenalties(ctx); // 명단에서 빠지면 그 밤의 외박 허용도 빠진다
  return ok(out.value);
}

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

// ── Student File: 학생 한 명의 생활 기록(외출·패널티·결석·외박). 기본 정보·연수·회계는 관리자 앱 학생 상세에 있다.
const RECENT_NIGHTS = 30;

async function lifeData(ctx: IntranetCtx) {
  await syncCurfewPenalties(ctx);
  const [settings, rules, outings, penalties, absences, overnights, trips, signups] = await Promise.all([
    loadSettings(ctx),
    loadRules(ctx),
    ctx.stores.outings.all(),
    ctx.stores.penalties.all(),
    ctx.stores.absences.listAll(),
    ctx.stores.overnights.listAll(),
    ctx.stores.trips.listTrips(),
    ctx.stores.trips.listSignups(),
  ]);
  // permits: 통금 판정용(학교 여행 포함), overnights: 학생이 낸 외박·여행 신청
  return { settings, rules, outings, penalties, absences, overnights, trips, signups, permits: [...overnights, ...tripPermits(trips, signups)] };
}
const approvedScore = (list: Penalty[]) => list.filter((p) => p.status === 'approved').reduce((sum, p) => sum + (p.score ?? 0), 0);

async function studentFiles(ctx: IntranetCtx, q: URLSearchParams) {
  const life = await lifeData(ctx);
  const now = ctx.now().getTime();
  const tonight = nightOf(now);
  const since = nightOf(now - RECENT_NIGHTS * 864e5);
  const by = <T extends { stId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(x.stId, [...(m.get(x.stId) ?? []), x]);
    return m;
  };
  const pen = by(life.penalties);
  const outs = by(life.outings);
  const abs = by(life.absences);
  const ovs = by(life.overnights);
  // 연장으로 재학 연수가 둘이면 학생당 한 줄만 남긴다.
  const current = [...new Map(currentRows(ctx).map((r) => [r.stId, r] as const)).values()];

  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const sort = q.get('sort') || 'score';
  const rows = current
    .filter((r) => (!campus || r.campus === campus) && (!kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw)))
    .map((r) => {
      const ps = pen.get(r.stId) ?? [];
      const os = outs.get(r.stId) ?? [];
      const total = approvedScore(ps);
      const breaches = os.filter((o) => outingTimes(o).night >= since && curfewBreach(o, life.settings.curfew, now, life.permits)).length;
      return {
        stId: r.stId,
        name: r.name,
        nation: r.nation,
        campus: r.campus,
        end: r.end,
        total,
        stage: stageOf(life.rules.stages, total),
        breaches,
        pendingPenalties: ps.filter((p) => p.status === 'pending').length,
        pendingRequests: [...(abs.get(r.stId) ?? []), ...(ovs.get(r.stId) ?? [])].filter((x) => x.status === 'pending').length,
        outNow: os.some((o) => o.inAt === null),
        overnightTonight: !!overnightFor(life.permits, r.stId, tonight),
      };
    });
  const sorters: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    score: (a, b) => b.total - a.total || b.breaches - a.breaches || a.name.localeCompare(b.name),
    breaches: (a, b) => b.breaches - a.breaches || b.total - a.total || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows.sort(sorters[sort] ?? sorters.score);
  return { recentNights: RECENT_NIGHTS, sort, campuses: [...new Set(current.map((r) => r.campus))].sort(), rows };
}
export type StudentFileList = Awaited<ReturnType<typeof studentFiles>>;

/** 재학생 연수 행(관리자 core 의 '재학' 분류). */
function currentRows(ctx: IntranetCtx) {
  return ctx.db.listEnrollments(new URLSearchParams({ tab: 'current', all: '1' })).rows;
}

async function studentFile(ctx: IntranetCtx, stId: string) {
  const d = ctx.db.studentDetail(stId);
  if (!d) return null;
  const life = await lifeData(ctx);
  const now = ctx.now().getTime();
  const kindName = new Map(life.rules.kinds.map((k) => [k.code, k.name]));
  const main = d.enrollments.find((e) => e.status === 'current') ?? d.enrollments.find((e) => e.status === 'upcoming') ?? d.enrollments[0] ?? null;
  const penalties = life.penalties
    .filter((p) => p.stId === stId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => ({ ...p, kindName: kindName.get(p.kind) ?? p.kind, score: p.status === 'pending' ? (life.rules.kinds.find((k) => k.code === p.kind)?.score ?? null) : p.score }));
  const total = approvedScore(life.penalties.filter((p) => p.stId === stId));
  const outings = life.outings
    .filter((o) => o.stId === stId)
    .map((o) => outingRow(ctx, o, life.settings.curfew, now, life.permits))
    .sort((a, b) => (b.outAt ?? b.inAt ?? '').localeCompare(a.outAt ?? a.inAt ?? ''));
  return {
    refDate: d.refDate,
    curfew: life.settings.curfew,
    student: {
      stId,
      name: d.student.name,
      nation: d.student.nation,
      gender: d.student.gender,
      campus: main?.campus ?? '-',
      course: main?.course ?? '',
      dorm: main?.dormStay?.type || main?.dorm || '',
      start: main?.start ?? '',
      end: main?.end ?? '',
      status: main?.status ?? 'other',
    },
    total,
    stage: stageOf(life.rules.stages, total),
    stagesSet: life.rules.stages.some((s) => s.min !== null),
    penalties,
    outings: outings.slice(0, 50),
    outingCount: outings.length,
    breachCount: outings.filter((o) => o.breach).length,
    absences: life.absences.filter((a) => a.stId === stId).sort((a, b) => b.date.localeCompare(a.date)),
    overnights: life.overnights
      .filter((o) => o.stId === stId)
      .sort((a, b) => b.from.localeCompare(a.from))
      .map((o) => ({ ...o, nights: nightsBetween(o.from, o.until) })),
    counseling: await counselingOf(counselingCtx(ctx), stId),
    lifeRequests: (await ctx.stores.lifeRequests.listByStudent(stId)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    trips: life.signups
      .filter((x) => x.stId === stId)
      .flatMap((x) => {
        const t = life.trips.find((tr) => tr.id === x.tripId);
        return t ? [{ ...x, trip: { id: t.id, title: t.title, place: t.place, start: t.start, end: t.end, status: t.status, nights: tripNights(t) } }] : [];
      })
      .sort((a, b) => b.trip.start.localeCompare(a.trip.start) || b.createdAt.localeCompare(a.createdAt)),
    departure: main ? ((await ctx.stores.departures.get(`dep-${main.trId}`)) as Departure | null) : null,
  };
}
export type StudentFile = NonNullable<Awaited<ReturnType<typeof studentFile>>>;

function noticeCtx(ctx: IntranetCtx): NoticeCtx {
  return {
    stores: ctx.stores,
    actor: ctx.actor ?? null,
    now: ctx.now,
    newId: ctx.newId,
    today: () => localDate(ctx.now().getTime()),
    campuses: () => [...new Set([...currentIndex(ctx.db).values()].map((s) => s.campus))].filter((c) => c && c !== '-').sort(),
  };
}

function counselingCtx(ctx: IntranetCtx): CounselingCtx {
  return {
    stores: { counseling: ctx.stores.counseling, audit: ctx.stores.audit, remote: ctx.stores.counselingRemote },
    actor: ctx.actor ?? null,
    now: ctx.now,
    newId: ctx.newId,
    today: () => localDate(ctx.now().getTime()),
    student: (stId) => {
      const cur = currentIndex(ctx.db).get(stId);
      if (cur) return { name: cur.name, campus: cur.campus };
      return ctx.db.studentDetail(stId) ? { name: studentRef(ctx.db, stId).name, campus: studentRef(ctx.db, stId).campus } : null;
    },
  };
}

async function summary(ctx: IntranetCtx) {
  await syncCurfewPenalties(ctx);
  const settings = await loadSettings(ctx);
  const now = ctx.now().getTime();
  const night = nightOf(now);
  const [outings, penalties, absences, overnights, permits, trips] = await Promise.all([
    ctx.stores.outings.all(),
    ctx.stores.penalties.all(),
    ctx.stores.absences.listAll(),
    ctx.stores.overnights.listAll(),
    permitsOf(ctx),
    ctx.stores.trips.listTrips(),
  ]);
  const today = localDate(now);
  return {
    night,
    curfew: settings.curfew,
    outNow: outings.filter((o) => o.inAt === null).length,
    breachTonight: outings.filter((o) => outingTimes(o).night === night && curfewBreach(o, settings.curfew, now, permits)).length,
    overnightTonight: permits.filter((o) => overnightFor([o], o.stId, night)).length,
    pending: penalties.filter((p) => p.status === 'pending').length,
    pendingAbsences: absences.filter((a) => a.status === 'pending').length,
    pendingOvernights: overnights.filter((o) => o.status === 'pending').length,
    lifePending: (await ctx.stores.lifeRequests.listAll()).filter((r) => r.status === 'received').length,
    tripsUpcoming: trips.filter((t) => t.status !== 'cancelled' && t.end >= today).length,
    tripsAccepting: trips.filter((t) => isAccepting(t, today)).length,
    current: currentIndex(ctx.db).size,
    ...(await followUpCounts(counselingCtx(ctx))),
    ...(await noticeSummary(noticeCtx(ctx))),
    ...(await listDepartures(ctx, new URLSearchParams()).then((d) => ({ departureMissing: d.counts.missing, ridePending: d.counts.ridePending }))),
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
        // actor: 배포에서는 로그인한 직원 이름(화면 오른쪽 위), 로컬은 화면이 입력한 이름. role·campus: 배포의 계정 종류(가드는 출입구)
        return ok({ source: m.source, refDate: m.refDate, actor: ctx.actor ?? null, role: ctx.session?.role ?? null, campus: ctx.session?.campus ?? null });
      }
      case 'GET /notices':
        return ok(await listNotices(noticeCtx(ctx), q));
      case 'POST /notices':
        return await createNotice(noticeCtx(ctx), input);
      case 'GET /counseling':
        return ok(await listCounseling(counselingCtx(ctx), q));
      case 'POST /counseling':
        return await createCounseling(counselingCtx(ctx), input);
      case 'GET /audit':
        return ok(await listAudit(counselingCtx(ctx), q));
      case 'GET /students':
        return ok(await studentFiles(ctx, q));
      case 'GET /summary':
        return ok(await summary(ctx));
      case 'GET /guard':
        return ok(await guardView(ctx, q));
      case 'POST /guard/scan':
        return await guardScan(ctx, input);
      case 'POST /guard/report':
        return await guardReport(ctx, input);
      case 'GET /departures':
        return ok(await listDepartures(ctx, q));
      case 'GET /reports':
        return ok(await listReports(ctx, q));
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
      case 'GET /requests/life':
        return ok(await listLifeRequests(ctx, q));
      case 'GET /trips':
        return ok(await listTrips(ctx, q));
      case 'POST /trips':
        return await saveTripRoute(ctx, null, input);
      case 'GET /settings':
        return ok(await loadSettings(ctx));
      case 'PUT /settings': {
        const s = validSettings(input);
        if (!s) return fail(400, 'invalid_settings');
        await ctx.stores.settings.set(s);
        return ok(s);
      }
    }
    const ts = p.match(/^\/trips\/signups\/([\w-]+)\/remove$/);
    if (ts && method === 'POST') return await removeSignupRoute(ctx, ts[1], input);
    const tr = p.match(/^\/trips\/([\w-]+)(\/status)?$/);
    if (tr && !tr[2] && method === 'GET') {
      const d = await tripDetail(ctx, tr[1]);
      return d ? ok(d) : fail(404, 'not_found');
    }
    if (tr && !tr[2] && method === 'PUT') return await saveTripRoute(ctx, tr[1], input);
    if (tr && tr[2] && method === 'POST') return await tripStatusRoute(ctx, tr[1], input);
    const lr = p.match(/^\/requests\/life\/([\w-]+)\/handle$/);
    if (lr && method === 'POST') return await handleLifeRequestRoute(ctx, lr[1], input);
    const rd = p.match(/^\/departures\/([\w-]+)\/ride$/);
    if (rd && method === 'POST') return await decideDepartureRide(ctx, rd[1], input);
    const nt = p.match(/^\/notices\/([\w-]+)$/);
    if (nt && method === 'GET') return await openNotice(noticeCtx(ctx), nt[1]);
    if (nt && method === 'PUT') return await updateNotice(noticeCtx(ctx), nt[1], input);
    const cn = p.match(/^\/counseling\/([\w-]+)(\/followup)?$/);
    if (cn && method === 'GET' && !cn[2]) return await openCounseling(counselingCtx(ctx), cn[1]);
    if (cn && method === 'PUT' && !cn[2]) return await updateCounseling(counselingCtx(ctx), cn[1], input);
    if (cn && method === 'POST' && cn[2]) return await setFollowUp(counselingCtx(ctx), cn[1], input);
    const sf = route.match(/^GET \/students\/(\w+)$/);
    if (sf) {
      const file = await studentFile(ctx, sf[1]);
      return file ? ok(file) : fail(404, 'not_found');
    }
    return fail(404, 'not_found');
  } catch (e) {
    // 배포 저장소의 오류(StoreError)는 Supabase 상태 코드를 그대로(예: 맡지 않은 캠퍼스의 상담 기록 → 400 campus_not_allowed)
    const status = (e as { status?: unknown }).status;
    return fail(typeof status === 'number' && status >= 400 && status < 600 ? status : 500, (e as Error).message);
  }
}
