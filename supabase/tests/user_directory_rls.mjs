// 관리자 포털 '사용자·권한'용 계정 목록(20261108210000_user_directory.sql) 권한 시험.
// PGlite(실제 Postgres)에 Supabase 흉내를 만들고 직원·강사·학생·에이전시·가드 계정을 넣은 뒤, 직원만 목록을 보는지와 역할 부여·회수를 본다. 데이터는 전부 가짜.
//
// 실행(저장소 루트):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/user_directory_rls.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));

// Supabase 흉내: auth.users 의 실제 열 일부와 storage(파트너 포털 마이그레이션이 버킷·정책을 만든다)
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
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261108100000_student_intranet.sql', '20261108200000_teacher_portal.sql']) await db.exec(mig(f));
await db.exec(mig('20261108210000_user_directory.sql'));
await db.exec(mig('20261108210000_user_directory.sql')); // 두 번째 실행
await db.exec(mig('20261108230000_holidays.sql'));
await db.exec(mig('20261108230000_holidays.sql'));
// 역할별 권한표(11/9): 관리자·오피스 구분, 계정 목록은 관리자만
for (const f of ['20261109010000_roles.sql', '20261109020000_user_directory_admin.sql']) {
  await db.exec(mig(f));
  await db.exec(mig(f)); // 두 번째 실행
}
ok('마이그레이션 2회 실행', true);

