/**
 * 데이터 로직 공통 모듈. 파일·네트워크에 의존하지 않는다.
 * - 로컬 개발: server/localData.ts 가 data/tables/*.ndjson 을 읽어 넘긴다.
 * - 배포: 저장소 루트의 functions/api/[[path]].ts 가 Supabase(legacy_* 테이블)에서 읽어 넘긴다.
 * 화면(src/)은 어느 쪽이든 같은 /api/* 응답을 받는다.
 */
export type Raw = Record<string, any>;
export type Status = 'current' | 'upcoming' | 'graduated' | 'cancelled' | 'other';

export interface DataInput {
  meta: Raw;
  enrollments: Raw[];
  students: Raw[];
  invoices: Raw[];
  dorms: Raw[];
  agencies: Raw[];
  agents: Raw[];
  /** 업체 포털 입금액 매칭 원장(deposits). 배포 환경(Supabase)에는 아직 없어 비어 있을 수 있다. */
  deposits?: Raw[];
  /** 업체 포털 포인트 내역(point_history). type D = 충전, U = 사용(현지 비용 항목 ec_name), point = 페소. */
  pointHistory?: Raw[];
  /** 업체 포털 방관리(rooms, room_bed_v2). 방 하나에 beds 배열. 2026-11-08 기준 Premium만 등록되어 있다. */
  rooms?: Raw[];
}

/** 포인트 내역에서 화면에 쓰는 열. 원본 행에는 학생·에이전시 정보가 200여 열 붙어 있어 줄여서 싣는다. */
export const POINT_HISTORY_COLUMNS = ['tr_id', 'type', 'dt', 'point', 'php', 'ec_name', 'nickname', 'memo', 'campus'];

const CANCELLED = /캔슬|거절|취소|연기|홀드|요청/;

const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const campusName = (code?: unknown) => {
  const c = String(code ?? '').trim().toUpperCase();
  if (c === 'PREMIUM') return 'Premium';
  if (c === 'CHALLENGER') return 'Challenger';
  if (c === 'MCO') return 'MCO';
  return c ? String(code) : '-';
};

const yes = (v: unknown) => String(v ?? '').toUpperCase() === 'Y';
const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** 목록 페이지 나누기. all=1 이면 전체(엑셀 다운로드용). */
function paginate<T>(list: T[], q: URLSearchParams) {
  if (q.get('all') === '1') return { total: list.length, page: 1, pages: 1, size: list.length, rows: list };
  const size = Math.min(100, Math.max(10, Number(q.get('size')) || 20));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(pages, Math.max(1, Number(q.get('page')) || 1));
  return { total: list.length, page, pages, size, rows: list.slice((page - 1) * size, page * size) };
}

// 학생 상세 화면(StudentDetail.tsx)과 같은 이름을 쓴다.
const PICK_TYPES: Record<string, string> = { BESA: 'BESA 그룹', INDIVIDUAL: '개별 픽업', NO_PICKUP: '개인 이동' };
const pickLabel = (v: unknown) => PICK_TYPES[str(v).toUpperCase()] ?? (str(v) || '미입력');

// 연수의 courses·dorms 는 "이름(4w), 이름(8w)" 형식. 기숙사 이름 끝의 "(P)" 같은 한 글자 괄호는 캠퍼스 표시다.
const stripWeeks = (s: string) => s.replace(/\(\d+\s*w\)\s*$/i, '').trim();
const splitItems = (v: unknown) => [...new Set(str(v).split(/\s*,\s*/).map(stripWeeks).filter(Boolean))];
const nameKey = (s: string) => s.replace(/(\s*\([A-Z]\))+\s*$/, '').replace(/\s+/g, '').toLowerCase();

function maskEmail(v: unknown) {
  const s = String(v ?? '').trim();
  if (!s.includes('@')) return '';
  const [id, domain] = s.split('@');
  return id.slice(0, 2) + '***@' + domain;
}

function maskPhone(v: unknown) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? '***-****-' + digits.slice(-4) : '';
}

const MEMO_FIELDS: [string, string][] = [
  ['tr_ag_memo', '에이전시'],
  ['tr_br_memo', '아카데미'],
  ['tr_br_memo_en', '아카데미(EN)'],
  ['tr_st_memo', '학생'],
  ['tr_acct_memo', '회계'],
  ['tr_bank_memo', '은행'],
  ['tr_cancel_memo', '취소'],
  ['tr_cancel_train_memo', '연수 중 취소'],
  ['tr_postpone_memo', '연기'],
];

