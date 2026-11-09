// 연장·변경 표(20261109030000_legacy_extend.sql)와 청구 합계 표(20261109060000_legacy_invoice_summary.sql)의 권한 시험: 직원만 읽고, 다른 로그인·익명은 못 읽고, 아무도 쓰지 못한다(쓰기는 서비스 키 업로드만). 데이터는 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/legacy_extend_rls.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(mig('20261107000000_legacy_tables.sql'));
await db.exec(mig('20261109030000_legacy_extend.sql'));
await db.exec(mig('20261109030000_legacy_extend.sql')); // 두 번째 실행
await db.exec(mig('20261109060000_legacy_invoice_summary.sql'));
await db.exec(mig('20261109060000_legacy_invoice_summary.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const STAFF = '00000000-0000-0000-0000-0000000000c1';
const OTHER = '00000000-0000-0000-0000-0000000000a1';
const TABLES = ['legacy_extensions', 'legacy_course_changes', 'legacy_dorm_changes', 'legacy_comebacks', 'legacy_invoice_summary', 'legacy_balances'];
await db.exec(`
  insert into auth.users (id) values ('${STAFF}'), ('${OTHER}');
  insert into public.staff_users (user_id, name) values ('${STAFF}', '직원');
  ${TABLES.map((t) => `insert into public.${t} (id, data) values ('x1', '{"tr_id":"tr1","tt_finish_date":"2026-12-31"}');`).join('\n')}
`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function denied(name, sql, pattern) {
  try {
    await db.query(sql);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}

for (const t of TABLES) {
  await as(STAFF, async () => {
    ok(`직원: ${t} 읽기`, (await db.query(`select * from public.${t}`)).rows.length === 1);
    await denied(`직원: ${t} 쓰기 거부`, `insert into public.${t} (id, data) values ('x2', '{}')`, /permission denied/);
  });
  await as(OTHER, async () => ok(`직원 아님: ${t} 0행`, (await db.query(`select * from public.${t}`)).rows.length === 0));
  await as(null, () => denied(`익명: ${t} 거부`, `select * from public.${t}`, /permission denied/));
}

console.log(`연장·변경·청구 합계 표 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
