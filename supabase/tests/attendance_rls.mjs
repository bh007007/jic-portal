// 강사 포털 출석 마이그레이션(20261109000000_attendance.sql)의 권한 시험.
// teacher_portal_rls.mjs 와 같은 방식: PGlite(실제 Postgres)에 Supabase 흉내를 만들고, 마이그레이션을 두 번 실행한 뒤 역할별로 읽기·쓰기를 본다. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/attendance_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql', '20261108200000_teacher_portal.sql']) await db.exec(mig(f));
await db.exec(mig('20261109000000_attendance.sql'));
await db.exec(mig('20261109000000_attendance.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  teacher: '00000000-0000-0000-0000-0000000000a1',
  teacher2: '00000000-0000-0000-0000-0000000000a2',
  checker: '00000000-0000-0000-0000-0000000000a3',
  scheduler: '00000000-0000-0000-0000-0000000000a4',
  manager: '00000000-0000-0000-0000-0000000000b1',
  staff: '00000000-0000-0000-0000-0000000000c1',
  student: '00000000-0000-0000-0000-0000000000d1',
  student2: '00000000-0000-0000-0000-0000000000d2',
  nobody: '00000000-0000-0000-0000-0000000000e1',
};
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜(UTC+8)
const plus = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const S1 = '10000000-0000-0000-0000-000000000001'; // 오늘 09:00 Ann
const S2 = '10000000-0000-0000-0000-000000000002'; // 오늘 10:00 Ben
const S3 = '10000000-0000-0000-0000-000000000003'; // 내일 09:00 Ann
const TA = '20000000-0000-0000-0000-000000000001';
const TB = '20000000-0000-0000-0000-000000000002';
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  update auth.users set email = 'mgr@test.local' where id = '${U.manager}';
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001'), ('${U.student2}', '1002');
  insert into public.user_roles (user_id, role) values ('${U.teacher}', 'teacher'), ('${U.teacher2}', 'teacher'), ('${U.checker}', 'checker'), ('${U.scheduler}', 'scheduler'), ('${U.manager}', 'manager');
  insert into public.staff (id, user_id, name, nickname) values ('${TA}', '${U.teacher}', 'Ann Cruz', 'Teacher Ann'), ('${TB}', '${U.teacher2}', 'Ben Reyes', '');
  insert into public.classrooms (id, campus, num, kind) values ('30000000-0000-0000-0000-000000000001', 'Premium', 'A-101', '1');
  insert into public.class_sessions (id, day, start_time, campus, teacher_id, classroom_id) values
    ('${S1}', '${today}', '09:00', 'Premium', '${TA}', '30000000-0000-0000-0000-000000000001'),
    ('${S2}', '${today}', '10:00', 'Premium', '${TB}', null),
    ('${S3}', '${plus(today, 1)}', '09:00', 'Premium', '${TA}', null);
  insert into public.attendance (session_id, student_no) values ('${S1}', '1001'), ('${S1}', '1002'), ('${S2}', '1002'), ('${S3}', '1001');
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
const mark = (s, st, set) => `update public.attendance set ${set} where session_id = '${s}' and student_no = '${st}'`;

// ── 수업 목록
await as(U.teacher, async () => {
  const rows = await q(`select * from public.lms_sessions('${today}')`);
  ok('강사: 오늘 수업 2개', rows.length === 2, JSON.stringify(rows.map((r) => r.start_time)));
  const s1 = rows.find((r) => r.id === S1), s2 = rows.find((r) => r.id === S2);
  ok('강사: 내 수업 표시', s1?.mine === true && s2?.mine === false);
  ok('강사: 부르는 이름·교실·학생 수', s1?.teacher_name === 'Teacher Ann' && s1?.room === 'A-101' && s1?.students === 2 && s2?.teacher_name === 'Ben Reyes' && s2?.students === 1);
  ok('강사: 캠퍼스 거르기', (await q(`select * from public.lms_sessions('${today}', 'MCO')`)).length === 0);
});
await as(U.nobody, async () => ok('역할 없음: 수업 목록 0', (await q(`select * from public.lms_sessions('${today}')`)).length === 0));
await as(null, () => denied('익명: 수업 목록 거부', `select * from public.lms_sessions('${today}')`, PERM));

// ── 출석 체크
await as(U.teacher, async () => {
  ok('강사: 내 수업 출석', (await affected(mark(S1, '1001', `result = 'AT'`))) === 1);
  const r = await one(`select * from public.attendance where session_id = '${S1}' and student_no = '1001'`);
  ok('강사: 체크한 사람은 서버가 넣음(강사 목록 이름)', r.checked_name === 'Ann Cruz' && r.checked_by === U.teacher && r.checked_at != null);
  ok('강사: 남의 수업은 못 고침(0행)', (await affected(mark(S2, '1002', `result = 'AB'`))) === 0);
  ok('강사: 지각 분', (await affected(mark(S1, '1002', `result = 'TA', late_min = 7`))) === 1);
  await db.query(mark(S1, '1002', `result = 'AT'`));
  ok('강사: 지각이 아니면 지각 분을 지움', (await one(`select late_min from public.attendance where session_id = '${S1}' and student_no = '1002'`)).late_min === null);
  await denied('강사: 사유 인정은 못 바꿈', mark(S1, '1002', `excused = true`), /manager_only/);
  await denied('강사: 내일 수업 결과 거부', mark(S3, '1001', `result = 'AT'`), /future_session/);
  await denied('강사: 체크한 사람 이름 직접 쓰기 거부', mark(S1, '1001', `checked_name = 'x'`), PERM);
  await denied('강사: 출석 행 넣기 거부', `insert into public.attendance (session_id, student_no) values ('${S2}', '1001')`, RLS);
  await denied('강사: 수업 만들기 거부', `insert into public.class_sessions (day, start_time, campus) values ('${today}', '11:00', 'Premium')`, RLS);
  await denied('강사: 마감 거부', `insert into public.attendance_closings (day, campus) values ('${today}', 'Premium')`, RLS);
  ok('강사: 출석 행 지우기 0행', (await affected(`delete from public.attendance where session_id = '${S1}'`)) === 0);
});
await as(U.teacher2, async () => {
  ok('강사2: 자기 수업 출석', (await affected(mark(S2, '1002', `result = 'AB'`))) === 1);
  ok('강사2: Ann 수업은 0행', (await affected(mark(S1, '1001', `result = 'AB'`))) === 0);
});
await as(U.checker, async () => {
  ok('체커: 아무 수업이나 출석', (await affected(mark(S2, '1002', `result = 'AT', note = 'late bus'`))) === 1);
  await denied('체커: 사유 인정 거부', mark(S2, '1002', `excused = true`), /manager_only/);
});
await as(U.manager, async () => {
  ok('매니저: 사유 인정', (await affected(mark(S2, '1002', `excused = true`))) === 1);
});

// ── 전체 출석
await db.exec(`update public.attendance set result = null, late_min = null where session_id = '${S1}' and student_no = '1002'`);
await as(U.teacher, async () => {
  ok('강사: 남은 학생 모두 출석(1명)', Number((await one(`select public.attendance_mark_all('${S1}') as n`)).n) === 1);
  ok('강사: 남의 수업 모두 출석은 0', Number((await one(`select public.attendance_mark_all('${S2}') as n`)).n) === 0);
  const s1 = (await q(`select * from public.lms_sessions('${today}')`)).find((r) => r.id === S1);
  ok('강사: 체크 수 반영', s1?.checked === 2 && s1?.absent === 0);
});

// ── 스케줄러: 수업·출석 행
await as(U.scheduler, async () => {
  ok('스케줄러: 수업 만들기', (await affected(`insert into public.class_sessions (day, start_time, campus, kind) values ('${today}', '13:00', 'Premium', 'G')`)) === 1);
  ok('스케줄러: 출석 행 넣기', (await affected(`insert into public.attendance (session_id, student_no) values ('${S2}', '1001')`)) === 1);
  ok('스케줄러: 출석 행 지우기', (await affected(`delete from public.attendance where session_id = '${S2}' and student_no = '1001'`)) === 1);
  ok('스케줄러: 결과는 못 넣음(0행)', (await affected(mark(S1, '1001', `result = 'AB'`))) === 0);
  await denied('스케줄러: 마감 거부', `insert into public.attendance_closings (day, campus) values ('${today}', 'Premium')`, RLS);
});

// ── 마감
await as(U.manager, async () => {
  await denied('매니저: 내일 마감 거부', `insert into public.attendance_closings (day, campus) values ('${plus(today, 1)}', 'Premium')`, /future_day/);
  ok('매니저: 오늘 마감', (await affected(`insert into public.attendance_closings (day, campus) values ('${today}', 'Premium')`)) === 1);
  // 이 매니저는 강사 목록·직원 이름이 없어 로그인 이메일이 들어간다(current_lms_name)
  ok('매니저: 마감한 사람은 서버가 넣음(이메일)', (await one(`select closed_name from public.attendance_closings where day = '${today}'`)).closed_name === 'mgr@test.local');
});
await as(U.teacher, async () => {
  await denied('강사: 마감된 날 고치기 거부', mark(S1, '1001', `result = 'AB'`), /attendance_closed/);
  ok('강사: 목록에 마감 표시', (await q(`select * from public.lms_sessions('${today}')`)).every((r) => r.closed === true));
});
await as(U.checker, () => denied('체커: 마감된 날 거부', mark(S2, '1002', `result = 'AB'`), /attendance_closed/));
await as(U.scheduler, async () => {
  ok('스케줄러: 마감된 날 수업 지우기 0행', (await affected(`delete from public.class_sessions where id = '${S2}'`)) === 0);
  await denied('스케줄러: 마감된 날 출석 행 지우기 거부', `delete from public.attendance where session_id = '${S2}'`, /attendance_closed/);
});
await as(U.teacher, async () => ok('강사: 마감 되돌리기 0행', (await affected(`delete from public.attendance_closings where day = '${today}'`)) === 0));
await as(U.staff, async () => {
  ok('직원: 마감 되돌리기', (await affected(`delete from public.attendance_closings where day = '${today}'`)) === 1);
  ok('직원: 출석 고치기', (await affected(mark(S1, '1001', `result = 'TA', late_min = 3`))) === 1);
  ok('직원: 체크한 사람 이름(직원 이름)', (await one(`select checked_name from public.attendance where session_id = '${S1}' and student_no = '1001'`)).checked_name === '직원');
});

// ── 학생: 자기 것만
await as(U.student, async () => {
  ok('학생: 자기 출석만(2행)', (await count(`select count(*) n from public.attendance`)) === 2);
  ok('학생: 자기가 든 수업만(2개)', (await count(`select count(*) n from public.class_sessions`)) === 2);
  ok('학생: 출석 고치기 0행', (await affected(mark(S1, '1001', `result = 'AT'`))) === 0);
  ok('학생: 교실 0', (await count(`select count(*) n from public.classrooms`)) === 0);
  ok('학생: 수업 목록 함수 0', (await q(`select * from public.lms_sessions('${today}')`)).length === 0);
});
await as(U.student2, async () => ok('학생2: 자기 출석만(2행)', (await count(`select count(*) n from public.attendance where student_no = '1002'`)) === 2 && (await count(`select count(*) n from public.attendance`)) === 2));
await as(U.nobody, async () => {
  ok('역할 없음: 출석 0', (await count(`select count(*) n from public.attendance`)) === 0);
  ok('역할 없음: 수업 0', (await count(`select count(*) n from public.class_sessions`)) === 0);
  ok('역할 없음: 마감 0', (await count(`select count(*) n from public.attendance_closings`)) === 0);
});
await as(null, async () => {
  await denied('익명: 출석 거부', `select * from public.attendance`, PERM);
  await denied('익명: 수업 거부', `select * from public.class_sessions`, PERM);
});

// ── 출석 확인·사유별 합계(20261109080000_attendance_summary.sql): 사유 인정 / 그날 승인된 결석 신청 / 무단
await db.exec(mig('20261109080000_attendance_summary.sql'));
await db.exec(mig('20261109080000_attendance_summary.sql')); // 두 번째 실행
const Y = plus(today, -1);
const S4 = '10000000-0000-0000-0000-000000000004';
await db.exec(`
  insert into public.class_sessions (id, day, start_time, campus, subject, teacher_id) values ('${S4}', '${Y}', '09:00', 'Premium', 'Grammar', '${TA}');
  insert into public.attendance (session_id, student_no, result) values ('${S4}', '1001', 'AB'), ('${S4}', '1002', 'AB'), ('${S4}', '1003', 'AB'), ('${S4}', '1004', 'TA');
  update public.attendance set excused = true where session_id = '${S4}' and student_no = '1003';
  update public.attendance set late_min = 15 where session_id = '${S4}' and student_no = '1004';
  insert into public.absence_requests (student_no, enrollment_id, absence_date, kind, reason, status) values
    ('1002', 'tr2', '${Y}', 'sick', '가짜 사유', 'approved'),
    ('1001', 'tr1', '${Y}', 'personal', '가짜 사유', 'pending');
`);
await as(U.teacher2, async () => {
  const rows = await q(`select * from public.lms_attendance_summary('${Y}', '${Y}')`);
  const by = Object.fromEntries(rows.map((r) => [r.student_no, r]));
  ok('합계: 학생 4명', rows.length === 4, JSON.stringify(rows.map((r) => r.student_no)));
  ok('합계: 신청 없음(처리 전 신청만) = 무단', by['1001']?.unexcused === 1 && by['1001']?.req_personal === 0);
  ok('합계: 승인된 병결 신청 = 신청 인정', by['1002']?.req_sick === 1 && by['1002']?.unexcused === 0);
  ok('합계: 사유 인정', by['1003']?.excused === 1 && by['1003']?.unexcused === 0);
  ok('합계: 지각·지각 분', by['1004']?.late === 1 && by['1004']?.late_min === 15 && by['1004']?.absent === 0);
  ok('합계: 무단이 많은 순서', rows[0].student_no === '1001');
  ok('합계: 캠퍼스 거르기', (await q(`select * from public.lms_attendance_summary('${Y}', '${Y}', 'MCO')`)).length === 0);
  ok('합계: 기간 92일 넘으면 0', (await q(`select * from public.lms_attendance_summary('${plus(today, -200)}', '${today}')`)).length === 0);
  const d = await q(`select * from public.lms_student_attendance('1002', '${Y}', '${Y}')`);
  ok('학생별: 결석 신청 종류·상태', d.length === 1 && d[0].result === 'AB' && d[0].request_kind === 'sick' && d[0].request_status === 'approved' && d[0].subject === 'Grammar' && d[0].start_time === '09:00', JSON.stringify(d));
  const d1 = await q(`select * from public.lms_student_attendance('1001', '${Y}', '${Y}')`);
  ok('학생별: 처리 전 신청도 보임', d1[0]?.request_kind === 'personal' && d1[0]?.request_status === 'pending');
  ok('학생별: 사유 글은 없음', !('reason' in (d1[0] ?? {})));
});
await as(U.student, async () => {
  ok('학생: 합계 0', (await q(`select * from public.lms_attendance_summary('${Y}', '${Y}')`)).length === 0);
  ok('학생: 남의 학생별 0', (await q(`select * from public.lms_student_attendance('1002', '${Y}', '${Y}')`)).length === 0);
});
await as(U.nobody, async () => ok('역할 없음: 합계 0', (await q(`select * from public.lms_attendance_summary('${Y}', '${Y}')`)).length === 0));
await as(null, () => denied('익명: 합계 거부', `select * from public.lms_attendance_summary('${Y}', '${Y}')`, PERM));

// ── 퇴직한 강사(강사 목록 active = false)는 자기 수업도 못 고친다
await db.exec(`update public.staff set active = false where id = '${TA}'`);
await as(U.teacher, async () => ok('퇴직 강사: 0행', (await affected(mark(S1, '1002', `result = 'AB'`))) === 0));

console.log(`출석 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
