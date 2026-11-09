/**
 * Cloudflare Pages Function: 배포 환경의 /api/*.
 * 로그인한 사용자의 토큰으로 Supabase legacy_* 테이블을 읽고(RLS: staff_users 에 등록된 직원만 읽힘),
 * 로컬 개발과 같은 core 로직으로 응답한다. 화면은 로컬과 똑같은 응답을 받는다.
 * 키는 Pages 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)에서 읽는다. 코드에 키를 넣지 않는다.
 *
 * 지금은 요청 때마다 legacy_* 전체를 읽어 계산한다(샘플 규모용). 실제 데이터를 올리기 전에
 * 정규화된 테이블과 조건 조회로 바꾼다(HANDOFF.md).
 */
import { createDb, handleApi, type Db, type PriceTable, type Raw } from '../../apps/admin/server/core';
import { N_BATCH_COLUMNS, N_ENROLLMENT_COLUMNS, N_STUDENT_COLUMNS, toLegacyEnrollments, toLegacyStudents, type NBatch, type NEnrollment, type NStudent } from '../../apps/admin/server/normalized';

interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}
interface Conf {
  url: string;
  key: string;
  token: string;
}

const PAGE = 1000; // Supabase API 기본 최대 행 수
const TTL = 60_000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

async function call(c: Conf, pathAndQuery: string, init: { method?: string; body?: string; prefer?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { apikey: c.key, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' };
  if (init.prefer) headers.Prefer = init.prefer;
  const r = await fetch(`${c.url}/rest/v1/${pathAndQuery}`, { method: init.method ?? 'GET', body: init.body, headers });
  if (r.status === 401) throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인하세요.');
  if (!r.ok) throw new HttpError(502, `Supabase ${r.status}: ${await r.text()}`);
  return r;
}

async function rest<T>(c: Conf, pathAndQuery: string, init?: { method?: string; body?: string }): Promise<T> {
  return (await (await call(c, pathAndQuery, init)).json()) as T;
}

// 프로젝트의 최대 행 수 설정이 PAGE 보다 작아도 빠짐없이 읽도록 전체 건수(Content-Range)를 보고 반복한다.
async function readRows<T>(c: Conf, table: string, select: string, order: string): Promise<T[]> {
  const out: T[] = [];
  let total = 0;
  do {
    const r = await call(c, `${table}?select=${select}&order=${order}&limit=${PAGE}&offset=${out.length}`, { prefer: 'count=exact' });
    total = Number(r.headers.get('Content-Range')?.split('/')[1]) || 0;
    const rows = (await r.json()) as T[];
    if (!rows.length) break;
    out.push(...rows);
  } while (out.length < total);
  return out;
}
async function readAll(c: Conf, table: string): Promise<Raw[]> {
  return (await readRows<{ data: Raw }>(c, table, 'data', 'id')).map((r) => r.data);
}

const isMissingTable = (e: unknown) => e instanceof HttpError && /Supabase 404|PGRST205|does not exist/.test(e.message);

// 학생·연수: 정규화 표(docs/schema.md, load_core_from_legacy() 로 채움)가 채워져 있으면 그것을 어댑터로 바꿔 쓰고,
// 표가 없거나 비어 있으면(지금 운영) legacy_* 를 읽는다. 시험 supabase/tests/core_schema_adapter.mjs 가 두 길의 응답이 같은지 본다.
async function readStudentsAndEnrollments(c: Conf): Promise<{ students: Raw[]; enrollments: Raw[] }> {
  let ne: NEnrollment[] = [];
  try {
    ne = await readRows<NEnrollment>(c, 'enrollments', N_ENROLLMENT_COLUMNS, 'id');
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  if (ne.length) {
    const [ns, nb] = await Promise.all([
      readRows<NStudent>(c, 'students', N_STUDENT_COLUMNS, 'student_no'),
      readRows<NBatch>(c, 'batches', N_BATCH_COLUMNS, 'id'),
    ]);
    return { students: toLegacyStudents(ns), enrollments: toLegacyEnrollments(ne, ns, nb) };
  }
  const [enrollments, students] = await Promise.all([readAll(c, 'legacy_enrollments'), readAll(c, 'legacy_students')]);
  return { students, enrollments };
}

// 나중에 더한 표(연장·변경 20261109030000_legacy_extend.sql, 청구 합계 20261109060000_legacy_invoice_summary.sql, 가격표 20261109130000_legacy_prices.sql, 인보이스 항목 20261110090000_legacy_invoice_items.sql)는 마이그레이션 전에도 나머지 화면이 동작하도록 표가 없으면 빈 목록으로 본다.
async function readOptional(c: Conf, table: string): Promise<Raw[]> {
  try {
    return await readAll(c, table);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

// 여러 표를 한 표에 담은 legacy_prices·legacy_invoice_items 를 data._table 별로 다시 나눈다(_table 은 떼고).
function byTable(rows: Raw[]): Record<string, Raw[]> {
  const out: Record<string, Raw[]> = {};
  for (const r of rows) {
    const { _table, ...row } = r as Raw & { _table?: string };
    if (_table) (out[_table] ??= []).push(row);
  }
  return out;
}

// 화면을 옮길 때마다 전체를 다시 읽지 않도록 같은 토큰의 결과를 1분간 보관한다(토큰별이라 사용자끼리 섞이지 않음).
const cache = new Map<string, { at: number; db: Db }>();

async function loadDb(c: Conf): Promise<Db> {
  const now = Date.now();
  const hit = cache.get(c.token);
  if (hit && now - hit.at < TTL) return hit.db;

  const staff = await rest<boolean>(c, 'rpc/is_staff', { method: 'POST', body: '{}' });
  if (staff !== true) throw new HttpError(403, '직원 계정으로 등록되지 않았습니다. 관리자에게 등록을 요청하세요.');

  const [metaRows, { students, enrollments }, invoices, dorms, agencies, agents, deposits, pointHistory, rooms, extensions, courseChanges, dormChanges, comebacks, invoiceSummary, balances, priceRows, itemRows] = await Promise.all([
    rest<{ data: Raw }[]>(c, 'legacy_meta?select=data&id=eq.current'),
    readStudentsAndEnrollments(c),
    readAll(c, 'legacy_invoices'),
    readAll(c, 'legacy_dorm_assignments'),
    readAll(c, 'legacy_agencies'),
    readAll(c, 'legacy_agents'),
    readAll(c, 'legacy_deposits'),
    readAll(c, 'legacy_point_history'),
    readAll(c, 'legacy_rooms'),
    readOptional(c, 'legacy_extensions'),
    readOptional(c, 'legacy_course_changes'),
    readOptional(c, 'legacy_dorm_changes'),
    readOptional(c, 'legacy_comebacks'),
    readOptional(c, 'legacy_invoice_summary'),
    readOptional(c, 'legacy_balances'),
    readOptional(c, 'legacy_prices'),
    readOptional(c, 'legacy_invoice_items'),
  ]);
  // 가격표: 표 하나(legacy_prices)에 data._table 로 담긴 9개 표(환율 포함)를 다시 나눈다
  const prices = byTable(priceRows) as Partial<Record<PriceTable, Raw[]>>;
  // 인보이스 항목: 표 하나(legacy_invoice_items)에 학생 가격·에이전시 공제·현지 비용 3개 표
  const items = byTable(itemRows);
  const db = createDb({
    meta: metaRows[0]?.data ?? { counts: {}, extracted_at: null },
    enrollments,
    students,
    invoices,
    dorms,
    agencies,
    agents,
    deposits,
    pointHistory,
    rooms,
    extensions,
    courseChanges,
    dormChanges,
    comebacks,
    invoiceSummary,
    balances,
    prices,
    invoiceItems: items.inv_invoice_cost_st ?? [],
    invoiceAgencyItems: items.inv_invoice_cost_ag ?? [],
    localCosts: items.inv_etc ?? [],
  });

  for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
  cache.set(c.token, { at: now, db });
  return db;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return json(500, { error: 'Pages 환경변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다.' });
  }
  if (request.method !== 'GET') return json(405, { error: 'GET 요청만 받습니다.' });

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: '로그인이 필요합니다.' });

  try {
    const db = await loadDb({ url: env.VITE_SUPABASE_URL.replace(/\/+$/, ''), key: env.VITE_SUPABASE_ANON_KEY, token });
    const url = new URL(request.url);
    const { status, body } = handleApi(db, url.pathname, url.searchParams);
    return json(status, body);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    return json(500, { error: (e as Error).message });
  }
};
