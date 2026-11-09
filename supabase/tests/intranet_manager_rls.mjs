// 인트라넷 역할 2단계 B(20261109100000_intranet_manager.sql)의 권한 시험: 강사 포털 매니저(user_roles manager)에게 인트라넷 일부를 연다(docs/roles.md, 11/9 승인).
// 매니저: 외출·가드 리포트·점수표·통금 설정·결석 신청·학교 여행·내부 공지 읽기, 패널티 승인·반려는 무단결석만, 무단결석 후보(출처 attendance, 대기) 정리,
// 결석 신청 처리, 공지 쓰기(자기 글만 고침), 상담 기록은 매니저 역할의 캠퍼스만(20261109110000_intranet_manager_counseling.sql).
// 11/9 결정(20261109170000_intranet_decisions.sql): 매니저의 무단결석 승인·반려도 맡은 캠퍼스만(I5), 가드 계정 작업 기록은 관리자만(I4).
// 11/10 결정(20261110103000_intranet_decisions_2.sql): 직원이 맡은 캠퍼스는 user_roles 한 곳(I16, 관리자 모든 캠퍼스·오피스 역할 캠퍼스), 점수표에 폭력·무단외출(I7).
// 강사(teacher)는 그대로 못 본다. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/intranet_manager_rls.mjs
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
for (const f of [
  '20261107000000_legacy_tables.sql', '20261108100000_student_intranet.sql', '20261108120000_student_request_ids.sql', '20261108130000_intranet_deploy.sql',
  '20261108140000_nonacademic_requests.sql', '20261108150000_overnight_travel.sql', '20261108160000_school_trips.sql', '20261108180000_student_account_admin.sql',
  '20261108190000_guard_account_admin.sql', '20261108200000_teacher_portal.sql',
  '20261109000000_attendance.sql', '20261109010000_roles.sql', '20261109050000_absence_penalties.sql', '20261109070000_intranet_roles.sql',
]) await db.exec(mig(f));
await db.exec(mig('20261109100000_intranet_manager.sql'));
await db.exec(mig('20261109100000_intranet_manager.sql')); // 두 번째 실행
await db.exec(mig('20261109110000_intranet_manager_counseling.sql'));
await db.exec(mig('20261109110000_intranet_manager_counseling.sql')); // 두 번째 실행
await db.exec(mig('20261109170000_intranet_decisions.sql'));
await db.exec(mig('20261109170000_intranet_decisions.sql')); // 두 번째 실행
await db.exec(mig('20261110103000_intranet_decisions_2.sql'));
await db.exec(mig('20261110103000_intranet_decisions_2.sql')); // 두 번째 실행(I16 맡은 캠퍼스는 user_roles, I7 폭력·무단외출)
ok('마이그레이션 2회 실행', true);

