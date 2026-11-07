// 데이터 폴더(*.ndjson)를 Supabase legacy_* 테이블에 올린다. 기본은 가짜 샘플 데이터.
//
//   $env:SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "서비스 키 (Supabase > Project Settings > API)"
//   node scripts/upload-to-supabase.mjs                 # data-sample/tables 업로드
//   node scripts/upload-to-supabase.mjs --replace       # 기존 행을 지우고 다시 업로드
//
// 실제 추출본(data/tables)은 보안 점검 전까지 올리지 않는다. 꼭 필요하면 --dir data/tables --allow-real.
// 서비스 키는 모든 권한을 가진 키다. 코드·GitHub·메신저에 붙여 넣지 말고 이 터미널에서만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => args.includes(name);
const dirArg = args[args.indexOf('--dir') + 1];
const dir = path.resolve(root, args.includes('--dir') && dirArg ? dirArg : 'data-sample/tables');

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 먼저 설정하세요.');
  process.exit(1);
}
if (path.relative(root, dir).replace(/\\/g, '/').startsWith('data/') && !opt('--allow-real')) {
  console.error('실제 추출본은 보안 점검 전까지 올리지 않습니다. 필요하면 --allow-real 을 붙이세요.');
  process.exit(1);
}

const read = (name) => {
  const f = path.join(dir, name);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
};
const PLAN = [
  ['legacy_students', 'students.ndjson', (r) => r.st_id],
  ['legacy_enrollments', 'enrollments.ndjson', (r) => r.tr_id],
  ['legacy_invoices', 'invoices.ndjson', (r) => r.tr_id],
  ['legacy_dorm_assignments', 'dorm_assignments.ndjson', (r) => r.tr_id],
  ['legacy_agencies', 'agencies.ndjson', (r) => r.ag_id],
  ['legacy_agents', 'agents.ndjson', (r) => r.am_id],
];
// 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다.
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };

async function call(method, table, query, body, extra = {}) {
  const r = await fetch(`${url}/rest/v1/${table}${query}`, { method, headers: { ...headers, ...extra }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${table} ${method} ${r.status}: ${await r.text()}`);
}

async function upload(table, rows) {
  if (opt('--replace')) await call('DELETE', table, '?id=not.is.null');
  for (let i = 0; i < rows.length; i += 500) {
    await call('POST', table, '', rows.slice(i, i + 500), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
  console.log(`${table}: ${rows.length}건`);
}

console.log('업로드 대상 폴더:', path.relative(root, dir));
for (const [table, file, idOf] of PLAN) {
  const byId = new Map();
  for (const r of read(file)) if (idOf(r) != null) byId.set(String(idOf(r)), { id: String(idOf(r)), data: r });
  await upload(table, [...byId.values()]);
}
const metaFile = path.join(dir, 'meta.json');
if (fs.existsSync(metaFile)) await upload('legacy_meta', [{ id: 'current', data: JSON.parse(fs.readFileSync(metaFile, 'utf8')) }]);
console.log('완료');
