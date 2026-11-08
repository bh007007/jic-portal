/**
 * 인트라넷 배포 서버(Workers)의 저장소: Supabase 테이블(supabase/migrations/20261108100000_student_intranet.sql)을
 * 로그인한 직원 토큰으로 읽고 쓴다(RLS). core 의 Stores 인터페이스를 그대로 따른다.
 * - 결석·외박 승인·반려는 decide_* 함수, 상담 기록은 counseling_* 함수(내용·접근 기록·캠퍼스 범위는 DB가 처리)로 한다.
 * - 처리자는 DB에 사용자 id 로 남기고, 화면에는 직원 이름(staff_directory())을 보인다.
 * 파일 의존 없음(fetch 만). 로컬 개발 서버는 .local-db 파일 저장소를 쓴다(localData.ts).
 */
import type { Departure, DepartureStore, Ride, RideStore } from '../../student/server/departures';
import { isOpen, type LifeRequestStore } from '../../student/server/lifeRequests';
import type { Absence, Overnight, RequestStore } from '../../student/server/requests';
import type { SupabaseConf } from '../../student/server/supabaseAuth';
import { hm, iso, restClient, StoreError, toAbsence, toDeparture, toLife, toOvernight, toRide, type Rest, type Row } from '../../student/server/supabaseStores';
import type { AuditLog, CounselingNote, CounselingRemote } from './counseling';
import type { DocRepo, Outing, Penalty, PenaltyRules, Repo, Settings, Stores } from './core';
import type { Notice, NoticeRead } from './notices';
import type { IncidentReport } from './reports';
import { serviceHeaders } from './supabaseData';

const q = encodeURIComponent;
const readOnly = () => {
  throw new StoreError(403, 'read_only');
};

/** 요청 하나 동안 직원 이름 목록을 한 번만 읽는다. */
function staffNames(rest: Rest) {
  let names: Promise<Map<string, string>> | null = null;
  return (id: unknown) => {
    names ??= rest<{ user_id: string; name: string }[]>('POST', 'rpc/staff_directory', {}).then((rows) => new Map(rows.map((r) => [r.user_id, r.name])));
    return names.then((m) => (id ? (m.get(String(id)) ?? '') : null));
  };
}
type Names = ReturnType<typeof staffNames>;

/** 한 행 읽기 → 있으면 고치고 없으면 넣기 */
async function upsert(rest: Rest, table: string, key: string, value: string, insert: Row, update: Row) {
  const found = await rest('GET', `${table}?select=${key}&${key}=eq.${q(value)}`);
  if (found.length) await rest('PATCH', `${table}?${key}=eq.${q(value)}`, update, 'return=minimal');
  else await rest('POST', table, insert, 'return=minimal');
}

// ── 결석·외박: 직원은 모두 읽고, 대기 → 승인·반려만 한다(decide_* 함수)
function requestStore<T extends Absence | Overnight>(rest: Rest, names: Names, table: string, decideFn: string, toItem: (r: Row) => T): RequestStore<T> {
  const withName = async (r: Row) => ({ ...toItem(r), decidedBy: await names(r.decided_by) });
  const get = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await rest('GET', `${table}?select=*&id=eq.${q(id)}`);
    return rows[0] ? await withName(rows[0]) : null;
  };
  return {
    listAll: async () => Promise.all((await rest('GET', `${table}?select=*&order=created_at.desc`)).map(withName)),
    listByStudent: async (stId) => Promise.all((await rest('GET', `${table}?select=*&student_no=eq.${q(stId)}&order=created_at.desc`)).map(withName)),
    get,
    async put(x) {
      const cur = await get(x.id);
      if (cur?.status === 'pending' && (x.status === 'approved' || x.status === 'rejected')) {
        await rest('POST', `rpc/${decideFn}`, { p_ids: [x.id], p_approve: x.status === 'approved', p_comment: x.comment });
        return;
      }
      throw new StoreError(409, 'unsupported_update');
    },
  };
}

