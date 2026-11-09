// 강사 포털 CEFR 성장선용 코스 이력(20261109163000_lms_course_timeline.sql) 시험: 연수 시작·코스 변경 순서, 기숙사만 바뀐 행·취소 연수 제외, 강사·직원만.
// 실행(저장소 루트): npm i --no-save @electric-sql/pglite@0.3 && node supabase/tests/lms_course_timeline_rls.mjs
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
`);
for (const f of ['20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql', '20261108200000_teacher_portal.sql']) await db.exec(mig(f));
await db.exec(mig('20261109163000_lms_course_timeline.sql'));
await db.exec(mig('20261109030000_legacy_extend.sql')); // 연장·변경 표 마이그레이션을 뒤에 돌려도 그대로
await db.exec(mig('20261109163000_lms_course_timeline.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = { teacher: '00000000-0000-0000-0000-0000000000a1', staff: '00000000-0000-0000-0000-0000000000c1', student: '00000000-0000-0000-0000-0000000000d1', none: '00000000-0000-0000-0000-0000000000b9' };
const enr = (id, st, start, courses, state = '재학') => `('${id}', '${JSON.stringify({ tr_id: id, tr_st_id: st, tr_start_date: start, tr_finish_date: '2026-12-31', courses, tr_state_name: state })}')`;
const chg = (id, tr, date, prev, next) => `('${id}', '${JSON.stringify({ tr_id: tr, chg_course_date: date, prev_chg_course: prev, chg_course: next, chg_dorm: 'R4' })}')`;
await db.exec(`
  insert into auth.users (id) values ('${U.teacher}'), ('${U.staff}'), ('${U.student}'), ('${U.none}');
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.user_roles (user_id, role) values ('${U.teacher}', 'teacher');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.legacy_enrollments (id, data) values
    ${enr('tr1', '1001', '2026-03-01', 'ESL TEP 8')}, ${enr('tr2', '1001', '2026-09-06', 'Speaking Pro')}, ${enr('tr3', '1001', '2026-10-01', 'IELTS', '캔슬')}, ${enr('tr9', '2002', '2026-03-01', 'ESL')};
  insert into public.legacy_course_changes (id, data) values
    ${chg('c1', 'tr1', '2026-04-19', 'ESL TEP 8', 'ESL TEP 9')}, ${chg('c2', 'tr1', '2026-05-03', 'ESL TEP 9', 'ESL TEP 9')}, ${chg('c3', 'tr3', '2026-10-10', 'IELTS', 'ESL')}, ${chg('c4', 'tr9', '2026-04-01', 'ESL', 'TOEIC')};
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
const fmt = (rows) => rows.map((r) => `${new Date(r.day).toISOString().slice(0, 10)} ${r.kind} ${r.course}${r.prev_course ? ' <- ' + r.prev_course : ''}`);

await as(U.teacher, async () => {
  const rows = fmt(await q(`select * from lms_course_timeline('1001')`));
  ok('강사: 시작·변경·다음 연수 순서', rows.join(' | ') === '2026-03-01 start ESL TEP 8 | 2026-04-19 change ESL TEP 9 <- ESL TEP 8 | 2026-09-06 start Speaking Pro', rows.join(' | '));
  ok('기숙사만 바뀐 변경 행 제외', !rows.some((r) => r.startsWith('2026-05-03')));
  ok('취소 연수와 그 변경 제외', !rows.some((r) => r.includes('IELTS') || r.startsWith('2026-10-10')));
  ok('다른 학생 것은 안 섞임', !rows.some((r) => r.includes('TOEIC')));
});
await as(U.staff, async () => ok('직원도 읽음', (await q(`select * from lms_course_timeline('1001')`)).length === 3));
await as(U.student, async () => ok('학생 계정: 0행', (await q(`select * from lms_course_timeline('1001')`)).length === 0));
await as(U.none, async () => ok('역할 없는 계정: 0행', (await q(`select * from lms_course_timeline('1001')`)).length === 0));
await as(U.teacher, async () => {
  try {
    await db.query(`select * from public.legacy_course_changes`);
    ok('강사: 원본 표 직접 읽기 0행', (await q(`select * from public.legacy_course_changes`)).length === 0);
  } catch (e) {
    ok('강사: 원본 표 직접 읽기 막힘', /permission denied/.test(e.message));
  }
});
await as(null, async () => {
  try {
    await db.query(`select * from lms_course_timeline('1001')`);
    fails.push('익명: 막혀야 함');
  } catch (e) {
    ok('익명: 함수 못 부름', /permission denied/.test(e.message));
  }
});

console.log(`코스 이력(성장선) 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
