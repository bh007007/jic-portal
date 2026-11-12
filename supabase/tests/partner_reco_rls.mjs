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
// 성능 정리(20261110143500_perf_policies_indexes.sql: 정책의 auth.uid() → (select auth.uid()), 외래 키 인덱스)를 먼저 적용한다. 아래 지점 계정 시험이 뜻이 그대로인지 같이 본다
await db.exec(mig('20261110143500_perf_policies_indexes.sql'));
await db.exec(mig('20261110143500_perf_policies_indexes.sql')); // 두 번째 실행
// 국가별 콘텐츠(CL-036): 노출 국가·국가별 우선 순서, 정책에서 다른 나라 항목을 막는다
await db.exec(mig('20261110163500_partner_country_targeting.sql'));
await db.exec(mig('20261110163500_partner_country_targeting.sql')); // 두 번째 실행
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

// 국가별 콘텐츠(CL-036): 지점은 '모든 국가'와 자기 나라 항목만 읽는다(정책). 직원은 모두
await as(U.staff, () => db.exec(`update public.agency_members set country = '한국' where user_id = '${U.partner}'`));
await db.exec(`
  insert into public.partner_notices (kind, tag, title, published, countries, country_order) values
    ('notice', '안내', '모든 나라 공지', true, '{}', '{}'),
    ('notice', '안내', '한국 공지', true, '{한국}', '{"한국": 1}'),
    ('notice', '안내', '일본 공지', true, '{일본,대만}', '{}');
  insert into public.partner_resources (category, title, countries) values
    ('가격표', '모든 나라 자료', '{}'), ('가격표', '한국 자료', '{한국}'), ('가격표', '베트남 자료', '{베트남}');
`);
const titles = async (t) => (await q(`select title from public.${t} where title like '%나라%' or title like '%한국%' or title like '%일본%' or title like '%베트남%' order by id`)).map((r) => r.title).join(',');
await as(U.partner, async () => {
  ok('한국 지점: 공지는 모든 나라·한국만', (await titles('partner_notices')) === '모든 나라 공지,한국 공지', await titles('partner_notices'));
  ok('한국 지점: 자료는 모든 나라·한국만', (await titles('partner_resources')) === '모든 나라 자료,한국 자료', await titles('partner_resources'));
  ok('한국 지점: 내 나라 = 한국', (await q(`select public.partner_country() c`))[0].c === '한국');
  ok('한국 지점: 우선 순서 읽힘', (await q(`select country_order->>'한국' o from public.partner_notices where title = '한국 공지'`))[0]?.o === '1');
});
await as(U.pending, async () => {
  ok('승인 전 계정: 공지·자료 0', (await titles('partner_notices')) === '' && (await titles('partner_resources')) === '');
  ok('승인 전 계정: 내 나라 없음', (await q(`select public.partner_country() c`))[0].c === null);
});
await as(U.staff, async () => ok('직원: 나라와 상관없이 모두', (await titles('partner_notices')).split(',').length === 3 && (await titles('partner_resources')).split(',').length === 3));
await as(U.staff, () => db.exec(`update public.agency_members set country = null where user_id = '${U.partner}'`));
await as(U.partner, async () => ok('국가 없는 지점: 모든 나라 항목만', (await titles('partner_notices')) === '모든 나라 공지'));
await as(U.staff, () => db.exec(`update public.agency_members set country = '한국' where user_id = '${U.partner}'`));
try {
  await db.exec(`insert into public.partner_notices (kind, tag, title, country_order) values ('notice', '안내', '잘못된 순서', '[1,2]')`);
  fails.push('우선 순서는 객체만 받아야 함');
} catch {
  ok('우선 순서는 객체만', true);
}
const anonFn = (await q(`select has_function_privilege('anon', 'public.partner_country()', 'execute') a`))[0].a;
ok('partner_country(): 익명 실행 불가', !anonFn);