// ── 귀국 항공편(학생이 씀, 직원은 읽기)·배차(직원이 씀)
function departureStore(rest: Rest): DepartureStore {
  return {
    listAll: async () => (await rest('GET', 'departure_flights?select=*')).map(toDeparture),
    get: async (id) => (await rest('GET', `departure_flights?select=*&enrollment_id=eq.${q(id.replace(/^dep-/, ''))}`)).map(toDeparture)[0] ?? null,
    put: readOnly,
  };
}
function rideStore(rest: Rest, names: Names, userId: string): RideStore {
  const withName = async (r: Row): Promise<Ride> => ({ ...toRide(r), decidedBy: (await names(r.decided_by)) ?? '' });
  return {
    listAll: async () => Promise.all((await rest('GET', 'airport_rides?select=*')).map(withName)),
    get: async (id) => {
      const rows = await rest('GET', `airport_rides?select=*&enrollment_id=eq.${q(id.replace(/^dep-/, ''))}`);
      return rows[0] ? withName(rows[0]) : null;
    },
    async put(x) {
      const fields = {
        student_no: x.stId,
        decision: x.decision,
        pickup_date: x.pickupDate,
        pickup_time: x.pickupTime,
        note: x.note,
        for_date: x.forDate,
        for_time: x.forTime,
        decided_by: userId, // 처리자는 로그인한 직원(RLS 도 본인만 허용)
        decided_at: x.decidedAt,
      };
      await upsert(rest, 'airport_rides', 'enrollment_id', x.trId, { enrollment_id: x.trId, ...fields }, fields);
    },
  };
}

// ── 외출·귀가(가드가 씀, 직원은 읽기)
const toOuting = (r: Row): Outing => ({
  id: String(r.id),
  stId: String(r.student_no),
  trId: String(r.enrollment_id ?? ''),
  campus: String(r.campus),
  outAt: iso(r.out_at),
  outBy: String(r.out_by ?? ''),
  inAt: iso(r.in_at),
  inBy: String(r.in_by ?? ''),
});
function outingStore(rest: Rest): Repo<Outing> {
  return {
    all: async () => (await rest('GET', 'outings?select=*&order=created_at.asc')).map(toOuting),
    async put(x) {
      // 새 기록은 넣고, 있던 기록은 귀가만 찍는다(가드 권한도 in_at, in_by 만)
      await upsert(
        rest,
        'outings',
        'id',
        x.id,
        { id: x.id, student_no: x.stId, enrollment_id: x.trId, campus: x.campus, out_at: x.outAt, out_by: x.outBy, in_at: x.inAt, in_by: x.inBy },
        { in_at: x.inAt, in_by: x.inBy },
      );
    },
    remove: readOnly,
  };
}

// ── 패널티: 직원이 통금 후보를 정리하고 승인·반려한다
function penaltyStore(rest: Rest, names: Names, userId: string): Repo<Penalty> {
  const toPenalty = async (r: Row): Promise<Penalty> => ({
    id: String(r.id),
    stId: String(r.student_no),
    kind: String(r.kind),
    date: String(r.occurred_on),
    campus: String(r.campus),
    basis: String(r.basis),
    source: r.source as Penalty['source'],
    sourceId: String(r.source_id),
    status: r.status as Penalty['status'],
    score: (r.score as number | null) ?? null,
    createdAt: iso(r.created_at)!,
    decidedAt: iso(r.decided_at),
    decidedBy: await names(r.decided_by),
    note: (r.note as string | null) ?? null,
  });
  return {
    all: async () => Promise.all((await rest('GET', 'penalties?select=*&order=created_at.asc')).map(toPenalty)),
    async put(x) {
      const rows = await rest('GET', `penalties?select=decided_at&id=eq.${q(x.id)}`);
      const fields: Row = { kind: x.kind, occurred_on: x.date, campus: x.campus, basis: x.basis, status: x.status, score: x.score, decided_at: x.decidedAt, note: x.note };
      // 처리자는 이번에 처리한 경우에만 로그인한 직원으로 바꾼다(이미 처리된 건은 그대로)
      const decidedNow = x.decidedAt && iso(rows[0]?.decided_at) !== iso(x.decidedAt);
      if (decidedNow) fields.decided_by = userId;
      if (!x.decidedAt) fields.decided_by = null;
      if (rows.length) await rest('PATCH', `penalties?id=eq.${q(x.id)}`, fields, 'return=minimal');
      else await rest('POST', 'penalties', { id: x.id, student_no: x.stId, source: x.source, source_id: x.sourceId, ...fields }, 'return=minimal');
    },
    async remove(id) {
      await rest('DELETE', `penalties?id=eq.${q(id)}`, undefined, 'return=minimal');
    },
  };
}

