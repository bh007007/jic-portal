// 정규화 표 어댑터 시험(docs/schema.md 5단계): 업체 원본(legacy_*)을 PGlite 에 넣고 load_core_from_legacy() 로 정규화 표를 채운 뒤,
// 정규화 행 → apps/admin/server/normalized.ts 어댑터 → 관리자 core 로 만든 응답이 업체 원본으로 바로 만든 응답과 같은지 본다.
// 학생·연수만 정규화 표에서 가져오고 나머지(인보이스·연장 등)는 같은 입력을 쓴다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/core_schema_adapter.mjs                 # 가짜 샘플(data-sample/tables)
//   JIC_DATA_DIR=<폴더> node supabase/tests/core_schema_adapter.mjs   # 다른 데이터 폴더. 샘플이 아니면 값은 출력하지 않고 경로·건수만
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SAMPLE = path.join(REPO, 'data-sample', 'tables');
const dataDir = process.env.JIC_DATA_DIR ? path.resolve(process.env.JIC_DATA_DIR) : SAMPLE;
const isSample = path.resolve(dataDir) === path.resolve(SAMPLE);
const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const { build } = await import('esbuild');

// core·어댑터·로컬 읽기를 한 파일로 묶어 불러온다(TypeScript 라서)
const tmp = mkdtempSync(path.join(tmpdir(), 'jic-adapter-'));
const entry = path.join(tmp, 'entry.ts');
const rel = (p) => path.join(REPO, p).replace(/\\/g, '/');
writeFileSync(entry, `export { createDb, handleApi } from '${rel('apps/admin/server/core.ts')}';
export { readDir } from '${rel('apps/admin/server/localData.ts')}';
export * from '${rel('apps/admin/server/normalized.ts')}';
`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: path.join(tmp, 'entry.mjs'), external: ['vite'], logLevel: 'error' });
const lib = await import(pathToFileURL(path.join(tmp, 'entry.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
`);
const mig = (f) => readFileSync(path.join(REPO, 'supabase', 'migrations', f), 'utf8');
for (const f of ['20261107000000_legacy_tables.sql', '20261109030000_legacy_extend.sql', '20261110110000_core_schema.sql', '20261110120000_core_schema_more.sql', '20261110120000_core_schema_more.sql']) await db.exec(mig(f));
ok('마이그레이션(보강 2회 포함)', true);

const nd = (f) => {
  try {
    return readFileSync(path.join(dataDir, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const put = async (table, rows, idOf) => {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.query(`insert into public.${table} (id, data) select x->>'id', x->'data' from jsonb_array_elements($1::jsonb) x on conflict (id) do nothing`, [JSON.stringify(chunk.map((r) => ({ id: String(idOf(r)), data: r })))]);
  }
};
await put('legacy_students', nd('students.ndjson'), (r) => r.st_id);
await put('legacy_enrollments', nd('enrollments.ndjson'), (r) => r.tr_id);
await put('legacy_extensions', nd('extend.ndjson'), (r) => r.tt_id);
await db.exec(`set role service_role; select * from public.load_core_from_legacy(); reset role;`);

// Supabase REST 처럼 JSON 으로, 배포 읽기(functions/api)와 같이 번호 순으로 읽는다(날짜 'YYYY-MM-DD', 시각 ISO)
const json = async (cols, table, key) => (await db.query(`select coalesce(json_agg(t order by t.${key} collate "C"), '[]'::json) j from (select ${cols} from public.${table}) t`)).rows[0].j;
const ns = await json(lib.N_STUDENT_COLUMNS, 'students', 'student_no');
const nb = await json(lib.N_BATCH_COLUMNS, 'batches', 'id');
const ne = await json(lib.N_ENROLLMENT_COLUMNS, 'enrollments', 'id');

// 업체 원본도 배포처럼 번호 순(legacy_* 의 order=id)으로 맞춘다. 같은 값끼리 정렬 순서가 입력 순서를 따르므로.
const byKey = (k) => (a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0);
const input0 = lib.readDir(dataDir);
const input = { ...input0, students: [...input0.students].sort(byKey('st_id')), enrollments: [...input0.enrollments].sort(byKey('tr_id')) };
const legacyDb = lib.createDb(input);
const normDb = lib.createDb({ ...input, students: lib.toLegacyStudents(ns), enrollments: lib.toLegacyEnrollments(ne, ns, nb) });
ok('정규화 행 건수 = 원본', ns.length >= input.students.length && ne.length === input.enrollments.length, `학생 ${ns.length}/${input.students.length}, 연수 ${ne.length}/${input.enrollments.length}`);

// 응답 비교: 화면 목록 전체 + 학생 상세 전부 + 에이전시 상세 일부
const firstDiff = (a, b, at = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${at}/${k}`);
      if (d) return d;
    }
  }
  return { at, legacy: a, normalized: b };
};
const PATHS = [
  '/meta', '/dashboard', '/dorm', '/arrivals', '/invoices?tab=all&all=1', '/invoices?tab=current&all=1', '/unpaid', '/deposits', '/points', '/rooms', '/codes',
  '/batches?tab=all&all=1', '/stats/calendar', '/stats/registrations', '/stats/registrations?basis=departure', '/cancellations?all=1', '/extensions?all=1',
  '/changes', '/memos?all=1', '/agencies?all=1', '/agents?all=1', '/prices',
  ...['current', 'upcoming', 'graduated', 'all'].map((t) => `/enrollments?tab=${t}&all=1`),
];
const agencyIds = [...new Set(input.enrollments.map((e) => String(e.ag_id ?? '')).filter(Boolean))].slice(0, 30);
const studentIds = input.students.map((s) => String(s.st_id));
const all = [...PATHS, ...agencyIds.map((id) => `/agencies/${id}`), ...studentIds.map((id) => `/students/${id}`)];
const diffs = [];
for (const p of all) {
  const [pathname, qs = ''] = p.split('?');
  const a = lib.handleApi(legacyDb, '/api' + pathname, new URLSearchParams(qs));
  const b = lib.handleApi(normDb, '/api' + pathname, new URLSearchParams(qs));
  const d = a.status !== b.status ? { at: 'status', legacy: a.status, normalized: b.status } : firstDiff(a.body, b.body);
  if (d) diffs.push({ p, d });
}
const screens = all.length - studentIds.length - agencyIds.length;
ok(`응답이 모두 같음(목록 ${screens}개, 학생 상세 ${studentIds.length}명, 에이전시 상세 ${agencyIds.length}곳)`, diffs.length === 0,
  `다른 응답 ${diffs.length}개: ` + diffs.slice(0, 5).map(({ p, d }) => (isSample ? `${p} ${d.at} ${JSON.stringify(d.legacy)?.slice(0, 80)} ≠ ${JSON.stringify(d.normalized)?.slice(0, 80)}` : `${p.replace(/\/\d+$/, '/<id>')} ${d.at.replace(/\/\d+(?=\/|$)/g, '/<n>')}`)).join(' | '));

console.log(`정규화 어댑터 시험(${isSample ? '가짜 샘플' : '다른 데이터 폴더, 값 출력 안 함'}): 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