export function createDb(input: DataInput) {
  const { meta, enrollments, students, invoices, dorms, agencies, agents } = input;
  const deposits = (input.deposits ?? []).filter((d) => str(d.dp_use_yn).toUpperCase() !== 'N');

  const refDate: string = String(meta.extracted_at ?? new Date().toISOString()).slice(0, 10);
  const soonUntil = addDays(refDate, 14);

  const statusOf = (e: Raw): Status => {
    const state = String(e.tr_state_name ?? '');
    if (CANCELLED.test(state)) return 'cancelled';
    const s = e.tr_start_date, f = e.tr_finish_date;
    if (!s || !f) return 'other';
    if (s > refDate) return 'upcoming';
    if (state === '퇴교') return 'other';
    return f < refDate ? 'graduated' : 'current';
  };

  const toRow = (e: Raw) => {
    const status = statusOf(e);
    const note =
      status === 'current' && e.tr_finish_date <= soonUntil ? '졸업임박' :
      status === 'upcoming' && !e.tr_pick_type ? '픽업 미입력' : '';
    return {
      trId: String(e.tr_id),
      stId: String(e.tr_st_id),
      name: String(e.st_name || [e.st_last_name, e.st_first_name].filter(Boolean).join(' ')),
      nation: String(e.st_country_name || e.tr_st_country_name || ''),
      gender: String(e.st_gender_name || ''),
      campus: campusName(e.first_co_ca_code),
      course: String(e.courses || ''),
      dorm: String(e.dorms || ''),
      start: String(e.tr_start_date || ''),
      end: String(e.tr_finish_date || ''),
      weeks: num(e.tr_total_week),
      agency: String(e.ag_name || ''),
      branch: String(e.am_branch || ''),
      pay: String(e.tr_deposit_name || ''),
      batch: String(e.sd_name || ''),
      state: String(e.tr_state_name || ''),
      status,
      note,
    };
  };
  type Row = ReturnType<typeof toRow>;

  const all = enrollments.map((raw) => ({ raw, row: toRow(raw) }));
  const byTr = new Map(all.map((x) => [x.row.trId, x]));
  const invoiceByTr = new Map(invoices.map((i) => [String(i.tr_id), i]));
  const dormByTr = new Map(dorms.map((d) => [String(d.tr_id), d]));
  const studentById = new Map(students.map((s) => [String(s.st_id), s]));

  // 포인트: 원장(point_history)이 있으면 원장 합계를 쓴다. D = 충전(항목명 없음), U = 현지 비용 사용(관리비·세탁비·SSP·비자 등).
  // 원장이 없으면(배포에 아직 안 올린 경우) 인보이스의 sum_pd_point / sum_pu_point 를 쓴다. 추출본에서는 이 값이 대부분 0이다.
  const hasLedger = (input.pointHistory?.length ?? 0) > 0;
  const ledgerByTr = new Map<string, { in: number; out: number; items: Raw[] }>();
  for (const p of input.pointHistory ?? []) {
    const k = str(p.tr_id);
    const l = ledgerByTr.get(k) ?? { in: 0, out: 0, items: [] };
    if (str(p.type).toUpperCase() === 'D') l.in += num(p.point);
    else l.out += num(p.point);
    l.items.push(p);
    ledgerByTr.set(k, l);
  }
  const pointsOf = (trId: string, inv?: Raw) => {
    if (!hasLedger) return { pointIn: num(inv?.sum_pd_point), pointOut: num(inv?.sum_pu_point) };
    const l = ledgerByTr.get(trId);
    return { pointIn: l?.in ?? 0, pointOut: l?.out ?? 0 };
  };
  const pointItems = (trId: string) =>
    (ledgerByTr.get(trId)?.items ?? [])
      .map((p) => ({
        dt: str(p.dt).slice(0, 16),
        kind: str(p.type).toUpperCase() === 'D' ? '충전' : '사용',
        item: str(p.ec_name),
        amount: num(p.point),
        staff: str(p.nickname),
        memo: str(p.memo),
      }))
      .sort((a, b) => a.dt.localeCompare(b.dt));

  const memoText = (e: Raw) => MEMO_FIELDS.map(([k]) => e[k]).filter(Boolean).join(' ');

  // 상태 탭별 기본 정렬: 재학은 졸업일, 입학 예정은 입학일 빠른 순, 졸업·전체는 최근 순.
  type Dated = { start: string; end: string; name: string };
  const TAB_SORT: Record<string, (a: Dated, b: Dated) => number> = {
    current: (a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name),
    upcoming: (a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name),
    graduated: (a, b) => b.end.localeCompare(a.end),
    all: (a, b) => b.start.localeCompare(a.start),
  };

  function dashboard() {
    const cur = all.filter((x) => x.row.status === 'current');
    const up = all.filter((x) => x.row.status === 'upcoming');

    const batchMap = new Map<string, { batch: string; date: string; count: number }>();
    for (const x of up) {
      // 배치 날짜는 업체 포털 표기와 같은 입국일(sd_departure_date, 일요일)을 쓴다.
      const date = String(x.raw.sd_departure_date || x.raw.sd_start_date || x.row.start);
      if (date <= refDate) continue;
      const key = x.row.batch || date;
      const b = batchMap.get(key) ?? { batch: x.row.batch, date, count: 0 };
      b.count++;
      batchMap.set(key, b);
    }
    const batches = [...batchMap.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const nextKeys = new Set(batches.slice(0, 2).map((b) => b.batch));
    const near = up.filter((x) => nextKeys.has(x.row.batch));
    const graduating = cur.filter((x) => x.row.end <= soonUntil);
    const nations = countBy(cur, (x) => x.row.nation || '미상');

    return {
      refDate,
      current: { total: cur.length, byCampus: countBy(cur, (x) => x.row.campus) },
      batches,
      graduating: {
        total: graduating.length,
        until: soonUntil,
        notCleared: graduating.filter((x) => !yes(x.raw.tr_room_clear_yn) || !yes(x.raw.tr_point_clear_yn)).length,
      },
      pickup: {
        batches: batches.slice(0, 2),
        arrivals: near.length,
        missing: near.filter((x) => !x.raw.tr_pick_type).length,
        besa: near.filter((x) => String(x.raw.tr_pick_type).toUpperCase() === 'BESA').length,
      },
      nations: [...nations.slice(0, 6), ...(nations.length > 6 ? [{ name: '기타', count: nations.slice(6).reduce((s, n) => s + n.count, 0) }] : [])],
      agencies: agencies.length,
      agents: agents.length,
      sync: { extractedAt: meta.extracted_at, counts: meta.counts ?? {} },
    };
  }

  function listEnrollments(q: URLSearchParams) {
    const tab = q.get('tab') || 'current';
    const tabCounts = {
      current: all.filter((x) => x.row.status === 'current').length,
      upcoming: all.filter((x) => x.row.status === 'upcoming').length,
      graduated: all.filter((x) => x.row.status === 'graduated').length,
      all: all.length,
    };
    let list: Row[] = all.map((x) => x.row);
    if (tab !== 'all') list = list.filter((r) => r.status === tab);
    const facets = {
      nations: countBy(list, (r) => r.nation || '미상').map((n) => n.name),
      batches: [...new Set(list.map((r) => r.batch).filter(Boolean))].sort().reverse().slice(0, 40),
      campuses: countBy(list, (r) => r.campus).map((c) => c.name),
    };

    const campus = q.get('campus');
    const nation = q.get('nation');
    const pay = q.get('pay');
    const batch = q.get('batch');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    const field = q.get('field') ?? 'name';
    if (campus) list = list.filter((r) => r.campus === campus);
    if (nation) list = list.filter((r) => r.nation === nation);
    if (pay) list = list.filter((r) => r.pay === pay);
    if (batch) list = list.filter((r) => r.batch === batch);
    if (kw) {
      list = list.filter((r) => {
        const hay =
          field === 'no' ? r.stId :
          field === 'agency' ? `${r.agency} ${r.branch}` :
          field === 'memo' ? memoText(byTr.get(r.trId)!.raw) : r.name;
        return hay.toLowerCase().includes(kw);
      });
    }

    list = [...list].sort(TAB_SORT[tab] ?? TAB_SORT.all);
    return { refDate, tab, tabCounts, facets, ...paginate(list, q) };
  }

  function studentDetail(stId: string) {
    const s = studentById.get(stId);
    const ens = all.filter((x) => x.row.stId === stId).sort((a, b) => b.row.start.localeCompare(a.row.start));
    if (!s && ens.length === 0) return null;
    const src = s ?? ens[0].raw;
    const birthday = String(src.st_birthday || '');
    const age = birthday.length >= 10 ? Math.floor((Date.parse(refDate) - Date.parse(birthday)) / (365.25 * 864e5)) : null;

    return {
      refDate,
      student: {
        stId,
        name: String(src.st_name || ''),
        lastName: String(src.st_last_name || ''),
        firstName: String(src.st_first_name || ''),
        birthday,
        age,
        gender: String(src.st_gender_name || (src.st_gender === 'F' ? '여' : src.st_gender === 'M' ? '남' : '')),
        nation: String(src.st_country_cd_name || src.st_country_name || ''),
        email: maskEmail(src.st_email),
        cell: maskPhone(src.st_cell),
        lang: String(src.st_lang_name || ''),
        vip: String(src.st_vip_level || ''),
      },
      enrollments: ens.map(({ raw, row }) => {
        const inv = invoiceByTr.get(row.trId);
        const dorm = dormByTr.get(row.trId);
        // sum_id_amount = 입금 매칭(id_amount) 합계. 인보이스 총액은 추출본에 없어 넣지 않는다.
        const paid = num(inv?.sum_id_amount);
        const { pointIn: pIn, pointOut: pOut } = pointsOf(row.trId, inv);
        return {
          ...row,
          pickType: String(raw.tr_pick_type || ''),
          pickPlace: String(raw.tr_pick_place || ''),
          roomClear: yes(raw.tr_room_clear_yn),
          pointClear: yes(raw.tr_point_clear_yn),
          invoice: inv ? { currency: String(inv.tr_currency || ''), paid, pointIn: pIn, pointOut: pOut, pointBalance: pIn - pOut } : null,
          dormStay: dorm ? { type: String(dorm.do_name || ''), campus: String(dorm.ca_name || campusName(dorm.ca_code)), from: String(dorm.ic_departure_date || ''), to: String(dorm.ic_return_date || ''), weeks: num(dorm.ic_week) } : null,
          memos: MEMO_FIELDS.filter(([k]) => raw[k]).map(([k, kind]) => ({ kind, text: String(raw[k]) })),
          points: pointItems(row.trId),
        };
      }),
    };
  }

  function dormOverview(q: URLSearchParams) {
    const campus = q.get('campus') || '';
    const items = dorms
      .map((d) => ({ d, x: byTr.get(String(d.tr_id)) }))
      .filter(({ d, x }) => x && x.row.status !== 'cancelled' && String(d.ic_cancel_yn).toUpperCase() !== 'Y')
      .map(({ d, x }) => ({
        trId: x!.row.trId,
        stId: x!.row.stId,
        name: x!.row.name,
        nation: x!.row.nation,
        gender: x!.row.gender,
        campus: String(d.ca_name || campusName(d.ca_code)),
        type: String(d.do_name || '-'),
        from: String(d.ic_departure_date || x!.row.start),
        to: String(d.ic_return_date || x!.row.end),
      }));
    const campuses = countBy(items, (i) => i.campus).map((c) => c.name);
    const scoped = campus ? items.filter((i) => i.campus === campus) : items;
    const staying = scoped.filter((i) => i.from <= refDate && i.to >= refDate);
    const arriving = scoped.filter((i) => i.from > refDate && i.from <= soonUntil).sort((a, b) => a.from.localeCompare(b.from));
    const leaving = staying.filter((i) => i.to <= soonUntil).sort((a, b) => a.to.localeCompare(b.to));

    const typeNames = [...new Set([...staying, ...arriving].map((i) => i.type))].sort();
    const types = typeNames.map((type) => ({
      type,
      staying: staying.filter((i) => i.type === type).length,
      female: staying.filter((i) => i.type === type && i.gender === '여').length,
      male: staying.filter((i) => i.type === type && i.gender === '남').length,
      arriving: arriving.filter((i) => i.type === type).length,
      leaving: leaving.filter((i) => i.type === type).length,
    })).sort((a, b) => b.staying - a.staying);

    return { refDate, until: soonUntil, campus, campuses, totals: { staying: staying.length, arriving: arriving.length, leaving: leaving.length }, types, arriving, leaving };
  }

  // ── 에이전시·담당자: 연수의 ag_id(에이전시)와 tr_am_id(담당자)로 묶는다. 계좌 정보는 내보내지 않는다.
  const agencyById = new Map(agencies.map((a) => [str(a.ag_id), a]));
  const agentsByAgency = new Map<string, Raw[]>();
  for (const m of agents) {
    const k = str(m.am_ag_id);
    if (!agentsByAgency.has(k)) agentsByAgency.set(k, []);
    agentsByAgency.get(k)!.push(m);
  }
  type Stats = { current: number; upcoming: number; total: number; lastStart: string };
  const agencyStats = new Map<string, Stats>();
  const agentStats = new Map<string, Stats>();
  const agencyIdOf = (e: Raw) => str(e.ag_id ?? e.am_ag_id);
  const bump = (m: Map<string, Stats>, key: string, row: Row) => {
    if (!key || row.status === 'cancelled') return;
    const s = m.get(key) ?? { current: 0, upcoming: 0, total: 0, lastStart: '' };
    s.total++;
    if (row.status === 'current') s.current++;
    if (row.status === 'upcoming') s.upcoming++;
    if (row.start <= refDate && row.start > s.lastStart) s.lastStart = row.start;
    m.set(key, s);
  };
  for (const x of all) {
    bump(agencyStats, agencyIdOf(x.raw), x.row);
    bump(agentStats, str(x.raw.tr_am_id), x.row);
  }
  const noStats: Stats = { current: 0, upcoming: 0, total: 0, lastStart: '' };
  const countryOf = (a: Raw) => str(a.ag_country_cd_name) || str(a.ag_country) || '-';

  const agencyRow = (a: Raw) => {
    const agId = str(a.ag_id);
    return {
      agId,
      name: str(a.ag_name),
      nameEn: str(a.ag_name_en),
      country: countryOf(a),
      demo: yes(a.ag_demo_yn),
      agents: (agentsByAgency.get(agId) ?? []).filter((m) => yes(m.am_use_yn)).length,
      registered: str(a.ag_insert_dt).slice(0, 10),
      ...(agencyStats.get(agId) ?? noStats),
    };
  };
  type AgencyRow = ReturnType<typeof agencyRow>;

  const agentRow = (m: Raw) => {
    const ag = agencyById.get(str(m.am_ag_id));
    return {
      amId: str(m.am_id),
      agId: str(m.am_ag_id),
      agency: str(ag?.ag_name),
      country: ag ? countryOf(ag) : '-',
      name: str(m.am_name),
      branch: str(m.am_branch),
      loginId: str(m.am_loginid),
      lang: str(m.am_lang_name),
      main: yes(m.am_main_yn),
      active: yes(m.am_use_yn),
      invoice: yes(m.am_invoice_yn),
      email: maskEmail(m.am_email),
      ...(agentStats.get(str(m.am_id)) ?? noStats),
    };
  };
  type AgentRow = ReturnType<typeof agentRow>;

  function listAgencies(q: URLSearchParams) {
    let list = agencies.map(agencyRow);
    const facets = { countries: countBy(list, (r) => r.country).map((c) => c.name) };
    const country = q.get('country');
    const active = q.get('active');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    if (country) list = list.filter((r) => r.country === country);
    if (active === 'current') list = list.filter((r) => r.current > 0);
    if (active === 'upcoming') list = list.filter((r) => r.upcoming > 0);
    if (active === 'none') list = list.filter((r) => r.total === 0);
    if (kw) list = list.filter((r) => `${r.name} ${r.nameEn}`.toLowerCase().includes(kw));
    list.sort((a, b) => b.current - a.current || b.upcoming - a.upcoming || b.total - a.total || a.name.localeCompare(b.name));
    const totals = { agencies: agencies.length, withCurrent: [...agencyStats.values()].filter((s) => s.current > 0).length };
    return { refDate, facets, totals, ...paginate<AgencyRow>(list, q) };
  }

  function agencyDetail(agId: string) {
    const a = agencyById.get(agId);
    if (!a) return null;
    const ens = all.filter((x) => agencyIdOf(x.raw) === agId);
    const live = ens.filter((x) => x.row.status !== 'cancelled');
    const byYear = countBy(live, (x) => x.row.start.slice(0, 4) || '-').sort((p, q2) => q2.name.localeCompare(p.name));
    return {
      refDate,
      agency: {
        ...agencyRow(a),
        ceo: str(a.ag_ceo_name),
        tel: str(a.ag_tel),
        email: str(a.ag_email),
        homepage: str(a.ag_homepage),
        address: str(a.ag_addr),
        memo: str(a.ag_memo),
      },
      agents: (agentsByAgency.get(agId) ?? []).map(agentRow).sort((p, q2) => Number(q2.main) - Number(p.main) || Number(q2.active) - Number(p.active) || p.name.localeCompare(q2.name)),
      current: live.filter((x) => x.row.status === 'current').map((x) => x.row).sort((p, q2) => p.end.localeCompare(q2.end)),
      upcoming: live.filter((x) => x.row.status === 'upcoming').map((x) => x.row).sort((p, q2) => p.start.localeCompare(q2.start)),
      byYear,
    };
  }

  function listAgents(q: URLSearchParams) {
    let list = agents.map(agentRow);
    const facets = { countries: countBy(list, (r) => r.country).map((c) => c.name) };
    const country = q.get('country');
    const active = q.get('active');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    const field = q.get('field') ?? 'name';
    if (country) list = list.filter((r) => r.country === country);
    if (active === 'Y') list = list.filter((r) => r.active);
    if (active === 'N') list = list.filter((r) => !r.active);
    if (kw) {
      list = list.filter((r) => (field === 'login' ? r.loginId : field === 'agency' ? r.agency : `${r.name} ${r.branch}`).toLowerCase().includes(kw));
    }
    list.sort((a, b) => a.agency.localeCompare(b.agency) || Number(b.main) - Number(a.main) || a.name.localeCompare(b.name));
    return { refDate, facets, ...paginate<AgentRow>(list, q) };
  }

  // ── 입학 배치별 명단: 배치(sd_name) 하나의 학생과 픽업 정보.
  function arrivals(q: URLSearchParams) {
    const live = all.filter((x) => x.row.status !== 'cancelled' && x.row.batch);
    const batchMap = new Map<string, { batch: string; date: string; count: number }>();
    for (const x of live) {
      const date = str(x.raw.sd_departure_date || x.raw.sd_start_date || x.row.start);
      const b = batchMap.get(x.row.batch) ?? { batch: x.row.batch, date, count: 0 };
      b.count++;
      batchMap.set(x.row.batch, b);
    }
    const from = addDays(refDate, -56);
    const batches = [...batchMap.values()].filter((b) => b.date >= from).sort((a, b) => a.date.localeCompare(b.date));
    const next = batches.find((b) => b.date > refDate) ?? batches[batches.length - 1];
    const batch = q.get('batch') || next?.batch || '';
    const info = batchMap.get(batch);
    const rows = live
      .filter((x) => x.row.batch === batch)
      .map(({ raw, row }) => ({
        ...row,
        pickType: pickLabel(raw.tr_pick_type),
        place: str(raw.tr_pick_place),
        terminal: str(raw.tr_pick_terminal),
        airline: str(raw.tr_pick_flight),
        flight: str(raw.tr_pick_flight_num),
        arrival: str(raw.tr_pick_flight_arrival).slice(0, 16),
        remark: str(raw.tr_pick_remark),
      }))
      .sort((a, b) => (a.arrival || '9').localeCompare(b.arrival || '9') || a.name.localeCompare(b.name));
    return {
      refDate,
      batch,
      date: info?.date ?? '',
      batches,
      total: rows.length,
      byType: countBy(rows, (r) => r.pickType),
      byPlace: countBy(rows.filter((r) => r.place), (r) => r.place),
      rows,
    };
  }

  // ── 회계: 연수별 인보이스 요약.
  // sum_ic_price = 해외 인보이스 총액(인보이스 항목 합계), sum_id_amount = 입금 매칭 합계.
  //   추출본 확인(11/8): 완납(FULL)의 91%가 입금 = 총액, 미납(NONE)은 모두 입금 < 총액. 업체 화면도 이 차이로 잔액을 본다.
  //   미입금 = 총액 − 입금 매칭이며 미납·부분납에만 계산한다(완납은 업체 판정대로 0).
  // sum_tc_price / sum_td_amount = 현지 인보이스 청구 / 현지 납부(통화 열이 없고 금액 크기로 보아 페소). 화면 표에는 넣지 않고 엑셀에만.
  // 포인트 충전·사용은 pointsOf(포인트 원장 우선, 없으면 sum_pd_point/sum_pu_point).
  const PAY_NAMES = ['미납', '부분납', '완납'];
  const nationOf = (r: { nation: string }) => r.nation || '미상';
  const invAll = all.map(({ raw, row }) => {
    const inv = invoiceByTr.get(row.trId);
    const { pointIn, pointOut } = pointsOf(row.trId, inv);
    const total = num(inv?.sum_ic_price);
    const paid = num(inv?.sum_id_amount);
    return {
      ...row,
      agId: agencyIdOf(raw),
      currency: str(inv?.tr_currency || raw.tr_currency),
      hasInvoice: !!inv,
      total,
      paid,
      // 입금 매칭이 음수(환불)인 행이 있어 총액을 넘지 않게 한다.
      remaining: row.pay !== '완납' && total > paid ? Math.min(total, total - paid) : 0,
      localBilled: num(inv?.sum_tc_price),
      localPaid: num(inv?.sum_td_amount),
      pointIn,
      pointOut,
      pointBalance: pointIn - pointOut,
      dueDate: str(raw.tr_deposit_due_date).slice(0, 10),
      pointClear: yes(raw.tr_point_clear_yn),
      roomClear: yes(raw.tr_room_clear_yn),
    };
  });
  type InvoiceRow = (typeof invAll)[number];

  const statusCounts = (list: { status: Status }[]) => ({
    current: list.filter((r) => r.status === 'current').length,
    upcoming: list.filter((r) => r.status === 'upcoming').length,
    graduated: list.filter((r) => r.status === 'graduated').length,
    all: list.length,
  });

  const agencyFacet = (list: InvoiceRow[]) => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const r of list) {
      if (!r.agId) continue;
      const a = m.get(r.agId) ?? { id: r.agId, name: r.agency || r.agId, count: 0 };
      a.count++;
      m.set(r.agId, a);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  };

  const sumByCurrency = <T>(list: T[], currencyOf: (t: T) => string, amountOf: (t: T) => number) => {
    const m = new Map<string, number>();
    for (const t of list) {
      const v = amountOf(t);
      if (!v) continue;
      const c = currencyOf(t) || '-';
      m.set(c, (m.get(c) ?? 0) + v);
    }
    return [...m.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency));
  };

  /** 이름·학생번호 검색(field=name|no). */
  const byKeyword = <T extends { name: string; stId: string }>(list: T[], q: URLSearchParams) => {
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    if (!kw) return list;
    const field = q.get('field') ?? 'name';
    return list.filter((r) => (field === 'no' ? r.stId : r.name).toLowerCase().includes(kw));
  };

  function listInvoices(q: URLSearchParams) {
    const tab = q.get('tab') || 'current';
    let list = tab === 'all' ? invAll : invAll.filter((r) => r.status === tab);
    const facets = {
      campuses: countBy(list, (r) => r.campus).map((c) => c.name),
      nations: countBy(list, nationOf).map((n) => n.name),
      currencies: countBy(list.filter((r) => r.currency), (r) => r.currency).map((c) => c.name),
      agencies: agencyFacet(list),
    };
    const campus = q.get('campus'), nation = q.get('nation'), pay = q.get('pay'), currency = q.get('currency'), agency = q.get('agency');
    if (campus) list = list.filter((r) => r.campus === campus);
    if (nation) list = list.filter((r) => nationOf(r) === nation);
    if (pay) list = list.filter((r) => r.pay === pay);
    if (currency) list = list.filter((r) => r.currency === currency);
    if (agency) list = list.filter((r) => r.agId === agency);
    list = [...byKeyword(list, q)].sort(TAB_SORT[tab] ?? TAB_SORT.all);
    const totals = {
      byPay: PAY_NAMES.map((name) => ({ name, count: list.filter((r) => r.pay === name).length })),
      totalByCurrency: sumByCurrency(list, (r) => r.currency, (r) => r.total),
      paidByCurrency: sumByCurrency(list, (r) => r.currency, (r) => r.paid),
      remainingByCurrency: sumByCurrency(list, (r) => r.currency, (r) => r.remaining),
    };
    return { refDate, tab, tabCounts: statusCounts(invAll), facets, totals, ...paginate<InvoiceRow>(list, q) };
  }

  /** 미납·부분납 연수. 입학일 기준 정렬(sort=asc|desc). 취소된 연수는 뺀다. */
  const unpaidAll = invAll.filter((r) => r.status !== 'cancelled' && (r.pay === '미납' || r.pay === '부분납'));
  function listUnpaid(q: URLSearchParams) {
    const scope = q.get('scope') || 'upcoming';
    let list = scope === 'all' ? unpaidAll : unpaidAll.filter((r) => r.status === scope);
    const facets = {
      campuses: countBy(list, (r) => r.campus).map((c) => c.name),
      currencies: countBy(list.filter((r) => r.currency), (r) => r.currency).map((c) => c.name),
      agencies: agencyFacet(list),
    };
    const campus = q.get('campus'), pay = q.get('pay'), currency = q.get('currency'), agency = q.get('agency');
    if (campus) list = list.filter((r) => r.campus === campus);
    if (pay) list = list.filter((r) => r.pay === pay);
    if (currency) list = list.filter((r) => r.currency === currency);
    if (agency) list = list.filter((r) => r.agId === agency);
    const dir = q.get('sort') === 'desc' ? -1 : 1;
    list = [...byKeyword(list, q)].sort((a, b) => dir * a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    const totals = {
      byPay: PAY_NAMES.slice(0, 2).map((name) => ({ name, count: list.filter((r) => r.pay === name).length })),
      overdue: list.filter((r) => r.dueDate && r.dueDate < refDate).length,
      paidByCurrency: sumByCurrency(list, (r) => r.currency, (r) => r.paid),
      remainingByCurrency: sumByCurrency(list, (r) => r.currency, (r) => r.remaining),
    };
    return { refDate, scope, scopeCounts: statusCounts(unpaidAll), views: viewCounts(), facets, totals, ...paginate<InvoiceRow>(list, q) };
  }

  // ── 입금 원장(업체 포털 입금액 매칭). 받는 계좌(bk_*) 정보는 내보내지 않는다.
  const depositAll = deposits
    .map((d) => ({
      dpId: str(d.dp_id),
      date: str(d.dp_deposit_dt).slice(0, 10),
      name: str(d.dp_name),
      agency: str(d.match_ag_name),
      currency: str(d.dp_currency),
      amount: num(d.dp_amount),
      fee: num(d.dp_fee),
      total: num(d.dp_amount_total),
      matches: num(d.cnt),
      matched: num(d.sum_id_amount),
      matchedCurrency: str(d.id_currency),
      balance: num(d.balance),
      confirmed: yes(d.dp_confirm_yn),
      memo: str(d.dp_memo),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.dpId.localeCompare(a.dpId, undefined, { numeric: true }));
  type DepositRow = (typeof depositAll)[number];
  const matchState = (d: DepositRow) => (d.matches === 0 ? 'none' : d.balance !== 0 ? 'open' : 'done');

  function listDeposits(q: URLSearchParams) {
    let list = depositAll;
    const facets = { currencies: countBy(list.filter((d) => d.currency), (d) => d.currency).map((c) => c.name) };
    const from = q.get('from'), to = q.get('to'), currency = q.get('currency'), match = q.get('match'), confirm = q.get('confirm');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    if (from) list = list.filter((d) => d.date >= from);
    if (to) list = list.filter((d) => d.date <= to);
    if (currency) list = list.filter((d) => d.currency === currency);
    if (match) list = list.filter((d) => matchState(d) === match);
    if (confirm) list = list.filter((d) => d.confirmed === (confirm === 'Y'));
    if (kw) list = list.filter((d) => (q.get('field') === 'agency' ? d.agency : d.name).toLowerCase().includes(kw));
    const totals = {
      none: list.filter((d) => matchState(d) === 'none').length,
      open: list.filter((d) => matchState(d) === 'open').length,
      done: list.filter((d) => matchState(d) === 'done').length,
      amountByCurrency: sumByCurrency(list, (d) => d.currency, (d) => d.amount),
    };
    return { refDate, available: depositAll.length > 0, views: viewCounts(), facets, totals, ...paginate<DepositRow>(list, q) };
  }
  /** 입금 매칭 화면의 두 탭 건수. */
  const viewCounts = () => ({ unpaid: unpaidAll.length, ledger: depositAll.length });

  // ── 포인트: 재학생 잔액(view=balance), 졸업 예정자 정산(view=clear).
  const WITHIN = [7, 14, 28, 56];
  function points(q: URLSearchParams) {
    const v = q.get('view');
    const view = v === 'clear' || v === 'leftover' ? v : 'balance';
    const within = WITHIN.includes(Number(q.get('within'))) ? Number(q.get('within')) : 14;
    const until = addDays(refDate, within);
    const clear = q.get('clear') || 'N';
    const current = invAll.filter((r) => r.status === 'current');
    const graduating = current.filter((r) => r.end <= until);
    const pending = graduating.filter((r) => !r.pointClear);

    // 잔액 남은 졸업생: 업체 포털은 현지 비용을 졸업 때 정산 기록한다. 충전이 사용보다 많으면 환불·정산 확인 대상이다.
    const leftover = invAll.filter((r) => r.status === 'graduated' && r.pointBalance > 0);
    let list = view === 'clear' ? (clear === 'N' ? pending : graduating) : view === 'leftover' ? leftover : current;
    const facets = { campuses: countBy(list, (r) => r.campus).map((c) => c.name), nations: countBy(list, nationOf).map((n) => n.name) };
    const campus = q.get('campus'), nation = q.get('nation'), has = q.get('has');
    if (campus) list = list.filter((r) => r.campus === campus);
    if (nation) list = list.filter((r) => nationOf(r) === nation);
    if (has === 'Y') list = list.filter((r) => r.pointBalance > 0);
    if (has === 'N') list = list.filter((r) => r.pointBalance <= 0);
    list = [...byKeyword(list, q)].sort(
      view === 'clear'
        ? (a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name)
        : view === 'leftover'
          ? (a, b) => b.end.localeCompare(a.end) || a.name.localeCompare(b.name)
          : (a, b) => b.pointBalance - a.pointBalance || a.end.localeCompare(b.end) || a.name.localeCompare(b.name),
    );
    const totals = {
      withBalance: list.filter((r) => r.pointBalance > 0).length,
      pointIn: list.reduce((s, r) => s + r.pointIn, 0),
      pointOut: list.reduce((s, r) => s + r.pointOut, 0),
      notCleared: list.filter((r) => !r.pointClear).length,
    };
    return { refDate, view, within, until, tabCounts: { balance: current.length, clear: pending.length, leftover: leftover.length }, facets, totals, ...paginate<InvoiceRow>(list, q) };
  }

  // ── 기초관리: 코스·기숙사 목록. 연수의 courses·dorms 문자열과 기숙사 배정(do_name)을 캠퍼스별로 묶는다.
  type CodeAcc = { campus: string; name: string; students: Set<string>; current: Set<string>; upcoming: Set<string>; staying: Set<string>; assigned: number; lastStart: string };
  const codeCache = new Map<string, ReturnType<typeof buildCodes>>();
  function buildCodes(kind: 'course' | 'dorm') {
    const m = new Map<string, CodeAcc>();
    const acc = (campus: string, name: string) => {
      const key = campus + '|' + nameKey(name);
      let a = m.get(key);
      if (!a) m.set(key, (a = { campus, name, students: new Set(), current: new Set(), upcoming: new Set(), staying: new Set(), assigned: 0, lastStart: '' }));
      return a;
    };
    // 기숙사가 여러 개인 연수는 first_do_ca_code 가 첫 기숙사 캠퍼스뿐이라, 이름 끝 표시 "(P)"로 캠퍼스를 정한다.
    // 표시 → 캠퍼스 대응은 기숙사가 하나인 연수에서 가장 많이 나온 조합으로 만든다.
    const tagOf = (s: string) => s.match(/\(([A-Z])\)\s*$/)?.[1] ?? '';
    const tagVotes = new Map<string, Map<string, number>>();
    if (kind === 'dorm') {
      for (const { raw } of all) {
        const items = splitItems(raw.dorms);
        const tag = items.length === 1 ? tagOf(items[0]) : '';
        if (!tag || !raw.first_do_ca_code) continue;
        const v = tagVotes.get(tag) ?? new Map<string, number>();
        v.set(str(raw.first_do_ca_code), (v.get(str(raw.first_do_ca_code)) ?? 0) + 1);
        tagVotes.set(tag, v);
      }
    }
    const tagCampus = new Map([...tagVotes].map(([tag, v]) => [tag, [...v].sort((p, q2) => q2[1] - p[1])[0][0]]));

    for (const { raw, row } of all) {
      if (row.status === 'cancelled') continue;
      const own = kind === 'course' ? raw.first_co_ca_code : raw.first_do_ca_code;
      for (const name of splitItems(kind === 'course' ? raw.courses : raw.dorms)) {
        const a = acc(campusName(tagCampus.get(tagOf(name)) ?? own), name);
        a.students.add(row.stId);
        if (row.status === 'current') a.current.add(row.stId);
        if (row.status === 'upcoming') a.upcoming.add(row.stId);
        if (row.start <= refDate && row.start > a.lastStart) a.lastStart = row.start;
      }
    }
    if (kind === 'dorm') {
      for (const d of dorms) {
        const x = byTr.get(str(d.tr_id));
        if (!x || x.row.status === 'cancelled' || yes(d.ic_cancel_yn)) continue;
        const name = str(d.do_name_short) || str(d.do_name);
        if (!name) continue;
        const a = acc(d.ca_code ? campusName(d.ca_code) : str(d.ca_name) || '-', name);
        a.assigned++;
        const from = str(d.ic_departure_date || x.row.start), to = str(d.ic_return_date || x.row.end);
        if (from <= refDate && to >= refDate) a.staying.add(x.row.stId);
      }
    }
    return [...m.values()].map((a) => ({
      campus: a.campus,
      name: a.name,
      current: a.current.size,
      upcoming: a.upcoming.size,
      students: a.students.size,
      assigned: a.assigned,
      staying: a.staying.size,
      lastStart: a.lastStart,
    }));
  }
  const codesOf = (kind: 'course' | 'dorm') => {
    if (!codeCache.has(kind)) codeCache.set(kind, buildCodes(kind));
    return codeCache.get(kind)!;
  };

  function listCodes(q: URLSearchParams) {
    const kind = q.get('kind') === 'dorm' ? 'dorm' : 'course';
    let list = codesOf(kind);
    const facets = { campuses: countBy(list, (r) => r.campus).map((c) => c.name) };
    const campus = q.get('campus');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    if (campus) list = list.filter((r) => r.campus === campus);
    if (kw) list = list.filter((r) => r.name.toLowerCase().includes(kw));
    list = [...list].sort((a, b) => a.campus.localeCompare(b.campus) || b.current - a.current || b.students - a.students || a.name.localeCompare(b.name));
    return { refDate, kind, tabCounts: { course: codesOf('course').length, dorm: codesOf('dorm').length }, facets, ...paginate(list, q) };
  }

  // ── 캠퍼스·배치: 배치(sd_name)별 입국일(sd_departure_date)과 인원.
  const arrivalsFrom = addDays(refDate, -56); // 입학 배치별 명단 화면이 고를 수 있는 범위
  const batchAll = (() => {
    const m = new Map<string, { batch: string; date: string; start: string; total: number; cancelled: number; byCampus: Record<string, number> }>();
    for (const { raw, row } of all) {
      if (!row.batch) continue;
      let b = m.get(row.batch);
      if (!b) m.set(row.batch, (b = { batch: row.batch, date: str(raw.sd_departure_date || raw.sd_start_date || row.start).slice(0, 10), start: str(raw.sd_start_date).slice(0, 10), total: 0, cancelled: 0, byCampus: {} }));
      if (row.status === 'cancelled') {
        b.cancelled++;
        continue;
      }
      b.total++;
      b.byCampus[row.campus] = (b.byCampus[row.campus] ?? 0) + 1;
    }
    return [...m.values()].map((b) => ({ ...b, upcoming: b.date > refDate, linkable: b.date >= arrivalsFrom }));
  })();
  type BatchRow = (typeof batchAll)[number];

  function listBatches(q: URLSearchParams) {
    const tab = q.get('tab') || 'upcoming';
    const live = all.filter((x) => x.row.status !== 'cancelled');
    const campuses = countBy(live, (x) => x.row.campus).map((c) => c.name);
    const campusStats = campuses.map((name) => {
      const xs = live.filter((x) => x.row.campus === name);
      return {
        name,
        current: xs.filter((x) => x.row.status === 'current').length,
        upcoming: xs.filter((x) => x.row.status === 'upcoming').length,
        total: xs.length,
        nextBatch: batchAll.filter((b) => b.upcoming && b.byCampus[name]).sort((a, b) => a.date.localeCompare(b.date))[0]?.batch ?? '',
      };
    });
    let list = tab === 'all' ? batchAll : batchAll.filter((b) => (tab === 'past' ? !b.upcoming : b.upcoming));
    const years = [...new Set(list.map((b) => b.date.slice(0, 4)).filter(Boolean))].sort().reverse();
    const campus = q.get('campus'), year = q.get('year');
    if (campus) list = list.filter((b) => b.byCampus[campus]);
    if (year) list = list.filter((b) => b.date.startsWith(year));
    list = [...list].sort(tab === 'upcoming' ? (a, b) => a.date.localeCompare(b.date) : (a, b) => b.date.localeCompare(a.date));
    const tabCounts = { upcoming: batchAll.filter((b) => b.upcoming).length, past: batchAll.filter((b) => !b.upcoming).length, all: batchAll.length };
    const people = list.reduce((s, b) => s + (campus ? b.byCampus[campus] ?? 0 : b.total), 0);
    return { refDate, tab, tabCounts, campuses, campusStats, facets: { years }, people, ...paginate<BatchRow>(list, q) };
  }

  // ── 방·침대 목록(업체 방관리). 업체 포털에는 침대 배정 기록이 없어(2026-11-08 입실자 295명 모두 침대 사용 0) 목록만 보여 준다.
  // 타입별 침대 수와 입실 인원이 서로 맞지 않는 곳이 있어 공실은 계산하지 않는다(원칙 C8).
  const roomRows = (input.rooms ?? []).map((r) => {
    const beds = (Array.isArray(r.beds) ? r.beds : []) as Raw[];
    return {
      roomId: str(r.roo_id),
      number: str(r.roo_num),
      building: str(r.roo_building) || '-',
      floor: str(r.roo_floor) || '-',
      type: str(r.do_name) || '-',
      campus: campusName(r.ca_code),
      gender: ({ M: '남', F: '여', N: '공용' } as Record<string, string>)[str(r.roo_gender).toUpperCase()] ?? (str(r.roo_gender) || '-'),
      max: num(r.roo_max),
      beds: beds.length,
      bedNumbers: beds.map((b) => str(b.bed_num)).filter(Boolean),
      status: str(r.roo_status) || (yes(r.roo_use_yn) ? 'ACTIVE' : '-'),
      start: str(r.roo_start_date).slice(0, 10),
      end: str(r.roo_finish_date).slice(0, 10),
      memo: str(r.roo_memo),
    };
  });
  type RoomRow = (typeof roomRows)[number];

  function rooms(q: URLSearchParams) {
    const facets = {
      buildings: countBy(roomRows, (r) => r.building).map((c) => c.name).sort(),
      floors: [...new Set(roomRows.map((r) => r.floor))].sort(),
      types: countBy(roomRows, (r) => r.type).map((c) => c.name).sort(),
      campuses: countBy(roomRows, (r) => r.campus).map((c) => c.name),
    };
    let list: RoomRow[] = roomRows;
    const building = q.get('building'), floor = q.get('floor'), type = q.get('type'), gender = q.get('gender');
    const kw = (q.get('q') ?? '').trim().toLowerCase();
    if (building) list = list.filter((r) => r.building === building);
    if (floor) list = list.filter((r) => r.floor === floor);
    if (type) list = list.filter((r) => r.type === type);
    if (gender) list = list.filter((r) => r.gender === gender);
    if (kw) list = list.filter((r) => `${r.number} ${r.memo}`.toLowerCase().includes(kw));
    list = [...list].sort((a, b) => a.building.localeCompare(b.building) || a.floor.localeCompare(b.floor) || a.number.localeCompare(b.number, undefined, { numeric: true }));
    const byType = countBy(list, (r) => r.type).map(({ name }) => {
      const rs = list.filter((r) => r.type === name);
      return { type: name, rooms: rs.length, beds: rs.reduce((s, r) => s + r.beds, 0) };
    });
    return { refDate, facets, totals: { rooms: list.length, beds: list.reduce((s, r) => s + r.beds, 0) }, byType, ...paginate<RoomRow>(list, q) };
  }

  const source: 'sample' | 'extract' = meta.source === 'sample' ? 'sample' : 'extract';

  return {
    refDate,
    meta: () => ({ source, extractedAt: meta.extracted_at ?? null, refDate }),
    summary: () => `${source === 'sample' ? '[샘플 데이터] ' : ''}학생 ${students.length} · 연수 ${enrollments.length} · 인보이스 ${invoices.length} · 입금 ${deposits.length} · 포인트 내역 ${input.pointHistory?.length ?? 0} · 방 ${input.rooms?.length ?? 0} · 기숙사 ${dorms.length} · 에이전시 ${agencies.length} · 담당자 ${agents.length}`,
    dashboard,
    listEnrollments,
    studentDetail,
    dormOverview,
    listAgencies,
    agencyDetail,
    listAgents,
    arrivals,
    listInvoices,
    listUnpaid,
    listDeposits,
    points,
    listCodes,
    listBatches,
    rooms,
  };
}

export type Db = ReturnType<typeof createDb>;

/** /api 아래 경로(예: '/dashboard')를 처리해 상태 코드와 JSON 본문을 돌려준다. */
export function handleApi(db: Db, pathname: string, params: URLSearchParams): { status: number; body: unknown } {
  try {
    const p = pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    if (p === '/meta') return { status: 200, body: db.meta() };
    if (p === '/dashboard') return { status: 200, body: db.dashboard() };
    if (p === '/enrollments') return { status: 200, body: db.listEnrollments(params) };
    if (p === '/dorm') return { status: 200, body: db.dormOverview(params) };
    if (p === '/agencies') return { status: 200, body: db.listAgencies(params) };
    if (p === '/agents') return { status: 200, body: db.listAgents(params) };
    if (p === '/arrivals') return { status: 200, body: db.arrivals(params) };
    if (p === '/invoices') return { status: 200, body: db.listInvoices(params) };
    if (p === '/unpaid') return { status: 200, body: db.listUnpaid(params) };
    if (p === '/deposits') return { status: 200, body: db.listDeposits(params) };
    if (p === '/points') return { status: 200, body: db.points(params) };
    if (p === '/rooms') return { status: 200, body: db.rooms(params) };
    if (p === '/codes') return { status: 200, body: db.listCodes(params) };
    if (p === '/batches') return { status: 200, body: db.listBatches(params) };
    const m = p.match(/^\/students\/(\w+)$/);
    if (m) {
      const d = db.studentDetail(m[1]);
      return d ? { status: 200, body: d } : { status: 404, body: { error: '학생을 찾을 수 없습니다.' } };
    }
    const ag = p.match(/^\/agencies\/(\w+)$/);
    if (ag) {
      const d = db.agencyDetail(ag[1]);
      return d ? { status: 200, body: d } : { status: 404, body: { error: '에이전시를 찾을 수 없습니다.' } };
    }
    return { status: 404, body: { error: 'not found' } };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message } };
  }
}