// ── 설정(통금·근무자)과 점수표
function settingsStore(rest: Rest, userId: string): DocRepo<Settings> {
  return {
    async get() {
      const r = (await rest('GET', 'intranet_settings?select=curfew,guards&id=eq.1'))[0];
      return r ? { curfew: hm(r.curfew)!, guards: (r.guards as string[] | null) ?? [] } : null;
    },
    async set(v) {
      await rest('PATCH', 'intranet_settings?id=eq.1', { curfew: v.curfew, guards: v.guards, updated_at: new Date().toISOString(), updated_by: userId }, 'return=minimal');
    },
  };
}
function rulesStore(rest: Rest): DocRepo<PenaltyRules> {
  return {
    async get() {
      const [kinds, stages] = await Promise.all([rest('GET', 'penalty_rules?select=*&order=sort.asc'), rest('GET', 'penalty_stages?select=*&order=stage.asc')]);
      if (!kinds.length || !stages.length) return null;
      return {
        kinds: kinds.map((k) => ({ code: String(k.code), name: String(k.name), score: (k.score as number | null) ?? null, approver: String(k.approver ?? '') })),
        stages: stages.map((s) => ({ name: String(s.name), min: (s.min_score as number | null) ?? null })),
      };
    },
    async set(v) {
      // 종류·단계는 고정(core 의 validRules)이고 점수·승인 권한·기준점만 바꾼다
      for (const k of v.kinds) await rest('PATCH', `penalty_rules?code=eq.${q(k.code)}`, { score: k.score, approver: k.approver }, 'return=minimal');
      for (let i = 0; i < v.stages.length; i++) await rest('PATCH', `penalty_stages?stage=eq.${i + 1}`, { min_score: v.stages[i].min }, 'return=minimal');
    },
  };
}

// ── 가드 리포트(가드가 씀, 직원은 읽기)
function reportStore(rest: Rest): Repo<IncidentReport> {
  return {
    all: async () =>
      (await rest('GET', 'incident_reports?select=*&order=created_at.asc')).map((r) => ({
        id: String(r.id),
        stId: String(r.student_no),
        trId: String(r.enrollment_id ?? ''),
        campus: String(r.campus),
        kind: r.kind as IncidentReport['kind'],
        note: String(r.note),
        occurredAt: iso(r.occurred_at)!,
        reportedBy: String(r.reported_by ?? ''),
        createdAt: iso(r.created_at)!,
      })),
    async put(x) {
      await rest('POST', 'incident_reports', { id: x.id, student_no: x.stId, enrollment_id: x.trId, campus: x.campus, kind: x.kind, note: x.note, occurred_at: x.occurredAt, reported_by: x.reportedBy }, 'return=minimal');
    },
    remove: readOnly,
  };
}

// ── 상담 기록: 목록(내용 없음, 맡은 캠퍼스만)과 접근 기록은 읽기, 나머지는 DB 함수
const toNote = (r: Row, content = ''): CounselingNote => ({
  id: String(r.id),
  stId: String(r.student_no),
  date: String(r.counsel_date),
  title: String(r.title),
  content,
  author: String(r.author_name),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  updatedBy: String(r.updated_by ?? ''),
  followUpDue: (r.follow_up_due as string | null) ?? null,
  followUpDone: r.follow_up_done === true,
  followUpDoneAt: iso(r.follow_up_done_at),
  followUpDoneBy: (r.follow_up_done_by as string | null) ?? null,
});
function counselingStores(rest: Rest): { counseling: Repo<CounselingNote>; audit: Repo<AuditLog>; counselingRemote: CounselingRemote } {
  return {
    counseling: { all: async () => (await rest('POST', 'rpc/counseling_list', {})).map((r) => toNote(r)), put: readOnly, remove: readOnly },
    audit: {
      all: async () =>
        (await rest('GET', 'audit_logs?select=*&order=id.asc')).map((r) => ({
          id: String(r.id),
          at: iso(r.at)!,
          actor: String(r.actor_name),
          action: r.action as AuditLog['action'],
          target: 'counseling' as const,
          targetId: String(r.target_id),
          stId: String(r.student_no),
        })),
      put: readOnly,
      remove: readOnly,
    },
    counselingRemote: {
      async open(id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
        try {
          const r = (await rest('POST', 'rpc/counseling_open', { p_id: id }))[0];
          return r ? toNote(r, String(r.content)) : null;
        } catch (e) {
          if (e instanceof StoreError && e.message === 'not_found') return null;
          throw e;
        }
      },
      create: async (v) =>
        rest<string>('POST', 'rpc/counseling_create', { p_student_no: v.stId, p_campus: v.campus, p_date: v.date, p_title: v.title, p_content: v.content, p_due: v.followUpDue }),
      async update(id, v) {
        await rest('POST', 'rpc/counseling_update', { p_id: id, p_date: v.date, p_title: v.title, p_content: v.content, p_due: v.followUpDue });
      },
      async followUp(id, done) {
        await rest('POST', 'rpc/counseling_followup', { p_id: id, p_done: done });
      },
    },
  };
}