const U = {
  staff: '00000000-0000-0000-0000-0000000000c1', // 직원(관리자)
  manager: '00000000-0000-0000-0000-0000000000b1', // 강사 포털 매니저(직원 아님)
  teacher: '00000000-0000-0000-0000-0000000000a1', // 강사
  student: '00000000-0000-0000-0000-0000000000d1',
  managerP: '00000000-0000-0000-0000-0000000000b2', // Premium 만 맡은 매니저
};
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.staff}', '직원S');
  insert into public.user_roles (user_id, role, campus) values ('${U.manager}', 'manager', ''), ('${U.teacher}', 'teacher', ''), ('${U.managerP}', 'manager', 'Premium');
  insert into public.staff (user_id, name) values ('${U.manager}', '매니저M'), ('${U.teacher}', '강사T'), ('${U.managerP}', '매니저P');
  insert into public.staff_campuses values ('${U.staff}', 'Challenger');
  insert into public.student_users (user_id, student_no) values ('${U.student}', '1001');
  insert into public.legacy_enrollments (id, data) values ('tr1', '{"tr_st_id":"1001"}');
  insert into public.outings (student_no, enrollment_id, campus, out_at, out_by) values ('1001', 'tr1', 'Challenger', now() - interval '1 hour', '근무자');
  insert into public.incident_reports (student_no, enrollment_id, campus, kind, note, occurred_at, reported_by) values ('1001', 'tr1', 'Challenger', 'alcohol', '내용', now(), '근무자');
  insert into public.absence_requests (id, student_no, enrollment_id, absence_date, kind, reason) values ('a0000000-0000-4000-8000-000000000001', '1001', 'tr1', '2026-11-20', 'sick', '감기');
  insert into public.overnight_permissions (student_no, enrollment_id, leave_date, return_date, reason, status) values ('1001', 'tr1', '2026-11-20', '2026-11-21', '비밀', 'approved');
  insert into public.penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values
    ('absence-1001-2026-11-20', '1001', 'absence', '2026-11-20', 'Challenger', '수업 결석 1회', 'attendance', '1001:2026-11-20'),
    ('curfew-x', '1001', 'curfew', '2026-11-20', 'Challenger', '통금', 'outing', 'x');
  insert into public.internal_notices (id, title, content, author_id, author_name) values ('b0000000-0000-4000-8000-000000000001', '직원 공지', '내용', '${U.staff}', '직원S');
  insert into public.class_sessions (id, day, start_time, campus, subject) values ('10000000-0000-4000-8000-000000000001', '2026-11-20', '08:00', 'Challenger', 'Grammar');
  insert into public.attendance (session_id, student_no, result) values ('10000000-0000-4000-8000-000000000001', '1001', 'AB');
