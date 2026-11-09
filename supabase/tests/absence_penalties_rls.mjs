// 무단결석 패널티 후보 마이그레이션(20261109050000_absence_penalties.sql)의 권한 시험.
// 인트라넷이 강사 포털 출석의 결석을 읽는 함수(intranet_absence_marks)는 직원만 받고, 패널티 출처에 'attendance'가 생긴다.
// 자동 확인(크론)용 intranet_absence_marks_service(20261109180000_intranet_cron.sql)는 서비스 키만 받는다. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/absence_penalties_rls.mjs
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
await db.exec(mig('20261109050000_absence_penalties.sql'));
await db.exec(mig('20261109050000_absence_penalties.sql')); // 두 번째 실행
await db.exec(mig('20261109180000_intranet_cron.sql'));
await db.exec(mig('20261109180000_intranet_cron.sql')); // 두 번째 실행(자동 확인용 서비스 키 전용 함수)
ok('마이그레이션 2회 실행', true);

const U = {
  admin: '00000000-0000-0000-0000-0000000000c1', // 역할 없는 직원 = 관리자
  office: '00000000-0000-0000-0000-0000000000c2', // 오피스 직원
  teacher: '00000000-0000-0000-0000-0000000000a1', // 강사(출석은 읽지만 직원은 아님)
  guard: '00000000-0000-0000-0000-0000000000e1',
  student: '00000000-0000-0000-0000-0000000000d1',
  nobody: '00000000-0000-0000-0000-0000000000f1',
};
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.admin}', '관리자'), ('${U.office}', '오피스');
  insert into public.user_roles (user_id, role) values ('${U.office}', 'office'), ('${U.teacher}', 'teacher');
  insert into public.guard_accounts values ('${U.guard}', 'Challenger', 'Challenger 정문');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.class_sessions (id, day, start_time, campus, subject) values
    ('10000000-0000-4000-8000-000000000001', '2026-11-20', '10:00', 'Challenger', 'Speaking'),
    ('10000000-0000-4000-8000-000000000002', '2026-11-20', '08:00', 'Challenger', 'Grammar'),
    ('10000000-0000-4000-8000-000000000003', '2026-11-20', '08:00', 'Premium', ''),
    ('10000000-0000-4000-8000-000000000004', '2026-09-01', '08:00', 'Challenger', '');
  insert into public.attendance (session_id, student_no, result, excused) values
    ('10000000-0000-4000-8000-000000000001', '1001', 'AB', false),
    ('10000000-0000-4000-8000-000000000002', '1001', 'AB', false),
    ('10000000-0000-4000-8000-000000000002', '1002', 'AT', false),
    ('10000000-0000-4000-8000-000000000002', '1003', 'AB', true),
    ('10000000-0000-4000-8000-000000000002', '1004', null, false),
    ('10000000-0000-4000-8000-000000000003', '2001', 'AB', false),
    ('10000000-0000-4000-8000-000000000004', '1001', 'AB', false);
  insert into public.attendance_closings (day, campus) values ('2026-11-20', 'Challenger');
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
async function denied(name, sql, pattern, params) {
  try {
    await db.query(sql, params);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}
const marks = (from = '2026-11-01', to = '2026-11-30') => q(`select student_no, day::text, start_time, campus, subject, excused, closed from intranet_absence_marks($1, $2)`, [from, to]);

// ── 직원(관리자·오피스): 기간 안의 결석만, 날짜·학생·시각 순, 사유 인정·마감 여부
await as(U.admin, async () => {
  const rows = await marks();
  ok('직원: 결석만 4줄(출석·미체크·기간 밖 제외)', rows.length === 4, JSON.stringify(rows));
  ok('날짜·학생·시각 순, 시각은 HH:MM', rows.map((r) => `${r.student_no} ${r.start_time} ${r.subject}`).join('|') === '1001 08:00 Grammar|1001 10:00 Speaking|1003 08:00 Grammar|2001 08:00 ', JSON.stringify(rows));
  ok('사유 인정 표시', rows.find((r) => r.student_no === '1003')?.excused === true && rows.find((r) => r.student_no === '1001')?.excused === false);
  ok('마감 여부는 그 캠퍼스·날짜', rows.find((r) => r.student_no === '1001')?.closed === true && rows.find((r) => r.student_no === '2001')?.closed === false, JSON.stringify(rows));
  ok('기간이 62일을 넘으면 빈 결과', (await marks('2026-09-01', '2026-11-30')).length === 0);
  ok('끝이 시작보다 앞이면 빈 결과', (await marks('2026-11-30', '2026-11-01')).length === 0);
  ok('9월 기간이면 9월 결석', (await marks('2026-09-01', '2026-09-30')).length === 1);
});
await as(U.office, async () => ok('오피스 직원도 받음(패널티 표와 같은 범위)', (await marks()).length === 4));

// ── 직원이 아니면 빈 결과(강사는 출석 표를 읽을 수 있어도), 익명은 실행 불가
await as(U.teacher, async () => {
  ok('강사: 출석 표는 읽음', (await q(`select count(*)::int n from attendance`))[0].n === 7);
  ok('강사: 결석 함수는 빈 결과', (await marks()).length === 0);
});
await as(U.guard, async () => ok('가드: 빈 결과', (await marks()).length === 0));
await as(U.student, async () => ok('학생: 빈 결과', (await marks()).length === 0));
await as(U.nobody, async () => ok('역할 없는 로그인: 빈 결과', (await marks()).length === 0));
await as(null, async () => denied('익명은 실행 불가', `select * from intranet_absence_marks('2026-11-01', '2026-11-30')`, /permission denied/));

// ── 자동 확인(jic-intranet Worker 크론)용 intranet_absence_marks_service: 서비스 키(service_role)만, 결과는 직원 함수와 같음
const svc = `select student_no, day::text, start_time, campus, subject, excused, closed from intranet_absence_marks_service('2026-11-01', '2026-11-30')`;
const staffRows = await as(U.admin, () => marks());
await db.exec(`reset role; set role service_role;`);
const svcRows = (await db.query(svc)).rows;
const svcLong = (await db.query(`select * from intranet_absence_marks_service('2026-09-01', '2026-11-30')`)).rows;
await db.exec(`reset role;`);
ok('서비스 키: 직원 함수와 같은 결과', JSON.stringify(svcRows) === JSON.stringify(staffRows) && svcRows.length === 4, JSON.stringify(svcRows));
ok('서비스 키: 기간이 62일을 넘으면 빈 결과', svcLong.length === 0);
await as(U.admin, async () => denied('직원 토큰은 서비스 키 함수 실행 불가', svc, /permission denied/));
await as(U.teacher, async () => denied('강사는 서비스 키 함수 실행 불가', svc, /permission denied/));
await as(null, async () => denied('익명은 서비스 키 함수 실행 불가', svc, /permission denied/));

const fn = (await q(`select prosecdef, proconfig from pg_proc where proname = 'intranet_absence_marks'`))[0];
ok('security definer, search_path 고정', fn?.prosecdef === true && (fn.proconfig ?? []).some((c) => c.startsWith('search_path=')), JSON.stringify(fn));

// ── 패널티 출처 'attendance'
const pen = (id, source) => `insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('${id}', '1001', 'absence', '2026-11-20', 'Challenger', '수업 결석 2회', '${source}', '1001:2026-11-20')`;
await as(U.admin, async () => {
  await q(pen('absence-1001-2026-11-20', 'attendance'));
  ok('직원: 출처 attendance 로 무단결석 후보 등록', (await q(`select source from penalties where id = 'absence-1001-2026-11-20'`))[0]?.source === 'attendance');
  await denied('없는 출처는 막힘', pen('x-1', 'lms'), /check constraint/);
});
await as(U.guard, async () => denied('가드는 출석 출처 후보를 못 넣음', pen('absence-1001-2026-11-21', 'attendance'), /row-level security/));
ok('기존 출처(outing·guard)는 그대로', (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'penalties_source_check'`))[0]?.d.includes("'outing'"));

console.log(`통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