// 방문 신청·학습계획서 기록(정책을 (select auth.uid()) 로 바꾼 뒤에도 같은 뜻인지): 본인 것만 넣고 읽는다
const fails0 = async (sql) => db.query(sql).then(() => false, () => true);
await as(U.partner, async () => {
  ok('에이전시: 방문 신청', (await db.query(`insert into public.visit_requests (visit_date, people, purpose) values ('2026-12-01', 2, '시설 견학')`)).affectedRows === 1);
  ok('에이전시: 확정 상태로는 못 넣음', await fails0(`insert into public.visit_requests (visit_date, people, purpose, status) values ('2026-12-02', 1, 'x', 'confirmed')`));
  ok('에이전시: 다른 지점 이름으로 못 넣음', await fails0(`insert into public.visit_requests (member_id, visit_date, people, purpose) values ('${U.pending}', '2026-12-03', 1, 'x')`));
  ok('에이전시: 내 방문 신청 1건', (await q(`select 1 from public.visit_requests`)).length === 1);
  ok('에이전시: 학습계획서 기록', (await db.query(`insert into public.plan_downloads (course_id) values ('p-esl')`)).affectedRows === 1);
});
await as(U.pending, async () => {
  ok('승인 전 계정: 방문 신청 0건', (await q(`select 1 from public.visit_requests`)).length === 0);
  ok('승인 전 계정: 학습계획서 기록 못 함', await fails0(`insert into public.plan_downloads (course_id) values ('p-esl')`));
  ok('승인 전 계정: 내 신청만(0건)', (await q(`select 1 from public.agency_requests`)).length === 0);
});
await as(U.staff, async () => ok('직원: 방문 신청 전체', (await q(`select 1 from public.visit_requests`)).length === 1));

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

// Speaking 단계 수업 구성(CL-070, 20261112190000_speaking_lessons.sql): 관리자 입력은 그대로, v2.1 값만 바꿈, 2회 실행
await db.exec(mig('20261112190000_speaking_lessons.sql'));
ok('CL-070: 관리자가 넣은 단계는 그대로', (await q(`select levels from public.courses where id = 'p-speaking'`))[0].levels[0].lessons === '관리자 입력');
const v21 = mig('20261109153000_partner_reco_v21.sql').split('\r\n').join('\n').match(/set levels = \$lv\$(\[.*?\])\$lv\$::jsonb, updated_at = now\(\)\n {2}where id = 'p-speaking'/)[1];
await db.exec(`update public.courses set levels = $lv$${v21.replace('"MASTER","lessons":"1:1 6개"', '"MASTER","lessons":"관리자 MASTER"')}$lv$::jsonb where id = 'p-speaking'`);
await db.exec(mig('20261112190000_speaking_lessons.sql'));
await db.exec(mig('20261112190000_speaking_lessons.sql')); // 두 번째 실행
const sp = (await q(`select levels from public.courses where id = 'p-speaking'`))[0].levels;
ok('CL-070: STARTER 7타임', sp[0].name === 'STARTER' && sp[0].lessons === '7타임 (1:1 4 + 그룹 1 + 옵션 2)', JSON.stringify(sp[0]));
ok('CL-070: PRO 8타임', sp[1].name === 'PRO' && sp[1].lessons === '8타임 (1:1 5 + 그룹 1 + 옵션 2)', JSON.stringify(sp[1]));
ok('CL-070: 관리자가 고친 MASTER 는 그대로', sp[2].name === 'MASTER' && sp[2].lessons === '관리자 MASTER', JSON.stringify(sp[2]));
ok('CL-070: 강도·포함 내용·순서 그대로', sp.map((l) => l.intensity).join() === '집중,집중,고강도' && sp[1].includes === 'STARTER + Speaking Clinic');
await db.exec(`update public.courses set levels = $lv$${v21}$lv$::jsonb where id = 'p-speaking'`);
await db.exec(mig('20261112190000_speaking_lessons.sql'));
ok('CL-070: MASTER 8타임', (await q(`select levels from public.courses where id = 'p-speaking'`))[0].levels[2].lessons === '8타임 (1:1 6 + 옵션 2)');
ok('CL-070: 다른 코스는 그대로', (await q(`select levels from public.courses where id = 'p-senior'`))[0].levels[0].lessons === '5교시 (1:1 정규 3 + 옵션 2)');

console.log(`파트너 추천 조건표 v2.1 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