`);
await db.exec(`insert into public.audit_logs (actor_id, actor_name, action, target, target_id, student_no, campus) values ('${U.staff}', '직원S', 'view', 'counseling', 'x', '1001', 'Challenger')`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const n = async (table) => (await q(`select count(*)::int n from ${table}`))[0].n;
const affected = async (sql) => (await db.query(sql)).affectedRows ?? 0;
async function denied(name, sql, pattern) {
  try {
    await db.query(sql);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}
const READ = ['outings', 'incident_reports', 'penalty_rules', 'penalty_stages', 'intranet_settings', 'absence_requests', 'trips', 'internal_notices', 'penalties'];

// ── 읽기: 매니저는 열고, 강사는 그대로 못 본다
await as(U.manager, async () => {
  for (const t of READ) ok(`매니저 읽기: ${t}`, (await n(t)) > 0 || t === 'trips', `${t}=${await n(t)}`);
  ok('매니저: 외박 신청(사유)은 못 읽음', (await n('overnight_permissions')) === 0);
  ok('매니저: 접근 기록은 못 읽음', (await n('audit_logs')) === 0);
  ok('매니저: 업체 원본은 못 읽음', (await n('legacy_enrollments')) === 0);
  ok('매니저: 결석(무단결석 후보용) 읽기', (await q(`select * from intranet_absence_marks('2026-11-01', '2026-11-30')`)).length === 1);
  const names = await q(`select name from staff_directory() order by name`);
  ok('매니저: 처리자 이름(직원 + 강사 목록)', names.map((r) => r.name).join() === '강사T,매니저M,매니저P,직원S', JSON.stringify(names));
});
await as(U.teacher, async () => {
  for (const t of READ) ok(`강사 못 읽음: ${t}`, (await n(t)) === 0, `${t}=${await n(t)}`);
  ok('강사: 결석 함수 빈 결과', (await q(`select * from intranet_absence_marks('2026-11-01', '2026-11-30')`)).length === 0);
  ok('강사: 처리자 이름 빈 결과', (await q(`select * from staff_directory()`)).length === 0);
});

// ── 패널티: 승인·반려는 무단결석만, 무단결석 후보(대기) 넣기·지우기
await as(U.manager, async () => {
  ok('매니저: 통금 위반 승인은 0행', (await affected(`update penalties set status = 'approved' where id = 'curfew-x'`)) === 0);
  ok('매니저: 무단결석 승인', (await affected(`update penalties set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = 'absence-1001-2026-11-20'`)) === 1);
  ok('매니저: 처리한 무단결석은 지우지 못함', (await affected(`delete from penalties where id = 'absence-1001-2026-11-20'`)) === 0);
  await q(`insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('absence-1001-2026-11-21', '1001', 'absence', '2026-11-21', 'Challenger', '수업 결석 1회', 'attendance', '1001:2026-11-21')`);
  ok('매니저: 무단결석 후보 넣기', (await n('penalties')) === 3);
  ok('매니저: 대기 무단결석 후보 지우기', (await affected(`delete from penalties where id = 'absence-1001-2026-11-21'`)) === 1);
  await denied('매니저: 통금 후보는 못 넣음', `insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('curfew-y', '1001', 'curfew', '2026-11-21', 'Challenger', '통금', 'outing', 'y')`, /row-level security/);
  await denied('매니저: 승인된 상태로는 못 넣음', `insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id, status, score) values ('absence-1001-2026-11-22', '1001', 'absence', '2026-11-22', 'Challenger', 'x', 'attendance', '1001:2026-11-22', 'approved', 3)`, /row-level security/);
  ok('매니저: 점수표 고치기는 0행', (await affected(`update penalty_rules set score = 9 where code = 'absence'`)) === 0);
  ok('매니저: 통금 설정 고치기는 0행', (await affected(`update intranet_settings set guards = '{x}'`)) === 0);
});
await as(U.teacher, async () => ok('강사: 무단결석 승인 0행', (await affected(`update penalties set note = 'x' where kind = 'absence'`)) === 0));

// ── I5: 매니저의 승인·반려는 맡은 캠퍼스만(역할의 캠퍼스, 빈칸 = 모든 캠퍼스). 대기 후보 넣기·지우기(화면을 열 때의 정리)는 캠퍼스를 가리지 않는다
const absPen = (st, campus) => `('absence-${st}-2026-11-23', '${st}', 'absence', '2026-11-23', '${campus}', '수업 결석 1회', 'attendance', '${st}:2026-11-23')`;
await db.exec(`insert into public.penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ${absPen('1001', 'Challenger')}, ${absPen('2001', 'Premium')}`);
await as(U.managerP, async () => {
  ok('매니저(Premium): Challenger 무단결석 승인 0행', (await affected(`update penalties set status = 'approved' where id = 'absence-1001-2026-11-23'`)) === 0);
  ok('매니저(Premium): Premium 무단결석 반려', (await affected(`update penalties set status = 'rejected', decided_at = now() where id = 'absence-2001-2026-11-23'`)) === 1);
  await denied('매니저(Premium): 캠퍼스를 바꿔 넘기지 못함', `update penalties set campus = 'Challenger' where id = 'absence-2001-2026-11-23'`, /row-level security/);
  ok('매니저(Premium): 다른 캠퍼스 대기 후보 지우기(정리)는 그대로', (await affected(`delete from penalties where id = 'absence-1001-2026-11-23'`)) === 1);
  await q(`insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ${absPen('1001', 'Challenger')}`);
  ok('매니저(Premium): 다른 캠퍼스 대기 후보 넣기(정리)는 그대로', (await q(`select campus from penalties where id = 'absence-1001-2026-11-23'`))[0]?.campus === 'Challenger');
});
await as(U.manager, async () => ok('매니저(모든 캠퍼스): 어느 캠퍼스든 승인', (await affected(`update penalties set status = 'approved' where id = 'absence-1001-2026-11-23'`)) === 1));
await as(null, async () => denied('익명: 매니저 캠퍼스 함수 실행 불가', `select intranet_manager_campus_ok('Challenger')`, /permission denied/));

// ── 결석 신청 처리: 매니저 가능, 강사·학생은 안 됨
await as(U.manager, async () => ok('매니저: 결석 신청 승인', (await q(`select decide_absence_requests(array['a0000000-0000-4000-8000-000000000001'::uuid], true, '확인') as n`))[0].n === 1));
ok('처리자 = 매니저', (await q(`select decided_by::text from absence_requests`))[0].decided_by === U.manager);
await as(U.teacher, async () => denied('강사: 결석 신청 처리 불가', `select decide_absence_requests(array['a0000000-0000-4000-8000-000000000001'::uuid], false, null)`, /staff_only/));
await as(U.student, async () => denied('학생: 결석 신청 처리 불가', `select decide_absence_requests(array['a0000000-0000-4000-8000-000000000001'::uuid], false, null)`, /staff_only/));

// ── 내부 공지: 쓰기, 고치기는 자기 글만, 읽음은 본인 것
await as(U.manager, async () => {
  await q(`insert into internal_notices (id, title, content, author_name) values ('b0000000-0000-4000-8000-000000000002', '매니저 공지', '내용', '매니저M')`);
  ok('매니저: 공지 쓰기(작성자 = 본인)', (await q(`select author_id::text from internal_notices where id = 'b0000000-0000-4000-8000-000000000002'`))[0].author_id === U.manager);
  ok('매니저: 자기 공지 고치기', (await affected(`update internal_notices set title = '수정' where id = 'b0000000-0000-4000-8000-000000000002'`)) === 1);
  ok('매니저: 직원 공지 고치기 0행', (await affected(`update internal_notices set title = '수정' where id = 'b0000000-0000-4000-8000-000000000001'`)) === 0);
  await denied('매니저: 남의 이름으로 공지 못 씀', `insert into internal_notices (title, content, author_id, author_name) values ('t', 'c', '${U.staff}', '직원S')`, /row-level security/);
  await q(`insert into internal_notice_reads (notice_id, name) values ('b0000000-0000-4000-8000-000000000001', '매니저M')`);
  ok('매니저: 읽음 표시', (await n('internal_notice_reads')) === 1);
});
await as(U.teacher, async () => denied('강사: 공지 못 씀', `insert into internal_notices (title, content, author_name) values ('t', 'c', '강사T')`, /row-level security/));

// ── 직원은 그대로
await as(U.staff, async () => {
  ok('직원: 통금 위반 승인', (await affected(`update penalties set status = 'approved' where id = 'curfew-x'`)) === 1);
  ok('직원: 결석 함수', (await q(`select * from intranet_absence_marks('2026-11-01', '2026-11-30')`)).length === 1);
});

// ── 상담 기록: 관리자는 모든 캠퍼스, 오피스는 오피스 역할의 캠퍼스(I16), 매니저는 매니저 역할의 캠퍼스(빈칸 = 모든 캠퍼스). 이름은 강사 목록 이름
const OFFICE = '00000000-0000-0000-0000-0000000000c3'; // Challenger 오피스
await db.exec(`
  insert into auth.users (id) values ('${OFFICE}');
  insert into public.staff_users (user_id, name) values ('${OFFICE}', '오피스O');
  insert into public.user_roles (user_id, role, campus) values ('${OFFICE}', 'office', 'Challenger');
