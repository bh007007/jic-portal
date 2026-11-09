// 역할별 권한표(docs/roles.md, 11/9 승인) 마이그레이션(20261109010000_roles.sql)의 강사 포털 쪽 권한 시험.
// 관리자·오피스 구분, 성적 입력·자료 등록(강사·매니저·관리자), 강사 포털 관리(매니저·관리자), 출석 입력, 내부 공지 보기. 데이터는 전부 가짜.
// 계정 목록·역할 주기는 user_directory_rls.mjs 가 본다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/roles_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql', '20261108200000_teacher_portal.sql', '20261109000000_attendance.sql']) await db.exec(mig(f));
await db.exec(mig('20261109010000_roles.sql'));
await db.exec(mig('20261109010000_roles.sql')); // 두 번째 실행
// 성능 정리(20261110143500_perf_policies_indexes.sql: 정책의 auth.uid() → (select auth.uid()), 외래 키 인덱스)를 먼저 적용한다. 아래 성적·자료 쓰기 시험이 뜻이 그대로인지 같이 본다
await db.exec(mig('20261110143500_perf_policies_indexes.sql'));
await db.exec(mig('20261110143500_perf_policies_indexes.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  admin: '00000000-0000-0000-0000-0000000000c1', // 역할 없는 직원 = 관리자
  office: '00000000-0000-0000-0000-0000000000c2',
  teacher: '00000000-0000-0000-0000-0000000000a1',
  checker: '00000000-0000-0000-0000-0000000000a3',
  scheduler: '00000000-0000-0000-0000-0000000000a4',
  manager: '00000000-0000-0000-0000-0000000000b1',
  premium: '00000000-0000-0000-0000-0000000000a5', // Premium 강사
  student: '00000000-0000-0000-0000-0000000000d1',
};
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const plus = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const S1 = '10000000-0000-0000-0000-000000000001';
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.admin}', '관리자'), ('${U.office}', '오피스');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.user_roles (user_id, role, campus) values ('${U.office}', 'office', ''), ('${U.teacher}', 'teacher', ''), ('${U.checker}', 'checker', ''),
    ('${U.scheduler}', 'scheduler', ''), ('${U.manager}', 'manager', ''), ('${U.premium}', 'teacher', 'Premium');
  insert into public.staff (user_id, name) values ('${U.teacher}', 'Ann'), ('${U.premium}', 'Pia');
  insert into public.legacy_enrollments (id, data) values
    ('tr1', '{"tr_st_id":"1001","st_name":"KIM A","first_co_ca_code":"PREMIUM","tr_start_date":"${plus(today, -7)}","tr_finish_date":"${plus(today, 20)}","tr_state_name":"인보이스승인"}');
  insert into public.class_sessions (id, day, start_time, campus) values ('${S1}', '${today}', '09:00', 'Premium');
  insert into public.attendance (session_id, student_no) values ('${S1}', '1001');
  insert into public.internal_notices (title, content, campus, author_name) values ('전체 공지', '내용', '', '관리자'), ('Premium 공지', '내용', 'Premium', '관리자'), ('MCO 공지', '내용', 'MCO', '관리자');
  insert into public.internal_notices (title, content, campus, author_name, until_date) values ('지난 공지', '내용', '', '관리자', '${plus(today, -1)}');
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
const one = async (sql) => (await q(sql))[0];
const affected = async (sql) => (await db.query(sql)).affectedRows ?? 0;
async function denied(name, sql, pattern) {
  try {
    await db.query(sql);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}
const RLS = /row-level security|violates row-level/;
const flags = async () => one(`select public.is_admin() a, public.is_lms_manager() m, public.is_lms_writer() w, public.is_lms_user() u`);
const score = `insert into public.test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr1', 'toeic', '${today}', 700)`;
const material = `insert into public.materials (course, title, url) values ('ESL', 'Unit 1', 'https://drive.google.com/x')`;
const testType = `insert into public.test_types (code, name, scale, max_value) values ('t_' || substr(md5(random()::text), 1, 6), 'X', 'score', 100)`;
const mark = `update public.attendance set result = 'AT' where session_id = '${S1}'`;

// ── 판단 함수
await as(U.admin, async () => { const f = await flags(); ok('관리자(역할 없는 직원): 관리자·매니저·쓰기', f.a && f.m && f.w && f.u); });
await as(U.office, async () => { const f = await flags(); ok('오피스: 읽기만', !f.a && !f.m && !f.w && f.u, JSON.stringify(f)); });
await as(U.teacher, async () => { const f = await flags(); ok('강사: 쓰기', !f.a && !f.m && f.w && f.u); });
await as(U.checker, async () => { const f = await flags(); ok('체커: 쓰기 없음', !f.m && !f.w && f.u); });
await as(U.scheduler, async () => { const f = await flags(); ok('스케줄러: 쓰기 없음', !f.m && !f.w && f.u); });
await as(U.manager, async () => { const f = await flags(); ok('매니저: 관리·쓰기', !f.a && f.m && f.w); });

// ── 성적·자료·시험 종류
for (const [who, can] of [['teacher', true], ['manager', true], ['admin', true], ['checker', false], ['scheduler', false], ['office', false]]) {
  await as(U[who], async () => {
    if (can) {
      ok(`${who}: 성적 입력`, (await affected(score)) === 1);
      ok(`${who}: 자료 등록`, (await affected(material)) === 1);
    } else {
      await denied(`${who}: 성적 입력 거부`, score, RLS);
      await denied(`${who}: 자료 등록 거부`, material, RLS);
    }
    ok(`${who}: 성적 읽기`, (await q(`select * from public.test_results`)).length > 0);
    ok(`${who}: 학생 목록`, (await q(`select * from public.lms_students()`)).length === 1);
  });
}
await as(U.office, async () => {
  await denied('오피스: 시험 종류 추가 거부', testType, RLS);
  ok('오피스: 남의 성적 고치기 0행', (await affected(`update public.test_results set note = 'x'`)) === 0);
  ok('오피스: 자료 지우기 0행', (await affected(`delete from public.materials`)) === 0);
});
await as(U.manager, async () => ok('매니저: 시험 종류 추가', (await affected(testType)) === 1));
await as(U.admin, async () => ok('관리자: 시험 종류 추가', (await affected(testType)) === 1));
await as(U.teacher, async () => await denied('강사: 시험 종류 추가 거부', testType, RLS));
await as(U.manager, async () => ok('매니저: 남의 성적 고치기', (await affected(`update public.test_results set note = 'checked'`)) >= 3));

// ── 출석: 오피스는 못 넣고 마감도 못 한다(매니저·관리자·체커는 넣음)
await as(U.office, async () => {
  ok('오피스: 출석 0행', (await affected(mark)) === 0);
  await denied('오피스: 마감 거부', `insert into public.attendance_closings (day, campus) values ('${today}', 'Premium')`, RLS);
  ok('오피스: 출석 읽기', (await q(`select * from public.attendance`)).length === 1);
});
await as(U.checker, async () => ok('체커: 출석', (await affected(mark)) === 1));
await as(U.admin, async () => ok('관리자: 출석', (await affected(mark)) === 1));

// ── 내부 공지(강사 포털)
await as(U.teacher, async () => {
  const t = (await q(`select title from public.lms_notices()`)).map((r) => r.title);
  ok('강사(모든 캠퍼스): 게시 중 공지 3개', t.length === 3 && !t.includes('지난 공지'), JSON.stringify(t));
});
await as(U.premium, async () => {
  const t = (await q(`select title from public.lms_notices()`)).map((r) => r.title).sort();
  ok('Premium 강사: 전체 + Premium', JSON.stringify(t) === JSON.stringify(['Premium 공지', '전체 공지']), JSON.stringify(t));
});
await as(U.office, async () => ok('직원(오피스): 공지 3개', (await q(`select * from public.lms_notices()`)).length === 3));
await as(U.student, async () => ok('학생: 공지 0', (await q(`select * from public.lms_notices()`)).length === 0));
await as(U.teacher, async () => ok('강사: 공지 표 직접 읽기 0행', (await q(`select * from public.internal_notices`)).length === 0));
await as(null, async () => await denied('익명: 공지 함수 거부', `select * from public.lms_notices()`, /permission denied/));
await as(null, async () => await denied('익명: is_admin 거부', `select public.is_admin()`, /permission denied/));

console.log(`역할 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
