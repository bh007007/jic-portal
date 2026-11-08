// 학생 앱·인트라넷 마이그레이션(20261108100000_student_intranet.sql, 20261108120000_student_request_ids.sql,
// 20261108140000_nonacademic_requests.sql)의 권한 시험.
// 실제 Postgres(PGlite, WebAssembly)에 Supabase 흉내(auth.uid, anon/authenticated/service_role)를 만들고
// 마이그레이션을 두 번 실행한 뒤(여러 번 실행 가능 확인) 역할별로 읽기·쓰기를 시험한다. 데이터는 전부 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/student_intranet_rls.mjs
// 다른 곳에 설치했다면 PGLITE=<.../@electric-sql/pglite/dist/index.js> 로 위치를 알려 준다.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));

// ── Supabase 흉내
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  -- 'Automatically expose new tables'가 켜진 경우보다 나쁜 상황을 만들어 revoke 가 듣는지 본다.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(mig('20261107000000_legacy_tables.sql'));
await db.exec(mig('20261108100000_student_intranet.sql'));
await db.exec(mig('20261108100000_student_intranet.sql')); // 두 번째 실행
await db.exec(mig('20261108120000_student_request_ids.sql'));
await db.exec(mig('20261108120000_student_request_ids.sql'));
await db.exec(mig('20261108140000_nonacademic_requests.sql'));
await db.exec(mig('20261108140000_nonacademic_requests.sql'));
ok('마이그레이션 2회 실행', true);