`);
const cid = await as(U.manager, async () => (await q(`select counseling_create('1001', 'Challenger', '2026-11-08', '수업 태도', '내용', null) as id`))[0].id);
ok('매니저(모든 캠퍼스): 상담 기록 작성, 작성자 = 강사 목록 이름', (await q(`select author_name from counseling_notes where id = $1`, [cid]))[0]?.author_name === '매니저M');
await as(U.manager, async () => {
  ok('매니저: 상담 목록', (await q(`select * from counseling_list()`)).length === 1);
  ok('매니저: 상담 열람(내용)', (await q(`select content from counseling_open($1)`, [cid]))[0]?.content === '내용');
  await q(`select counseling_update($1, '2026-11-08', '수업 태도(수정)', '내용', '2026-11-10')`, [cid]);
  await q(`select counseling_followup($1, true)`, [cid]);
  ok('매니저: 수정·후속 조치(처리자 = 매니저 이름)', (await q(`select follow_up_done_by from counseling_open($1)`, [cid]))[0]?.follow_up_done_by === '매니저M');
});
const aud = await q(`select actor_id::text, actor_name, action from audit_logs where target_id = $1 order by id`, [cid]);
ok('매니저 상담 접근 기록(작성·열람·수정·완료, 이름. 10초 안 다시 열람은 한 번)', aud.map((a) => a.action).join() === 'create,view,update,followup_done' && aud.every((a) => a.actor_id === U.manager && a.actor_name === '매니저M'), JSON.stringify(aud));
await as(U.managerP, async () => {
  ok('매니저(Premium): Challenger 상담은 목록에 없음', (await q(`select * from counseling_list()`)).length === 0);
  await denied('매니저(Premium): Challenger 상담 열람 불가', `select * from counseling_open('${cid}')`, /not_found/);
  await denied('매니저(Premium): Challenger 학생 상담 작성 불가', `select counseling_create('1001', 'Challenger', '2026-11-08', 't', 'c', null)`, /campus_not_allowed/);
  ok('매니저(Premium): Premium 상담 작성', !!(await q(`select counseling_create('2001', 'Premium', '2026-11-08', 't', 'c', null) as id`))[0].id);
});
await as(U.teacher, async () => {
  ok('강사: 상담 목록 빈 결과', (await q(`select * from counseling_list()`)).length === 0);
  await denied('강사: 상담 작성 불가', `select counseling_create('1001', 'Challenger', '2026-11-08', 't', 'c', null)`, /campus_not_allowed/);
});
await as(OFFICE, async () => {
  ok('오피스(Challenger): 매니저가 쓴 Challenger 상담 보임, Premium 은 안 보임', (await q(`select campus from counseling_list()`)).map((r) => r.campus).join() === 'Challenger');
  await denied('오피스(Challenger): Premium 학생 상담 작성 불가', `select counseling_create('2001', 'Premium', '2026-11-08', 't', 'c', null)`, /campus_not_allowed/);
});
await as(U.staff, async () => {
  ok('관리자(staff_campuses 는 Challenger 만): 모든 캠퍼스 상담이 보임(I16)', (await q(`select campus from counseling_list() order by campus`)).map((r) => r.campus).join() === 'Challenger,Premium');
  const sid = (await q(`select counseling_create('1001', 'Challenger', '2026-11-08', '직원 상담', '내용', null) as id`))[0].id;
  ok('직원: 작성자 이름은 직원 이름 그대로', (await q(`select author_name from counseling_open($1)`, [sid]))[0]?.author_name === '직원S');
  ok('관리자: Premium 학생 상담도 작성(I16)', !!(await q(`select counseling_create('2001', 'Premium', '2026-11-08', 't', 'c', null) as id`))[0].id);
});
ok('I7: 점수표 종류(무단결석·통금·음주·폭력·무단외출·기타 순)', (await q(`select string_agg(code, ',' order by sort) s from penalty_rules`))[0].s === 'absence,curfew,alcohol,violence,unauthorized,other');
await as(null, async () => denied('익명: 상담 범위 함수 실행 불가', `select counseling_campus_ok('Challenger')`, /permission denied/));

// ── I4: 가드 계정 작업 기록(guard_account_audit)은 관리자만. 오피스·매니저는 막힌다(계정 작업 자체는 인트라넷 서버가 관리자만 받는다)
const guardAudits = async () => (await q(`select actor_name, action, target_id from audit_logs where target = 'guard_account'`)).map((r) => `${r.actor_name} ${r.action} ${r.target_id}`).join('|');
await as(OFFICE, async () => denied('오피스: 가드 계정 기록 불가', `select guard_account_audit('guard_create', 'Challenger 정문', 'Challenger')`, /admin_only/));
await as(U.manager, async () => denied('매니저: 가드 계정 기록 불가', `select guard_account_audit('guard_create', 'Challenger 정문', 'Challenger')`, /admin_only/));
await as(U.staff, async () => {
  await q(`select guard_account_audit('guard_create', ' Challenger 정문 ', 'Challenger')`);
  await denied('관리자: 없는 작업은 막힘', `select guard_account_audit('view', 'x', 'Challenger')`, /invalid_action/);
});
ok('관리자: 가드 계정 기록(처리자·출입구 이름)', (await guardAudits()) === '직원S guard_create Challenger 정문', await guardAudits());

console.log(`인트라넷 매니저 권한 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
