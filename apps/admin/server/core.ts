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
}

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

  const memoText = (e: Raw) => MEMO_FIELDS.map(([k]) => e[k]).filter(Boolean).join(' ');

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

    const sorters: Record<string, (a: Row, b: Row) => number> = {
      current: (a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name),
      upcoming: (a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name),
      graduated: (a, b) => b.end.localeCompare(a.end),
      all: (a, b) => b.start.localeCompare(a.start),
    };
    list = [...list].sort(sorters[tab] ?? sorters.all);
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
        const pIn = num(inv?.sum_pd_point);
        const pOut = num(inv?.sum_pu_point);
        return {
          ...row,
          pickType: String(raw.tr_pick_type || ''),
          pickPlace: String(raw.tr_pick_place || ''),
          roomClear: yes(raw.tr_room_clear_yn),
          pointClear: yes(raw.tr_point_clear_yn),
          invoice: inv ? { currency: String(inv.tr_currency || ''), paid, pointIn: pIn, pointOut: pOut, pointBalance: pIn - pOut } : null,
          dormStay: dorm ? { type: String(dorm.do_name || ''), campus: String(dorm.ca_name || campusName(dorm.ca_code)), from: String(dorm.ic_departure_date || ''), to: String(dorm.ic_return_date || ''), weeks: num(dorm.ic_week) } : null,
          memos: MEMO_FIELDS.filter(([k]) => raw[k]).map(([k, kind]) => ({ kind, text: String(raw[k]) })),
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

  const source: 'sample' | 'extract' = meta.source === 'sample' ? 'sample' : 'extract';

  return {
    refDate,
    meta: () => ({ source, extractedAt: meta.extracted_at ?? null, refDate }),
    summary: () => `${source === 'sample' ? '[샘플 데이터] ' : ''}학생 ${students.length} · 연수 ${enrollments.length} · 인보이스 ${invoices.length} · 기숙사 ${dorms.length} · 에이전시 ${agencies.length} · 담당자 ${agents.length}`,
    dashboard,
    listEnrollments,
    studentDetail,
    dormOverview,
    listAgencies,
    agencyDetail,
    listAgents,
    arrivals,
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
