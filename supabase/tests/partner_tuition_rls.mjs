// 학비표(CL-038) 함수 partner_tuition()(20261110173500_partner_tuition.sql)의 권한·내용 시험. 데이터는 전부 가짜 샘플이다.
// - 지점(승인)·직원만 읽고, 가격표가 샘플이면 지점에게는 0행(원칙 C8), 직원은 sample 표시와 함께 본다.
// - 지금 적용 중인 코스·기숙사·기타 비용만, 커미션·프로모션·환율은 내보내지 않는다.
// - 11/12부터 학비표는 승인 가격 버전(price_books)을 읽어 이 함수를 지운다(20261112200000). 끝에서 지운 뒤를 본다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/partner_tuition_rls.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
const nd = (f) => readFileSync(new URL(`../../data-sample/tables/${f}`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const q = async (sql) => (await db.query(sql)).rows;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261109130000_legacy_prices.sql']) await db.exec(mig(f));
await db.exec(mig('20261110173500_partner_tuition.sql'));
await db.exec(mig('20261110173500_partner_tuition.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

// 가짜 가격표를 legacy_prices 한 표에 _table 로 나눠 넣는다(scripts/upload-to-supabase.mjs 와 같은 모양)
const tables = ['price_course', 'price_dorm', 'price_etc', 'price_setting', 'promo', 'comm_rule', 'course_code', 'dorm_code', 'exchange_rate'];
let n = 0;
for (const t of tables) {
  for (const [i, r] of nd(`${t}.ndjson`).entries()) {
    await db.query(`insert into public.legacy_prices (id, data) values ($1, $2::jsonb)`, [`${t}:${i}`, JSON.stringify({ ...r, _table: t })]);
    n++;
  }
}
await db.exec(`insert into public.legacy_meta (id, data) values ('current', '{"source":"sample"}')`);
ok('가짜 가격표 넣음', n > 50, String(n));

const U = { partner: '00000000-0000-0000-0000-0000000000f1', pending: '00000000-0000-0000-0000-0000000000f2', staff: '00000000-0000-0000-0000-0000000000c1' };
await db.exec(`
  insert into auth.users (id, email) values ('${U.partner}', 'agent@example.com'), ('${U.pending}', 'wait@example.com'), ('${U.staff}', 'staff@example.com');
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values ('${U.partner}', 'agent@example.com', '샘플유학', '서울', '한국', 'active');
`);
async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const tuition = () => q(`select * from public.partner_tuition()`);

// 1) 샘플 가격표: 직원만 본다
await as(U.staff, async () => {
  const rows = await tuition();
  ok('직원: 샘플 가격표를 본다', rows.length > 0, String(rows.length));
  ok('직원: 모두 sample 표시', rows.every((r) => r.sample === true));
  const sections = new Set(rows.map((r) => r.section));
  ok('직원: 코스·기숙사·기타 비용', sections.has('course') && sections.has('dorm') && sections.has('etc'), [...sections].join(','));
  ok('직원: 코스 이름은 코스 코드에서', rows.filter((r) => r.section === 'course').every((r) => r.name && r.campus), JSON.stringify(rows.find((r) => r.section === 'course')));
  // 코스 101 은 2023년(끝남)과 2024~ 두 줄이 있다 → 지금 적용 중인 한 줄만
  const c101 = rows.filter((r) => r.section === 'course' && r.name === 'Speaking Starter');
  ok('직원: 끝난 가격 줄은 빠짐(코스 101 한 줄)', c101.length === 1 && Number(c101[0].krw) === 1512000, JSON.stringify(c101));
  const cols = Object.keys(rows[0]);
  ok('직원: 커미션·환율 칸 없음', !cols.some((c) => /acr|rate|comm|er_/.test(c)), cols.join(','));
});
await as(U.partner, async () => ok('지점: 샘플이면 0행(C8)', (await tuition()).length === 0));
await as(U.pending, async () => ok('승인 전 계정: 0행', (await tuition()).length === 0));
await as(null, async () => {
  try {
    await tuition();
    fails.push('익명: 막혀야 함');
  } catch (e) {
    ok('익명: 실행 불가', /permission denied/.test(e.message), e.message);
  }
});

// 2) 실제 가격표(추출본)를 올린 뒤: 지점도 본다, 샘플 표시 없음
await db.exec(`update public.legacy_meta set data = '{"source":"extract"}' where id = 'current'`);
await as(U.partner, async () => {
  const rows = await tuition();
  ok('지점: 실제 가격표는 본다', rows.length > 0, String(rows.length));
  ok('지점: sample 표시 없음', rows.every((r) => r.sample === false));
});
await as(U.pending, async () => ok('승인 전 계정: 실제 가격표도 0행', (await tuition()).length === 0));
// 정지된 지점은 못 본다
await as(U.staff, () => db.exec(`update public.agency_members set status = 'suspended' where user_id = '${U.partner}'`)); // 정지는 직원만(트리거)
await as(U.partner, async () => ok('정지된 지점: 0행', (await tuition()).length === 0));

// 3) 11/12 정리(20261112200000_drop_partner_tuition.sql): 학비표는 price_books 를 읽으므로 함수를 지운다. 업체 가격표는 그대로 직원만
await as(U.staff, () => db.exec(`update public.agency_members set status = 'active' where user_id = '${U.partner}'`));
await db.exec(mig('20261112200000_drop_partner_tuition.sql'));
await db.exec(mig('20261112200000_drop_partner_tuition.sql')); // 두 번째 실행
ok('정리: 함수 없음', (await q(`select to_regprocedure('public.partner_tuition()') is null as gone`))[0].gone === true);
await as(U.partner, async () => ok('정리 뒤 지점: 업체 가격표 직접 읽기 0행', (await q(`select 1 from public.legacy_prices`)).length === 0));
await as(U.staff, async () => ok('정리 뒤 직원: 업체 가격표 그대로 읽음', (await q(`select 1 from public.legacy_prices`)).length === n, String(n)));

console.log(`학비표 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