// ── 가짜 사용자
const U = {
  stA: '00000000-0000-0000-0000-00000000000a', // 학생 1001
  stB: '00000000-0000-0000-0000-00000000000b', // 학생 1002
  staffC: '00000000-0000-0000-0000-0000000000c1', // Challenger 담당
  staffP: '00000000-0000-0000-0000-0000000000c2', // Premium 담당
  staffN: '00000000-0000-0000-0000-0000000000c3', // 캠퍼스 미지정 직원
  guardC: '00000000-0000-0000-0000-0000000000d1', // Challenger 정문
  nobody: '00000000-0000-0000-0000-0000000000e1', // 역할 없는 로그인
};
await db.exec(`
  insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(',')};
  insert into public.staff_users (user_id, name) values ('${U.staffC}', '직원C'), ('${U.staffP}', '직원P'), ('${U.staffN}', '직원N');
  insert into public.staff_campuses values ('${U.staffC}', 'Challenger'), ('${U.staffP}', 'Premium');
  insert into public.student_users (user_id, student_no) values ('${U.stA}', '1001'), ('${U.stB}', '1002');
  insert into public.guard_accounts values ('${U.guardC}', 'Challenger', 'Challenger 정문');
  insert into public.legacy_enrollments (id, data) values ('tr1', '{"tr_st_id":"1001"}'), ('tr2', '{"tr_st_id":"1002"}');
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
const one = async (sql, params) => (await q(sql, params))[0];
const count = async (sql, params) => Number((await one(sql, params)).n);
const affected = async (sql, params) => (await db.query(sql, params)).affectedRows ?? 0;
async function denied(name, sql, pattern, params) {
  try {
    await db.query(sql, params);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}
const RLS = /row-level security|violates row-level/;
const PERM = /permission denied/;
const CHECK = /check constraint/;

// ── 결석 신청
const absA = await as(U.stA, async () => {
  const r = await one(`insert into absence_requests (student_no, enrollment_id, absence_date, periods, kind, reason)
                       values ('1001', 'tr1', '2026-11-10', '{1,2}', 'sick', '감기') returning id, status`);
  ok('학생 결석 등록 → 대기', r.status === 'pending');
  const myId = 'a0000000-0000-4000-8000-000000000001';
  const withId = await one(`insert into absence_requests (id, student_no, enrollment_id, absence_date, kind, reason)
                            values ('${myId}', '1001', 'tr1', '2026-11-20', 'personal', '서버가 정한 번호') returning id`);
  ok('서버가 정한 신청 번호로 등록', withId.id === myId);
  await q(`select cancel_absence_request('${myId}')`);
  await denied('남의 학생번호로 결석', `insert into absence_requests (student_no, enrollment_id, absence_date, kind, reason) values ('1002', 'tr2', '2026-11-10', 'sick', 'x')`, RLS);
  await denied('남의 연수로 결석', `insert into absence_requests (student_no, enrollment_id, absence_date, kind, reason) values ('1001', 'tr2', '2026-11-10', 'sick', 'x')`, RLS);
  await denied('승인 상태로 등록', `insert into absence_requests (student_no, enrollment_id, absence_date, kind, reason, status) values ('1001', 'tr1', '2026-11-11', 'sick', 'x', 'approved')`, PERM);
  await denied('없는 교시', `insert into absence_requests (student_no, enrollment_id, absence_date, periods, kind, reason) values ('1001', 'tr1', '2026-11-11', '{9}', 'sick', 'x')`, CHECK);
  await denied('학생이 직접 수정', `update absence_requests set status = 'approved' where id = '${r.id}'`, PERM);
  await denied('학생이 삭제', `delete from absence_requests where id = '${r.id}'`, PERM);
  await denied('학생이 승인 함수', `select decide_absence_requests(array['${r.id}'::uuid], true)`, /staff_only/);
  return r.id;
});
const absB = await as(U.stB, async () => {
  ok('학생B는 A 결석을 못 봄', (await count(`select count(*) n from absence_requests`)) === 0);
  await denied('학생B가 A 결석 취소', `select cancel_absence_request('${absA}')`, /not_pending/);
  return (await one(`insert into absence_requests (student_no, enrollment_id, absence_date, kind, reason) values ('1002', 'tr2', '2026-11-12', 'personal', '병원') returning id`)).id;
});
await as(U.stA, async () => {
  ok('학생A는 자기 것만', (await count(`select count(*) n from absence_requests`)) === 2);
  await q(`select cancel_absence_request('${absA}')`);
  ok('학생 취소', (await one(`select status from absence_requests where id = '${absA}'`)).status === 'cancelled');
  await denied('취소한 건 다시 취소', `select cancel_absence_request('${absA}')`, /not_pending/);
});
await as(U.staffC, async () => {
  ok('직원은 모두 봄', (await count(`select count(*) n from absence_requests`)) === 3);
  const n = (await one(`select decide_absence_requests(array['${absA}'::uuid, '${absB}'::uuid], true, '확인') n`)).n;
  ok('대기 건만 처리', n === 1, `(처리 ${n})`);
  const b = await one(`select status, decided_by, staff_comment from absence_requests where id = '${absB}'`);
  ok('승인 기록', b.status === 'approved' && b.decided_by === U.staffC && b.staff_comment === '확인');
  ok('다시 처리하면 0건', (await one(`select decide_absence_requests(array['${absB}'::uuid], false) n`)).n === 0);
  await denied('직원이 결석 등록', `insert into absence_requests (student_no, enrollment_id, absence_date, kind, reason) values ('1001', 'tr1', '2026-11-10', 'sick', 'x')`, RLS);
});

// ── 외박 신청
await as(U.stA, async () => {
  const r = await one(`insert into overnight_permissions (student_no, enrollment_id, leave_date, return_date, reason) values ('1001', 'tr1', '2026-11-14', '2026-11-16', '여행') returning id`);
  await denied('귀가일이 출발일 이전', `insert into overnight_permissions (student_no, enrollment_id, leave_date, return_date, reason) values ('1001', 'tr1', '2026-11-14', '2026-11-14', 'x')`, CHECK);
  await denied('남의 연수로 외박', `insert into overnight_permissions (student_no, enrollment_id, leave_date, return_date, reason) values ('1001', 'tr2', '2026-11-14', '2026-11-15', 'x')`, RLS);
  await denied('학생이 외박 승인', `select decide_overnight_permissions(array['${r.id}'::uuid], true)`, /staff_only/);
  await as(U.staffC, async () => ok('직원 외박 반려', (await one(`select decide_overnight_permissions(array['${r.id}'::uuid], false, '기간 확인') n`)).n === 1));
  await as(U.stA, async () => {
    ok('반려 결과를 학생이 봄', (await one(`select status, staff_comment from overnight_permissions where id = '${r.id}'`)).staff_comment === '기간 확인');
    await denied('처리된 외박 취소', `select cancel_overnight_permission('${r.id}')`, /not_pending/);
  });
});

// ── 귀국 항공편·배차
const future = (await one(`select (manila_today() + 5)::text d`)).d;
await as(U.stA, async () => {
  await q(`insert into departure_flights (enrollment_id, student_no, depart_date, depart_time, flight, airport, needs_ride) values ('tr1', '1001', $1, '10:30', 'PR 468', 'MANILA', true)`, [future]);
  ok('학생 항공편 등록', (await count(`select count(*) n from departure_flights`)) === 1);
  await denied('남의 연수 항공편', `insert into departure_flights (enrollment_id, student_no, depart_date, depart_time, flight, airport) values ('tr2', '1001', $1, '10:30', 'PR 468', 'MANILA')`, RLS, [future]);
  await denied('지난 날짜 항공편', `insert into departure_flights (enrollment_id, student_no, depart_date, depart_time, flight, airport) values ('tr1x', '1001', '2020-01-01', '10:30', 'PR 468', 'MANILA')`, RLS);
  await denied('기타 공항인데 메모 없음', `update departure_flights set airport = 'OTHER', note = '' where enrollment_id = 'tr1'`, CHECK);
  ok('학생 항공편 수정', (await affected(`update departure_flights set flight = 'PR 470', updated_at = now() where enrollment_id = 'tr1'`)) === 1);
  await denied('학생번호 바꾸기', `update departure_flights set student_no = '1002' where enrollment_id = 'tr1'`, PERM);
  await denied('학생이 배차 입력', `insert into airport_rides (enrollment_id, student_no, decision, pickup_date, pickup_time, for_date, for_time) values ('tr1', '1001', 'confirmed', $1, '06:00', $1, '10:30')`, RLS, [future]);
});
await as(U.stB, async () => ok('학생B는 A 항공편을 못 봄', (await count(`select count(*) n from departure_flights`)) === 0));
await as(U.staffC, async () => {
  await denied('학생번호가 다른 배차', `insert into airport_rides (enrollment_id, student_no, decision, pickup_date, pickup_time, for_date, for_time) values ('tr1', '1002', 'confirmed', $1, '06:00', $1, '10:30')`, RLS, [future]);
  await denied('사유 없는 배차 불가', `insert into airport_rides (enrollment_id, student_no, decision, for_date, for_time) values ('tr1', '1001', 'declined', $1, '10:30')`, CHECK, [future]);
  await q(`insert into airport_rides (enrollment_id, student_no, decision, pickup_date, pickup_time, for_date, for_time) values ('tr1', '1001', 'confirmed', $1, '06:00', $1, '10:30')`, [future]);
  ok('직원 배차 확정, 처리자=본인', (await one(`select decided_by from airport_rides where enrollment_id = 'tr1'`)).decided_by === U.staffC);
  await denied('처리자를 남으로', `update airport_rides set decided_by = '${U.staffP}' where enrollment_id = 'tr1'`, RLS);
  await denied('직원이 학생 항공편 수정', `insert into departure_flights (enrollment_id, student_no, depart_date, depart_time, flight, airport) values ('tr2', '1002', $1, '10:30', 'PR 1', 'CLARK')`, RLS, [future]);
});
await as(U.stA, async () => ok('학생은 자기 배차를 봄', (await count(`select count(*) n from airport_rides`)) === 1));
await as(U.stB, async () => ok('학생B는 A 배차를 못 봄', (await count(`select count(*) n from airport_rides`)) === 0));
await db.exec(`update departure_flights set depart_date = manila_today() - 1 where enrollment_id = 'tr1'`);
await as(U.stA, async () => ok('출발일 지나면 수정 안 됨', (await affected(`update departure_flights set flight = 'PR 999' where enrollment_id = 'tr1'`)) === 0));

// ── 가드: 외출·귀가, 리포트, 패널티 후보, 설정
await db.exec(`insert into outings (student_no, campus, out_at, out_by) values ('1002', 'Premium', now(), 'P 근무자')`);
await as(U.guardC, async () => {
  const o = await one(`insert into outings (student_no, enrollment_id, campus, out_at, out_by) values ('1001', 'tr1', 'Challenger', now(), '근무자1') returning id`);
  ok('가드 외출 기록', !!o.id);
  await denied('다른 출입구로 기록', `insert into outings (student_no, campus, out_at, out_by) values ('1001', 'Premium', now(), '근무자1')`, RLS);
  await denied('한 시간 전 시각으로 기록', `insert into outings (student_no, campus, out_at, out_by) values ('1001', 'Challenger', now() - interval '1 hour', '근무자1')`, RLS);
  await denied('외출 시각 고치기', `update outings set out_at = now() where id = '${o.id}'`, PERM);
  await denied('귀가를 지난 시각으로', `update outings set in_at = now() - interval '1 hour', in_by = '근무자2' where id = '${o.id}'`, RLS);
  ok('가드 귀가 기록', (await affected(`update outings set in_at = now(), in_by = '근무자2' where id = '${o.id}'`)) === 1);
  ok('귀가한 기록은 다시 못 고침', (await affected(`update outings set in_at = now(), in_by = 'x' where id = '${o.id}'`)) === 0);
  ok('가드는 자기 출입구만 봄', (await count(`select count(*) n from outings`)) === 1);
  const rep = await one(`insert into incident_reports (student_no, campus, kind, note, occurred_at, reported_by) values ('1001', 'Challenger', 'alcohol', '음주 귀가', now(), '근무자1') returning id`);
  await denied('다른 출입구 리포트', `insert into incident_reports (student_no, campus, kind, note, occurred_at, reported_by) values ('1001', 'Premium', 'alcohol', 'x', now(), '근무자1')`, RLS);
  await q(`insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ($1, '1001', 'alcohol', manila_today(), 'Challenger', '가드 리포트', 'guard', $2)`, [`guard-${rep.id}`, rep.id]);
  ok('가드 패널티 후보 등록', true);
  await denied('가드가 승인 상태로', `insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id, status) values ('guard-x', '1001', 'alcohol', manila_today(), 'Challenger', 'x', 'guard', 'x', 'approved')`, RLS);
  await denied('가드가 통금 후보', `insert into penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('curfew-x', '1001', 'curfew', manila_today(), 'Challenger', 'x', 'outing', 'x')`, RLS);
  ok('가드는 패널티 목록을 못 봄', (await count(`select count(*) n from penalties`)) === 0);
  ok('가드는 신청을 못 봄', (await count(`select count(*) n from absence_requests`)) === 0);
  ok('가드는 설정(통금)을 읽음', (await one(`select curfew::text c from intranet_settings`)).c === '23:00:00');
  ok('가드는 설정을 못 바꿈', (await affected(`update intranet_settings set curfew = '22:00'`)) === 0);
  ok('가드는 상담 목록이 비어 있음', (await count(`select count(*) n from counseling_list()`)) === 0);
});
await as(U.stA, async () => {
  ok('학생은 외출 기록을 못 봄', (await count(`select count(*) n from outings`)) === 0);
  await denied('학생이 외출 기록', `insert into outings (student_no, campus, out_at) values ('1001', 'Challenger', now())`, RLS);
});
await as(U.staffC, async () => {
  ok('직원은 외출 기록 모두 봄', (await count(`select count(*) n from outings`)) === 2);
  ok('직원 통금 변경', (await affected(`update intranet_settings set curfew = '22:30'`)) === 1);
  ok('직원 점수표 입력', (await affected(`update penalty_rules set score = 3 where code = 'curfew'`)) === 1);
  ok('직원 패널티 승인', (await affected(`update penalties set status = 'approved', score = 5, decided_at = now(), decided_by = auth.uid()`)) === 1);
});

// ── 상담 기록: 같은 캠퍼스 직원만, 내용은 함수로만, 열 때마다 기록
const today = (await one(`select manila_today()::text d`)).d;
const cn = await as(U.staffC, async () => {
  const id = (await one(`select counseling_create('1001', 'Challenger', $1, '생활 상담', '룸메이트 문제', null) id`, [today])).id;
  await denied('맡지 않은 캠퍼스에 작성', `select counseling_create('1002', 'Premium', $1, 't', 'c')`, /campus_not_allowed/, [today]);
  await denied('미래 날짜 상담', `select counseling_create('1001', 'Challenger', manila_today() + 1, 't', 'c')`, /invalid_date/);
  const list = await q(`select * from counseling_list()`);
  ok('목록에 내용 없음', list.length === 1 && !('content' in list[0]));
  await denied('테이블 직접 읽기', `select * from counseling_notes`, PERM);
  await denied('테이블 직접 쓰기', `insert into counseling_notes (student_no, campus, counsel_date, title, content, author_name) values ('1001', 'Challenger', $1, 't', 'c', 'x')`, PERM, [today]);
  ok('상세에 내용', (await one(`select content from counseling_open($1)`, [id])).content === '룸메이트 문제');
  await q(`select * from counseling_open($1)`, [id]); // 10초 안에 다시 열기
  ok('열람 기록 1건(10초 중복 제외)', (await count(`select count(*) n from audit_logs where action = 'view'`)) === 1);
  await denied('후속 조치 없는 건 완료', `select counseling_followup($1, true)`, /no_followup/, [id]);
  await q(`select counseling_update($1, $2, '생활 상담', '룸메이트 문제, 방 이동 검토', manila_today() + 7)`, [id, today]);
  await q(`select counseling_followup($1, true)`, [id]);
  ok('후속 조치 완료', (await one(`select follow_up_done, follow_up_done_by from counseling_list() where id = $1`, [id])).follow_up_done_by === '직원C');
  await q(`select counseling_update($1, $2, '생활 상담', '룸메이트 문제, 방 이동 검토', manila_today() + 10)`, [id, today]);
  ok('기한 바꾸면 다시 열림', (await one(`select follow_up_done from counseling_list() where id = $1`, [id])).follow_up_done === false);
  const acts = (await q(`select action, actor_name from audit_logs order by id`)).map((r) => r.action).join(',');
  ok('접근 기록 순서', acts === 'create,view,update,followup_done,update', `(${acts})`);
  ok('기록자 이름은 서버가 넣음', (await q(`select distinct actor_name from audit_logs`)).every((r) => r.actor_name === '직원C'));
  await denied('접근 기록 직접 쓰기', `insert into audit_logs (actor_name, action, target_id, student_no, campus) values ('x', 'view', 'x', '1001', 'Challenger')`, PERM);
  await denied('접근 기록 지우기', `delete from audit_logs`, PERM);
  await denied('기록 함수 직접 호출', `select counseling_audit('view', null::counseling_notes)`, PERM);
  return id;
});
for (const [who, name] of [[U.staffP, '다른 캠퍼스 직원'], [U.staffN, '캠퍼스 미지정 직원'], [U.stA, '학생'], [U.guardC, '가드'], [U.nobody, '역할 없는 사용자']]) {
  await as(who, async () => {
    ok(`${name}: 상담 목록 비어 있음`, (await count(`select count(*) n from counseling_list()`)) === 0);
    await denied(`${name}: 상담 열기`, `select * from counseling_open($1)`, /not_found/, [cn]);
    await denied(`${name}: 상담 수정`, `select counseling_update($1, manila_today(), 't', 'c')`, /not_found/, [cn]);
    ok(`${name}: 접근 기록 안 보임`, (await count(`select count(*) n from audit_logs`)) === 0);
  });
}

// ── 공지, 계정 표
await as(U.staffC, async () => {
  const n = await one(`insert into internal_notices (title, content, author_name) values ('점검', '내일 점검', '직원C') returning id`);
  await q(`insert into internal_notice_reads (notice_id, name) values ($1, '직원C')`, [n.id]);
  await denied('남 이름으로 읽음', `insert into internal_notice_reads (notice_id, user_id, name) values ($1, '${U.staffP}', 'x')`, RLS, [n.id]);
  ok('직원은 학생 계정 표를 봄', (await count(`select count(*) n from student_users`)) === 2);
});
await as(U.stA, async () => {
  ok('학생은 공지를 못 봄', (await count(`select count(*) n from internal_notices`)) === 0);
  ok('학생은 자기 계정만', (await count(`select count(*) n from student_users`)) === 1);
  ok('첫 로그인 비밀번호 변경 필요', (await one(`select must_change_password m from student_users`)).m === true);
  await denied('학생이 계정 표 수정', `update student_users set student_no = '1002'`, PERM);
  await q(`select student_password_changed()`);
  ok('비밀번호 변경 표시', (await one(`select must_change_password m from student_users`)).m === false);
  ok('학생은 직원 캠퍼스 표를 못 봄', (await count(`select count(*) n from staff_campuses`)) === 0);
});

// ── 생활 요청(nonacademic_requests): 학생은 자기 연수로 접수만, 취소는 접수 상태만, 처리는 직원 함수로
const nr = await as(U.stA, async () => {
  const id = 'b0000000-0000-4000-8000-000000000001';
  await q(`insert into nonacademic_requests (id, student_no, enrollment_id, category, content) values ('${id}', '1001', 'tr1', 'facility', '샤워기 고장')`);
  ok('학생 생활 요청 등록(접수)', (await one(`select status from nonacademic_requests where id = '${id}'`)).status === 'received');
  await denied('남의 학생번호로 생활 요청', `insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1002', 'tr2', 'other', 'x')`, RLS);
  await denied('남의 연수로 생활 요청', `insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1001', 'tr2', 'other', 'x')`, RLS);
  await denied('완료 상태로 등록', `insert into nonacademic_requests (student_no, enrollment_id, category, content, status) values ('1001', 'tr1', 'other', 'x', 'done')`, PERM);
  await denied('없는 종류', `insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1001', 'tr1', 'laundry', 'x')`, CHECK);
  await denied('학생이 직접 답변', `update nonacademic_requests set staff_reply = 'x' where id = '${id}'`, PERM);
  await denied('학생이 처리 함수', `select handle_nonacademic_request('${id}', 'done', 'x')`, /staff_only/);
  for (let i = 0; i < 4; i++) await q(`insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1001', 'tr1', 'other', '요청 ${i}')`);
  await denied('열린 요청 5건이면 더 못 냄', `insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1001', 'tr1', 'other', '여섯째')`, RLS);
  const another = (await one(`select id from nonacademic_requests where content = '요청 0'`)).id;
  await q(`select cancel_nonacademic_request('${another}')`);
  ok('학생 취소(접수 상태)', (await one(`select status from nonacademic_requests where id = '${another}'`)).status === 'cancelled');
  await q(`insert into nonacademic_requests (student_no, enrollment_id, category, content) values ('1001', 'tr1', 'document', '취소 뒤 다시')`);
  ok('취소하면 다시 낼 수 있음', true);
  return id;
});
await as(U.stB, async () => {
  ok('학생B는 A 생활 요청을 못 봄', (await count(`select count(*) n from nonacademic_requests`)) === 0);
  await denied('학생B가 A 요청 취소', `select cancel_nonacademic_request('${nr}')`, /not_pending/);
});
await as(U.staffC, async () => {
  ok('직원은 생활 요청 모두 봄', (await count(`select count(*) n from nonacademic_requests`)) === 6);
  await denied('반려는 사유 필수', `select handle_nonacademic_request('${nr}', 'rejected', '')`, /reply_required/);
  await q(`select handle_nonacademic_request('${nr}', 'in_progress', '오늘 오후 수리')`);
  const x = await one(`select status, staff_reply, handled_by::text from nonacademic_requests where id = '${nr}'`);
  ok('직원 처리 중 + 답변, 처리자 = 본인', x.status === 'in_progress' && x.staff_reply === '오늘 오후 수리' && x.handled_by === U.staffC, x);
  await denied('처리 중을 다시 처리 중으로', `select handle_nonacademic_request('${nr}', 'in_progress', null)`, /already_in_progress/);
  await q(`select handle_nonacademic_request('${nr}', 'done', null)`);
  ok('완료(답변 그대로)', (await one(`select staff_reply from nonacademic_requests where id = '${nr}'`)).staff_reply === '오늘 오후 수리');
  await denied('끝난 요청은 못 바꿈', `select handle_nonacademic_request('${nr}', 'rejected', 'x')`, /already_closed/);
  await denied('직원이 직접 수정', `update nonacademic_requests set status = 'received' where id = '${nr}'`, PERM);
});
await as(U.stA, async () => {
  ok('학생이 완료·답변을 봄', (await one(`select status, staff_reply from nonacademic_requests where id = '${nr}'`)).staff_reply === '오늘 오후 수리');
  await denied('처리된 요청 취소', `select cancel_nonacademic_request('${nr}')`, /not_pending/);
});
await as(U.guardC, async () => ok('가드는 생활 요청을 못 봄', (await count(`select count(*) n from nonacademic_requests`)) === 0));

// ── 익명, 서비스 키
await as(null, async () => {
  await denied('익명 신청 읽기', `select * from absence_requests`, PERM);
  await denied('익명 상담 목록', `select * from counseling_list()`, PERM);
  await denied('익명 설정 읽기', `select * from intranet_settings`, PERM);
});
await db.exec(`set role service_role`);
ok('서비스 키는 상담 테이블을 읽음', (await count(`select count(*) n from counseling_notes`)) === 1);
await db.exec(`reset role`);

console.log(`통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