const U = {
  staff: '00000000-0000-0000-0000-0000000000c1',
  teacher: '00000000-0000-0000-0000-0000000000a1',
  student: '00000000-0000-0000-0000-0000000000d1',
  agent: '00000000-0000-0000-0000-0000000000f1',
  guard: '00000000-0000-0000-0000-0000000000e1',
  fresh: '00000000-0000-0000-0000-0000000000b9', // 역할 없는 새 계정
  office: '00000000-0000-0000-0000-0000000000c2', // 오피스 직원
  boss: '00000000-0000-0000-0000-0000000000c3', // 오피스 + 관리자 역할
};
await db.exec(`
  insert into auth.users (id, email) values
    ('${U.staff}', 'staff@example.com'), ('${U.teacher}', 'teacher@example.com'), ('${U.student}', '1001@students.jic.internal'),
    ('${U.agent}', 'agent@example.com'), ('${U.guard}', 'gate@example.com'), ('${U.fresh}', 'new@example.com'),
    ('${U.office}', 'office@example.com'), ('${U.boss}', 'boss@example.com');
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원'), ('${U.office}', '오피스'), ('${U.boss}', '실장');
  insert into public.user_roles (user_id, role) values ('${U.office}', 'office'), ('${U.boss}', 'office'), ('${U.boss}', 'admin');
  insert into public.user_roles (user_id, role) values ('${U.teacher}', 'teacher');
  insert into public.user_roles (user_id, role, campus) values ('${U.teacher}', 'checker', 'Premium');
  insert into public.staff (user_id, name) values ('${U.teacher}', 'Teacher Ann');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.agency_members (user_id, email, agency_name, branch) values ('${U.agent}', 'agent@example.com', '샘플유학', '서울');
  insert into public.guard_accounts (user_id, campus, label) values ('${U.guard}', 'Challenger', 'Challenger 정문');
`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async (sql) => (await db.query(sql)).rows;
async function denied(name, sql, pattern) {
  try {
    await db.query(sql);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}

await as(U.staff, async () => {
  const rows = await q(`select * from user_directory()`);
  const by = Object.fromEntries(rows.map((r) => [r.email, r]));
  ok('직원: 학생 뺀 계정 7개', rows.length === 7, JSON.stringify(rows.map((r) => r.email)));
  ok('직원이 맨 앞', rows[0].staff_name != null && rows[1].staff_name != null && rows[2].staff_name != null);
  ok('강사 역할·캠퍼스·강사 이름', by['teacher@example.com'].roles.join() === 'checker:Premium,teacher' && by['teacher@example.com'].teacher_name === 'Teacher Ann', JSON.stringify(by['teacher@example.com']));
  ok('에이전시 지점', by['agent@example.com'].agency === '샘플유학 · 서울');
  ok('가드 출입구', by['gate@example.com'].guard_campus === 'Challenger');
  ok('역할 없는 새 계정도 보임', by['new@example.com'] && by['new@example.com'].roles.length === 0);
  ok('학생 넣기 옵션', (await q(`select * from user_directory(true)`)).length === 8);
  ok('직원이 강사 역할 부여', (await db.query(`insert into user_roles (user_id, role) values ('${U.fresh}', 'manager')`)).affectedRows === 1);
  ok('직원이 역할 회수', (await db.query(`delete from user_roles where user_id = '${U.teacher}' and role = 'checker'`)).affectedRows === 1);
});
// ── 오피스: 계정 목록·역할 주기 불가, 휴일은 쓴다. 오피스 + 관리자 역할이면 관리자.
await as(U.office, async () => {
  ok('오피스: 관리자 아님', (await q(`select public.is_admin() a`))[0].a === false);
  ok('오피스: 계정 목록 0', (await q(`select * from user_directory()`)).length === 0);
  await denied('오피스: 역할 주기 거부', `insert into user_roles (user_id, role) values ('${U.fresh}', 'teacher')`, /row-level security/);
  ok('오피스: 역할 회수 0행', (await db.query(`delete from user_roles where user_id = '${U.fresh}'`)).affectedRows === 0);
  await denied('오피스: 스스로 관리자 역할 거부', `insert into user_roles (user_id, role) values ('${U.office}', 'admin')`, /row-level security/);
  ok('오피스: 휴일 등록', (await db.query(`insert into holidays (day, name) values ('2027-01-02', 'Office test')`)).affectedRows === 1);
  await db.query(`delete from holidays where day = '2027-01-02'`);
});
await as(U.boss, async () => {
  ok('오피스 + 관리자 역할: 관리자', (await q(`select public.is_admin() a`))[0].a === true);
  ok('오피스 + 관리자 역할: 계정 목록', (await q(`select * from user_directory()`)).length === 7);
  ok('관리자: 오피스 역할 주기', (await db.query(`insert into user_roles (user_id, role, campus) values ('${U.staff}', 'office', 'Premium')`)).affectedRows === 1);
});
await as(U.staff, async () => ok('오피스 역할을 받은 직원: 관리자 아님', (await q(`select public.is_admin() a`))[0].a === false));
await as(U.boss, async () => ok('관리자: 오피스 역할 회수', (await db.query(`delete from user_roles where user_id = '${U.staff}' and role = 'office'`)).affectedRows === 1));
await as(U.staff, async () => ok('역할 없는 직원: 다시 관리자', (await q(`select public.is_admin() a`))[0].a === true));
await as(U.teacher, async () => {
  ok('강사: 관리자 아님', (await q(`select public.is_admin() a`))[0].a === false);
  ok('강사는 계정 목록 0', (await q(`select * from user_directory()`)).length === 0);
});
await as(U.agent, async () => ok('에이전시는 계정 목록 0', (await q(`select * from user_directory()`)).length === 0));
await as(null, async () => denied('익명 계정 목록', `select * from user_directory()`, /permission denied/));

// ── 휴일(20261108230000_holidays.sql): 직원만 쓰고, 로그인한 모든 포털이 읽는다
await as(U.staff, async () => {
  ok('직원 휴일 등록(전체 캠퍼스)', (await db.query(`insert into holidays (day, name) values ('2026-12-25', 'Christmas Day')`)).affectedRows === 1);
  ok('직원 휴일 등록(캠퍼스별)', (await db.query(`insert into holidays (day, campus, name, kind) values ('2026-12-26', 'Premium', '학원 휴일', 'school')`)).affectedRows === 1);
  await denied('같은 날 같은 캠퍼스 중복', `insert into holidays (day, name) values ('2026-12-25', 'x')`, /duplicate key/);
});
await as(U.teacher, async () => {
  ok('강사는 휴일을 읽음', (await q(`select * from holidays`)).length === 2);
  await denied('강사는 휴일을 못 씀', `insert into holidays (day, name) values ('2027-01-01', 'New Year')`, /row-level security/);
});
await as(U.student, async () => ok('학생도 휴일을 읽음', (await q(`select * from holidays`)).length === 2));
await as(U.agent, async () => ok('에이전시도 휴일을 읽음', (await q(`select * from holidays`)).length === 2));
await as(U.teacher, async () => ok('강사는 휴일을 못 지움(0행)', (await db.query(`delete from holidays`)).affectedRows === 0));
await as(null, async () => denied('익명 휴일', `select * from holidays`, /permission denied/));

console.log(`통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
