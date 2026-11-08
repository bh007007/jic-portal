// 강사 포털(LMS) 마이그레이션(20261108200000_teacher_portal.sql)의 권한 시험.
// student_intranet_rls.mjs 와 같은 방식: PGlite(실제 Postgres)에 Supabase 흉내를 만들고, 마이그레이션을 두 번 실행한 뒤 역할별로 읽기·쓰기를 본다. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/teacher_portal_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql']) await db.exec(mig(f));
await db.exec(mig('20261108200000_teacher_portal.sql'));
await db.exec(mig('20261108200000_teacher_portal.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  teacher: '00000000-0000-0000-0000-0000000000a1',
  teacher2: '00000000-0000-0000-0000-0000000000a2',
  manager: '00000000-0000-0000-0000-0000000000b1',
  staff: '00000000-0000-0000-0000-0000000000c1',
  student: '00000000-0000-0000-0000-0000000000d1',
  nobody: '00000000-0000-0000-0000-0000000000e1',
};
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜(UTC+8)
const plus = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.user_roles (user_id, role) values ('${U.teacher}', 'teacher'), ('${U.teacher2}', 'teacher'), ('${U.manager}', 'manager');
  insert into public.staff (user_id, name) values ('${U.teacher}', 'Teacher Ann');
  insert into public.legacy_enrollments (id, data) values
    ('tr1', '{"tr_st_id":"1001","st_name":"KIM A","st_country_name":"한국","first_co_ca_code":"PREMIUM","courses":"ESL(4w)","tr_start_date":"${plus(today, -7)}","tr_finish_date":"${plus(today, 20)}","tr_state_name":"인보이스승인","tr_pick_flight_num":"secret"}'),
    ('tr2', '{"tr_st_id":"1002","st_name":"LEE B","first_co_ca_code":"CHALLENGER","tr_start_date":"${plus(today, 10)}","tr_finish_date":"${plus(today, 40)}","tr_state_name":"인보이스승인"}'),
    ('tr3', '{"tr_st_id":"1003","st_name":"OLD C","tr_start_date":"2025-01-01","tr_finish_date":"2025-02-01","tr_state_name":"인보이스승인"}'),
    ('tr4', '{"tr_st_id":"1004","st_name":"CANCEL D","tr_start_date":"${plus(today, -3)}","tr_finish_date":"${plus(today, 30)}","tr_state_name":"캔슬"}');
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
const count = async (sql) => Number((await one(sql)).n);
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
const PERM = /permission denied/;

// ── 역할과 학생 목록
await as(U.teacher, async () => {
  ok('강사 역할', (await one(`select my_roles() r`)).r.join() === 'teacher');
  ok('강사는 강사 포털 사용자', (await one(`select is_lms_user() v`)).v === true);
  ok('강사는 관리 권한 없음', (await one(`select is_lms_manager() v`)).v === false);
  const list = await q(`select * from lms_students()`);
  ok('학생 목록: 재학·30일 안 입학만, 취소 제외', list.map((r) => r.student_no).sort().join() === '1001,1002', JSON.stringify(list.map((r) => r.student_no)));
  ok('학생 목록: 캠퍼스 이름', list.find((r) => r.student_no === '1001')?.campus === 'Premium');
  ok('학생 목록: 항공편 같은 열은 없음', !('tr_pick_flight_num' in (list[0] ?? {})));
  ok('강사는 업체 원본을 직접 못 읽음(RLS 0행)', (await count(`select count(*) n from legacy_enrollments`)) === 0);
  await denied('강사는 역할을 못 줌', `insert into user_roles (user_id, role) values ('${U.nobody}', 'manager')`, RLS);
});
await as(U.nobody, async () => {
  ok('역할 없으면 학생 목록 0', (await q(`select * from lms_students()`)).length === 0);
  ok('역할 없으면 시험 종류 못 봄', (await count(`select count(*) n from test_types`)) === 0);
});
await as(U.staff, async () => {
  ok('직원도 강사 포털 사용자·관리자', (await one(`select is_lms_user() a, is_lms_manager() b`)).b === true);
  ok('직원이 역할 부여', (await affected(`insert into user_roles (user_id, role) values ('${U.nobody}', 'checker')`)) === 1);
});

// ── 시험 종류·CEFR
await as(U.teacher, async () => {
  ok('기본 시험 종류(IELTS·TOEIC)', (await count(`select count(*) n from test_types`)) === 2);
  await denied('강사는 시험 종류 못 더함', `insert into test_types (code, name, scale, max_value) values ('esl', 'ESL', 'level', 10)`, RLS);
});
await as(U.manager, async () => {
  ok('매니저가 시험 종류 추가', (await affected(`insert into test_types (code, name, scale, min_value, max_value, step) values ('esl_level', 'ESL 레벨', 'level', 1, 12, 1)`)) === 1);
  ok('매니저가 CEFR 대응 입력', (await affected(`insert into cefr_mappings (test_type, cefr, min_value) values ('ielts', 'B2', 5.5)`)) === 1);
});
await as(U.student, async () => ok('학생은 CEFR 대응을 읽음', (await count(`select count(*) n from cefr_mappings`)) === 1));

// ── 성적
const r1 = await as(U.teacher, async () => {
  const r = await one(`insert into test_results (student_no, enrollment_id, test_type, test_date, section, value) values ('1001', 'tr1', 'ielts', '${today}', 'Speaking', 6.5) returning id, teacher_name, teacher_id`);
  ok('강사 성적 입력, 기록자 이름은 서버가', r.teacher_name === 'Teacher Ann' && r.teacher_id === U.teacher, JSON.stringify(r));
  await denied('범위 밖 점수', `insert into test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr1', 'ielts', '${today}', 9.5)`, /invalid_value/);
  await denied('단위 밖 점수(0.5 단위)', `insert into test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr1', 'ielts', '${today}', 6.3)`, /invalid_value/);
  await denied('없는 영역', `insert into test_results (student_no, enrollment_id, test_type, test_date, section, value) values ('1001', 'tr1', 'ielts', '${today}', 'Grammar', 6)`, /invalid_section/);
  await denied('미래 날짜', `insert into test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr1', 'ielts', '${plus(today, 2)}', 6)`, /invalid_date/);
  await denied('다른 학생 연수', `insert into test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr2', 'ielts', '${today}', 6)`, RLS);
  return r.id;
});
await as(U.teacher2, async () => {
  ok('다른 강사도 성적을 봄', (await count(`select count(*) n from test_results`)) === 1);
  ok('다른 강사는 남의 성적을 못 고침', (await affected(`update test_results set value = 7 where id = '${r1}'`)) === 0);
});
await as(U.manager, async () => ok('매니저는 고침', (await affected(`update test_results set value = 7 where id = '${r1}'`)) === 1));
await as(U.student, async () => {
  ok('학생은 자기 성적을 봄', (await count(`select count(*) n from test_results`)) === 1);
  await denied('학생은 성적 입력 못 함', `insert into test_results (student_no, enrollment_id, test_type, test_date, value) values ('1001', 'tr1', 'ielts', '${today}', 9)`, RLS);
});

// ── 수업 자료
const m1 = await as(U.teacher, async () => {
  const r = await one(`insert into materials (course, textbook, unit, kind, title, url) values ('ESL', 'Book 1', 'Unit 1', 'worksheet', 'Unit 1 Worksheet', 'https://drive.google.com/x') returning id, created_by_name, student_visible`);
  ok('강사 자료 등록(기본 비공개)', r.created_by_name === 'Teacher Ann' && r.student_visible === false);
  await denied('https 아닌 링크', `insert into materials (course, title, url) values ('ESL', 'x', 'http://x')`, /check constraint/);
  return r.id;
});
await as(U.teacher2, async () => ok('다른 강사는 남의 자료를 못 지움', (await affected(`delete from materials where id = '${m1}'`)) === 0));
await as(U.student, async () => ok('학생은 자료 목차를 못 봄(공개 미결정)', (await count(`select count(*) n from materials`)) === 0));

// ── 강사 목록
await as(U.teacher, async () => {
  ok('강사는 강사 목록을 봄', (await count(`select count(*) n from staff`)) === 1);
  await denied('강사는 강사 목록을 못 고침', `insert into staff (name) values ('X')`, RLS);
});
await as(U.manager, async () => ok('매니저가 강사 등록', (await affected(`insert into staff (name, legacy_id) values ('Teacher Ben', 'te-9')`)) === 1));

await as(null, async () => {
  await denied('익명 학생 목록', `select * from lms_students()`, PERM);
  await denied('익명 성적', `select * from test_results`, PERM);
});

console.log(`통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
