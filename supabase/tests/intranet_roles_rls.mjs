// 인트라넷 역할 2단계 A(20261109070000_intranet_roles.sql)의 권한 시험: 패널티 점수표 쓰기와 접근 기록 보기는 관리자만(docs/roles.md, 11/9 승인).
// 관리자 = 직원이면서 admin 역할이 있거나 office 역할이 없는 사람(is_admin, 20261109010000_roles.sql). 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/intranet_roles_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql', '20261108200000_teacher_portal.sql', '20261109000000_attendance.sql', '20261109010000_roles.sql']) await db.exec(mig(f));
await db.exec(mig('20261109070000_intranet_roles.sql'));
await db.exec(mig('20261109070000_intranet_roles.sql')); // 두 번째 실행
await db.exec(mig('20261110103000_intranet_decisions_2.sql')); // 11/10 I16: 맡은 캠퍼스는 user_roles(관리자 모든 캠퍼스)
ok('마이그레이션 2회 실행', true);

const U = {
  admin: '00000000-0000-0000-0000-0000000000c1', // 역할 없는 직원 = 관리자
  adminRole: '00000000-0000-0000-0000-0000000000c2', // admin + office 역할 = 관리자
  office: '00000000-0000-0000-0000-0000000000c3', // 오피스(Challenger)
  manager: '00000000-0000-0000-0000-0000000000b1', // 강사 포털 매니저(직원 아님)
  guard: '00000000-0000-0000-0000-0000000000e1',
};
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.admin}', '관리자'), ('${U.adminRole}', '관리자2'), ('${U.office}', '오피스');
  insert into public.staff_campuses values ('${U.admin}', 'Challenger'), ('${U.adminRole}', 'Challenger'), ('${U.office}', 'Challenger');
  insert into public.user_roles (user_id, role, campus) values ('${U.adminRole}', 'admin', ''), ('${U.adminRole}', 'office', 'Challenger'), ('${U.office}', 'office', 'Challenger'), ('${U.manager}', 'manager', '');
  insert into public.guard_accounts values ('${U.guard}', 'Challenger', 'Challenger 정문');
  insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus)
    values ('${U.admin}', '관리자', 'view', 'counseling', 'x', '1001', 'Challenger');
`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const affected = async (sql) => (await db.query(sql)).affectedRows ?? 0;
const score = async () => (await q(`select score from penalty_rules where code = 'curfew'`))[0]?.score ?? null;

// ── 점수표: 직원 읽기, 고치기는 관리자만
await as(U.office, async () => {
  ok('오피스: 점수표 읽기(종류 6개, I7)', (await q(`select count(*)::int n from penalty_rules`))[0].n === 6 && (await q(`select count(*)::int n from penalty_stages`))[0].n === 3);
  ok('오피스: 점수 고치기는 0행', (await affected(`update penalty_rules set score = 9 where code = 'curfew'`)) === 0);
  ok('오피스: 경고 기준 고치기는 0행', (await affected(`update penalty_stages set min_score = 9 where stage = 1`)) === 0);
});
ok('오피스가 고친 점수는 남지 않음', (await score()) === null);
await as(U.admin, async () => ok('관리자(역할 없음): 점수 고치기', (await affected(`update penalty_rules set score = 3 where code = 'curfew'`)) === 1));
await as(U.adminRole, async () => ok('관리자(admin + office): 경고 기준 고치기', (await affected(`update penalty_stages set min_score = 5 where stage = 1`)) === 1));
ok('관리자가 고친 점수', (await score()) === 3);
await as(U.manager, async () => ok('매니저(직원 아님): 점수표 안 보임', (await q(`select count(*)::int n from penalty_rules`))[0].n === 0));
await as(U.guard, async () => ok('가드: 점수표 안 보임', (await q(`select count(*)::int n from penalty_rules`))[0].n === 0));

// ── 접근 기록: 관리자이면서 맡은 캠퍼스만
await as(U.admin, async () => ok('관리자: 접근 기록 읽기', (await q(`select count(*)::int n from audit_logs`))[0].n === 1));
await as(U.adminRole, async () => ok('관리자(admin + office): 접근 기록 읽기', (await q(`select count(*)::int n from audit_logs`))[0].n === 1));
await as(U.office, async () => ok('오피스: 접근 기록 안 보임', (await q(`select count(*)::int n from audit_logs`))[0].n === 0));
await as(U.manager, async () => ok('매니저: 접근 기록 안 보임', (await q(`select count(*)::int n from audit_logs`))[0].n === 0));
await db.exec(`insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus) values ('${U.admin}', '관리자', 'view', 'counseling', 'y', '2001', 'Premium')`);
await as(U.admin, async () => ok('관리자(staff_campuses 는 Challenger 만): 모든 캠퍼스 접근 기록(I16)', (await q(`select count(*)::int n from audit_logs`))[0].n === 2));
await as(U.office, async () => ok('오피스: 여전히 접근 기록 안 보임', (await q(`select count(*)::int n from audit_logs`))[0].n === 0));

// ── 오피스도 패널티 승인·외출 기록은 그대로(직원)
await as(U.office, async () => {
  await q(`insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('curfew-x', '1001', 'curfew', '2026-11-08', 'Challenger', '통금', 'outing', 'x')`);
  ok('오피스: 패널티 승인', (await affected(`update penalties set status = 'approved', score = 3 where id = 'curfew-x'`)) === 1);
});

console.log(`인트라넷 역할 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