// ── 내부 공지와 읽음
function noticeStores(rest: Rest): { notices: Repo<Notice>; noticeReads: Repo<NoticeRead> } {
  return {
    notices: {
      all: async () =>
        (await rest('GET', 'internal_notices?select=*&order=created_at.asc')).map((r) => ({
          id: String(r.id),
          title: String(r.title),
          content: String(r.content),
          campus: String(r.campus ?? ''),
          pinned: r.pinned === true,
          until: (r.until_date as string | null) ?? null,
          author: String(r.author_name),
          createdAt: iso(r.created_at)!,
          updatedAt: iso(r.updated_at)!,
          updatedBy: String(r.updated_by ?? ''),
        })),
      async put(x) {
        const fields = { title: x.title, content: x.content, campus: x.campus, pinned: x.pinned, until_date: x.until, updated_by: x.updatedBy };
        await upsert(rest, 'internal_notices', 'id', x.id, { id: x.id, author_name: x.author, ...fields }, { ...fields, updated_at: x.updatedAt });
      },
      remove: readOnly,
    },
    noticeReads: {
      all: async () =>
        (await rest('GET', 'internal_notice_reads?select=*')).map((r) => ({ id: `${r.notice_id}:${r.name}`, noticeId: String(r.notice_id), name: String(r.name), at: iso(r.read_at)! })),
      async put(x) {
        await rest('POST', 'internal_notice_reads', { notice_id: x.noticeId, name: x.name }, 'return=minimal'); // user_id 는 DB 기본값(본인)
      },
      remove: readOnly,
    },
  };
}

/**
 * 가드: 승인된 외박만(가드 화면의 '외박 허용 ~복귀일'과 통금 판정용). 가드 계정은 신청 테이블을 못 읽으므로 서비스 키로 읽고,
 * 사유·담당자 메모·처리자는 읽지 않는다. 쓰기는 없다.
 */
export function approvedOvernights(url: string, serviceKey: string, fetchFn: typeof fetch = fetch): RequestStore<Overnight> {
  const load = async () => {
    const r = await fetchFn(
      `${url.replace(/\/+$/, '')}/rest/v1/overnight_permissions?select=id,student_no,enrollment_id,leave_date,return_date,status,created_at,updated_at,decided_at&status=eq.approved`,
      { headers: serviceHeaders(serviceKey) },
    );
    if (!r.ok) throw new StoreError(r.status, `store_${r.status}`);
    return ((await r.json()) as Row[]).map((x) => toOvernight({ ...x, reason: '', staff_comment: null }));
  };
  return {
    listAll: load,
    listByStudent: async (stId) => (await load()).filter((o) => o.stId === stId),
    get: async (id) => (await load()).find((o) => o.id === id) ?? null,
    put: readOnly,
  };
}

// ── 생활 요청: 직원은 모두 읽고, 처리·답변은 handle_nonacademic_request 함수로(처리자는 DB 가 로그인한 직원으로 남김)
function lifeRequestStore(rest: Rest, names: Names): LifeRequestStore {
  const withName = async (r: Row) => ({ ...toLife(r), handledBy: await names(r.handled_by) });
  const get = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await rest('GET', `nonacademic_requests?select=*&id=eq.${q(id)}`);
    return rows[0] ? await withName(rows[0]) : null;
  };
  return {
    listAll: async () => Promise.all((await rest('GET', 'nonacademic_requests?select=*&order=created_at.desc')).map(withName)),
    listByStudent: async (stId) => Promise.all((await rest('GET', `nonacademic_requests?select=*&student_no=eq.${q(stId)}&order=created_at.desc`)).map(withName)),
    get,
    async put(x) {
      const cur = await get(x.id);
      if (cur && isOpen(cur.status) && (x.status === 'in_progress' || x.status === 'done' || x.status === 'rejected')) {
        await rest('POST', 'rpc/handle_nonacademic_request', { p_id: x.id, p_status: x.status, p_reply: x.reply });
        return;
      }
      throw new StoreError(409, 'unsupported_update');
    },
  };
}

/** 로그인한 직원(userId = 토큰의 사용자 id)의 토큰으로 core 의 Stores 를 만든다. 가드도 같은 저장소를 쓰고 RLS 가 출입구 범위를 막는다. */
export function supabaseStores(conf: SupabaseConf, token: string, userId: string, fetchFn: typeof fetch = fetch): Stores {
  const rest = restClient(conf, token, fetchFn);
  const names = staffNames(rest);
  return {
    outings: outingStore(rest),
    penalties: penaltyStore(rest, names, userId),
    settings: settingsStore(rest, userId),
    rules: rulesStore(rest),
    absences: requestStore<Absence>(rest, names, 'absence_requests', 'decide_absence_requests', toAbsence),
    overnights: requestStore<Overnight>(rest, names, 'overnight_permissions', 'decide_overnight_permissions', toOvernight),
    ...counselingStores(rest),
    ...noticeStores(rest),
    reports: reportStore(rest),
    departures: departureStore(rest),
    rides: rideStore(rest, names, userId),
    lifeRequests: lifeRequestStore(rest, names),
  };
}
export type { Departure };
