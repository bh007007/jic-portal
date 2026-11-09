// 파트너 포털 추천 조건표 v2.1(20261109153000_partner_reco_v21.sql) 시험: 두 번 실행해도 같은지, 표시 이름·단계·승인본, 읽기 권한.
// 실행(저장소 루트): npm i --no-save @electric-sql/pglite@0.3 && node supabase/tests/partner_reco_rls.mjs
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
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql']) await db.exec(mig(f));
// 트리거 함수 실행 권한을 먼저 거둔다(20261110131500_trigger_fn_privileges.sql). 아래 끝의 가입 신청·지점 계정 시험이 트리거가 그대로 도는지 본다
await db.exec(mig('20261110131500_trigger_fn_privileges.sql'));
await db.exec(mig('20261110131500_trigger_fn_privileges.sql')); // 두 번째 실행
for (const fn of ['handle_partner_signup()', 'guard_member_update()']) {
  const r = (await db.query(`select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') u`)).rows[0];
  ok(`트리거 함수 ${fn}: 로그인 전·후 직접 실행 불가`, !r.a && !r.u, JSON.stringify(r));
}
// 관리자가 Speaking Course 단계 내용을 이미 넣었다면 덮어쓰지 않는지 보려고 하나 넣어 둔다
await db.exec(`update public.courses set levels = '[{"name":"STARTER","lessons":"관리자 입력"}]' where id = 'p-speaking'`);
await db.exec(mig('20261109153000_partner_reco_v21.sql'));
await db.exec(mig('20261109153000_partner_reco_v21.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const q = async (sql) => (await db.query(sql)).rows;
const sets = await q(`select version, status, jsonb_array_length(questions) nq, rules->>'model' model, jsonb_array_length(rules->'courses') nc from public.recommendation_rules order by id`);
ok('승인본 V2.1 한 번만', sets.filter((s) => s.version === 'V2.1').length === 1, JSON.stringify(sets));
const v = sets.find((s) => s.version === 'V2.1');
ok('V2.1 승인본·질문 5·코스 10·점수 방식', v?.status === 'approved' && v.nq === 5 && v.nc === 10 && v.model === 'score');
ok('예전 샘플은 초안 그대로', sets.find((s) => s.version === 'sample-1')?.status === 'draft');
const courses = Object.fromEntries((await q(`select id, display_name, levels from public.courses`)).map((r) => [r.id, r]));
ok('Senior 표시 이름', courses['p-senior'].display_name === '1:1 맞춤 과정');
ok('다른 코스는 표시 이름 없음', courses['p-esl'].display_name === null);
ok('TEP 단계 3개', courses['p-tep'].levels.map((l) => l.name).join() === 'TEP 8,TEP 9,TEP 10');
ok('Challenger ESL 옵션 2개·기본 세미 스파르타', courses['c-esl'].levels.length === 2 && courses['c-esl'].levels[0].default === true);
ok('IELTS Guarantee 옵션 1개', courses['c-ielts-g'].levels.length === 1);
ok('관리자가 넣은 단계는 그대로', courses['p-speaking'].levels[0].lessons === '관리자 입력');
// 표시 이름을 관리자가 바꾼 뒤 다시 실행해도 그대로
await db.exec(`update public.courses set display_name = '1:1 Custom' where id = 'p-senior'`);
await db.exec(mig('20261109153000_partner_reco_v21.sql'));
ok('표시 이름 덮어쓰지 않음', (await q(`select display_name from public.courses where id = 'p-senior'`))[0].display_name === '1:1 Custom');

// 읽기 권한: 승인된 에이전시 지점과 직원만 규칙을 읽고, 익명은 못 읽는다
const U = { partner: '00000000-0000-0000-0000-0000000000f1', pending: '00000000-0000-0000-0000-0000000000f2', staff: '00000000-0000-0000-0000-0000000000c1' };
await db.exec(`
  insert into auth.users (id, email) values ('${U.partner}', 'agent@example.com'), ('${U.pending}', 'wait@example.com'), ('${U.staff}', 'staff@example.com');
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.agency_members (user_id, email, agency_name, branch, status) values ('${U.partner}', 'agent@example.com', '샘플유학', '서울', 'active');
`);
async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
await as(U.partner, async () => {
  ok('에이전시: 규칙 읽음', (await q(`select 1 from public.recommendation_rules where version = 'V2.1'`)).length === 1);
  ok('에이전시: 표시 이름 읽음', (await q(`select display_name from public.courses where id = 'p-senior'`))[0]?.display_name === '1:1 Custom');
  ok('에이전시: 규칙 못 고침', (await db.query(`update public.recommendation_rules set note = 'x'`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);
});
await as(U.pending, async () => ok('승인 전 계정: 규칙 0', (await q(`select 1 from public.recommendation_rules`)).length === 0));
await as(U.staff, async () => ok('직원: 규칙 고침', (await db.query(`update public.recommendation_rules set note = note where version = 'V2.1'`)).affectedRows === 1));
await as(null, async () => {
  try {
    await db.query(`select 1 from public.recommendation_rules`);
    fails.push('익명: 규칙 막혀야 함');
  } catch (e) {
    ok('익명: 규칙 못 읽음', /permission denied/.test(e.message));
  }
});

// 권한을 거둔 뒤에도 트리거는 돈다: 등록 신청(가입 시 신청 행), 지점 계정(연락처만 본인이, 상태는 직원만)
const NEW = '00000000-0000-0000-0000-0000000000f3';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${NEW}', 'new@example.com', '{"portal":"partner","agency_name":"새유학","branch":"부산"}')`);
ok('가입하면 등록 신청이 생김(트리거)', (await q(`select agency_name, branch, status from public.agency_requests where user_id = '${NEW}'`))[0]?.agency_name === '새유학');
await as(U.partner, async () => {
  ok('에이전시: 연락처 고침', (await db.query(`update public.agency_members set contact_name = '김담당' where user_id = '${U.partner}'`)).affectedRows === 1);
  try {
    await db.query(`update public.agency_members set agency_name = '바꾼이름' where user_id = '${U.partner}'`);
    fails.push('에이전시: 에이전시명 막혀야 함');
  } catch (e) {
    ok('에이전시: 에이전시명 못 고침(트리거)', /연락처와 화면 설정만/.test(e.message), e.message);
  }
});
await as(U.staff, async () => ok('직원: 지점 정지', (await db.query(`update public.agency_members set status = 'suspended' where user_id = '${U.partner}'`)).affectedRows === 1));
ok('고친 시각을 트리거가 넣음', (await q(`select updated_at from public.agency_members where user_id = '${U.partner}'`))[0]?.updated_at != null);

console.log(`파트너 추천 조건표 v2.1 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
