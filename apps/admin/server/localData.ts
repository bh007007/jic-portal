/**
 * 로컬 데이터 소스: data/tables/*.ndjson (업체 포털 추출본)을 메모리에 올려 /api/* 로 제공한다.
 * Supabase로 옮길 때는 이 파일만 바꾸고 화면(src/)은 같은 응답 형태를 그대로 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type Raw = Record<string, any>;
export type Status = 'current' | 'upcoming' | 'graduated' | 'cancelled' | 'other';

const CANCELLED = /캔슬|거절|취소|연기|홀드|요청/;

function readNdjson(file: string): Raw[] {
  if (!fs.existsSync(file)) return [];
  const rows: Raw[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

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

export function createDb(dataDir: string) {
  const metaFile = path.join(dataDir, 'meta.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : { counts: {}, extracted_at: null };
  const enrollments = readNdjson(path.join(dataDir, 'enrollments.ndjson'));
  const students = readNdjson(path.join(dataDir, 'students.ndjson'));
  const invoices = readNdjson(path.join(dataDir, 'invoices.ndjson'));
  const dorms = readNdjson(path.join(dataDir, 'dorm_assignments.ndjson'));
  const agencies = readNdjson(path.join(dataDir, 'agencies.ndjson'));
  const agents = readNdjson(path.join(dataDir, 'agents.ndjson'));

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

    const size = Math.min(100, Math.max(10, Number(q.get('size')) || 20));
    const pages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(pages, Math.max(1, Number(q.get('page')) || 1));
    return { refDate, tab, tabCounts, total: list.length, page, pages, size, facets, rows: list.slice((page - 1) * size, page * size) };
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

  const source: 'sample' | 'extract' = meta.source === 'sample' ? 'sample' : 'extract';

  return {
    refDate,
    meta: () => ({ source, extractedAt: meta.extracted_at ?? null, refDate }),
    summary: () => `${source === 'sample' ? '[샘플 데이터] ' : ''}학생 ${students.length} · 연수 ${enrollments.length} · 인보이스 ${invoices.length} · 기숙사 ${dorms.length} · 에이전시 ${agencies.length} · 담당자 ${agents.length}`,
    dashboard,
    listEnrollments,
    studentDetail,
    dormOverview,
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function localDataPlugin(dataDir: string): Plugin {
  return {
    name: 'jic-local-data',
    configureServer(server) {
      const started = Date.now();
      const db = createDb(dataDir);
      server.config.logger.info(`[local-data] ${db.summary()} · 기준일 ${db.refDate} (${Date.now() - started}ms)`);

      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://local');
          const p = url.pathname.replace(/\/+$/, '');
          if (p === '/meta') return send(res, 200, db.meta());
          if (p === '/dashboard') return send(res, 200, db.dashboard());
          if (p === '/enrollments') return send(res, 200, db.listEnrollments(url.searchParams));
          if (p === '/dorm') return send(res, 200, db.dormOverview(url.searchParams));
          const m = p.match(/^\/students\/(\w+)$/);
          if (m) {
            const d = db.studentDetail(m[1]);
            return d ? send(res, 200, d) : send(res, 404, { error: '학생을 찾을 수 없습니다.' });
          }
          return send(res, 404, { error: 'not found' });
        } catch (e) {
          return send(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}
