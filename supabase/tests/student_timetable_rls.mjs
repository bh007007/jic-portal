// 학생 앱 시간표 함수(20261109130000_student_timetable.sql)의 권한 시험: 학생 본인 수업만, 강사 메모는 주지 않음, 다른 계정은 빈 결과, 익명은 실행 불가. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/student_timetable_rls.mjs
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
await db.exec(mig('20261109130000_student_timetable.sql'));
await db.exec(mig('20261109130000_student_timetable.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  stA: '00000000-0000-0000-0000-00000000000a', // 학생 1001
  stB: '00000000-0000-0000-0000-00000000000b', // 학생 1002
  staff: '00000000-0000-0000-0000-0000000000c1',
  teacher: '00000000-0000-0000-0000-0000000000a1',
};
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.user_roles (user_id, role) values ('${U.teacher}', 'teacher');
  insert into public.student_users (user_id, student_no) values ('${U.stA}', '1001'), ('${U.stB}', '1002');
  insert into public.staff (id, name, nickname) values ('20000000-0000-4000-8000-000000000001', 'Teacher Full', 'Tess'), ('20000000-0000-4000-8000-000000000002', 'Nick Less', '');
  insert into public.classrooms (id, campus, num) values ('30000000-0000-4000-8000-000000000001', 'Challenger', '305');
  insert into public.class_sessions (id, day, start_time, minutes, campus, kind, subject, teacher_id, classroom_id) values
    ('10000000-0000-4000-8000-000000000001', '2026-11-10', '10:00', 50, 'Challenger', 'G', 'Speaking', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000002', '2026-11-10', '08:00', 50, 'Challenger', '1', 'Grammar', '20000000-0000-4000-8000-000000000002', null),
    ('10000000-0000-4000-8000-000000000003', '2026-12-30', '08:00', 50, 'Challenger', '1', 'Later', null, null);
  insert into public.attendance (session_id, student_no, result, late_min, excused, note) values
    ('10000000-0000-4000-8000-000000000001', '1001', 'TA', 5, false, '비밀 메모'),
    ('10000000-0000-4000-8000-000000000002', '1001', 'AB', null, true, ''),
    ('10000000-0000-4000-8000-000000000001', '1002', 'AT', null, false, ''),
    ('10000000-0000-4000-8000-000000000003', '1001', null, null, false, '');
`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const tt = (from = '2026-11-09', to = '2026-11-15') => db.query(`select * from student_timetable($1, $2)`, [from, to]).then((r) => r.rows);

await as(U.stA, async () => {
  const rows = await tt();
  ok('학생: 본인 수업 2건, 시작 시각 순', rows.map((r) => r.subject).join() === 'Grammar,Speaking', JSON.stringify(rows));
  ok('학생: 강사 부르는 이름(없으면 이름)·교실', rows[1]?.teacher === 'Tess' && rows[1]?.room === '305' && rows[0]?.teacher === 'Nick Less' && rows[0]?.room === '', JSON.stringify(rows));
  ok('학생: 지각 분·사유 인정', rows[1]?.result === 'TA' && rows[1]?.late_min === 5 && rows[0]?.excused === true);
  ok('학생: 강사 메모 열은 없음', rows.every((r) => !('note' in r)) && !JSON.stringify(rows).includes('비밀'));
  ok('학생: 기간이 31일을 넘으면 빈 결과', (await tt('2026-11-01', '2026-12-31')).length === 0);
  ok('학생: 끝이 앞이면 빈 결과', (await tt('2026-11-15', '2026-11-09')).length === 0);
});
await as(U.stB, async () => ok('다른 학생: 자기 수업 1건만', (await tt()).length === 1));
await as(U.staff, async () => ok('직원: 빈 결과(학생 함수)', (await tt()).length === 0));
await as(U.teacher, async () => ok('강사: 빈 결과', (await tt()).length === 0));
await as(null, async () => {
  try {
    await tt();
    fails.push('익명: 막혀야 하는데 성공');
  } catch (e) {
    ok('익명: 실행 불가', /permission denied/.test(e.message), e.message);
  }
});
const fn = (await db.query(`select prosecdef, proconfig from pg_proc where proname = 'student_timetable'`)).rows[0];
ok('security definer, search_path 고정', fn?.prosecdef === true && (fn.proconfig ?? []).some((c) => c.startsWith('search_path=')), JSON.stringify(fn));

console.log(`학생 시간표 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
