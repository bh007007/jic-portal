// 변경 요청(20261110100000_change_requests.sql)의 권한·상태 시험: 직원만 읽고 쓰고, 상태는 정한 길로만 바뀌고,
// 끝난 요청은 바꾸지 못하고, 상태가 바뀔 때마다 기록이 남는다. 데이터는 가짜.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/change_requests_rls.mjs
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
await db.exec(mig('20261107000000_legacy_tables.sql'));
await db.exec(mig('20261110100000_change_requests.sql'));
await db.exec(mig('20261110100000_change_requests.sql')); // 두 번째 실행
await db.exec(mig('20261110203000_change_request_search_path.sql')); // 상태 길 함수 search_path 고정(보안 진단) 뒤에도 같은 결과
await db.exec(mig('20261110213000_change_request_fk_indexes.sql'));
await db.exec(mig('20261110213000_change_request_fk_indexes.sql')); // 성능 진단 인덱스, 두 번째 실행
ok('마이그레이션 2회 실행', true);

const STAFF = '00000000-0000-0000-0000-0000000000c1';
const STAFF2 = '00000000-0000-0000-0000-0000000000c2';
const OTHER = '00000000-0000-0000-0000-0000000000a1';
await db.exec(`
  insert into auth.users (id) values ('${STAFF}'), ('${STAFF2}'), ('${OTHER}');
  insert into public.staff_users (user_id, name) values ('${STAFF}', '직원'), ('${STAFF2}', '직원2');
`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function denied(name, sql, pattern) {
  try {
    await db.query(sql);
    fails.push(`${name}: 막혀야 하는데 성공`);
  } catch (e) {
    ok(name, pattern.test(e.message), `(오류: ${e.message})`);
  }
}
const one = async (sql) => (await db.query(sql)).rows[0];

// 1) 직원이 만든다
const id = await as(STAFF, async () => {
  const r = await one(`insert into public.change_requests (tr_id, st_id, kind, want, period_from, period_to, content)
    values ('tr1', 'st1', 'course', 'ESL → TOEIC', '2026-12-01', '2026-12-28', '학생이 메신저로 요청') returning id, state, source, created_by`);
  ok('직원: 만들기(신청, 출처 staff, 만든 사람 = 나)', r.state === 'requested' && r.source === 'staff' && r.created_by === STAFF, JSON.stringify(r));
  return r.id;
});
await as(STAFF, async () => {
  await denied('직원: 출처 바꿔 넣기 거부', `insert into public.change_requests (tr_id, kind, source) values ('tr1', 'other', 'student')`, /permission denied/);
  await denied('직원: 승인 상태로 바로 만들기 거부', `insert into public.change_requests (tr_id, kind, state) values ('tr1', 'other', 'approved')`, /신청 또는 접수/);
  await denied('직원: 기간 거꾸로 거부', `insert into public.change_requests (tr_id, kind, period_from, period_to) values ('tr1', 'dorm', '2026-12-10', '2026-12-01')`, /change_requests_period/);
  await denied('직원: 모르는 종류 거부', `insert into public.change_requests (tr_id, kind) values ('tr1', 'refund')`, /check constraint/);
  await denied('직원: 지우기 거부', `delete from public.change_requests where id = ${id}`, /permission denied/);
  await denied('직원: 연수 바꾸기 거부', `update public.change_requests set tr_id = 'tr9' where id = ${id}`, /permission denied/);
});

// 2) 다른 사람
await as(OTHER, async () => {
  ok('직원 아님: 0행', (await db.query(`select * from public.change_requests`)).rows.length === 0);
  await denied('직원 아님: 만들기 거부', `insert into public.change_requests (tr_id, kind) values ('tr1', 'other')`, /row-level security/);
  ok('직원 아님: 고치기 0행', (await db.query(`update public.change_requests set content = 'x' where id = ${id} returning id`)).rows.length === 0);
  ok('직원 아님: 기록 0행', (await db.query(`select * from public.change_request_log`)).rows.length === 0);
});
await as(null, () => denied('익명: 읽기 거부', `select * from public.change_requests`, /permission denied/));

// 3) 상태 흐름: 신청 → 승인(건너뛰기) 거부, 신청 → 접수 → 승인 → 완료
await as(STAFF, async () => {
  await denied('신청 → 승인 바로 거부', `update public.change_requests set state = 'approved' where id = ${id}`, /바꿀 수 없습니다/);
  const r1 = await one(`update public.change_requests set state = 'received', staff_memo = '학비 차액 확인 중' where id = ${id} returning state, decided_by, updated_by`);
  ok('신청 → 접수', r1.state === 'received' && r1.decided_by === null && r1.updated_by === STAFF, JSON.stringify(r1));
});
await as(STAFF2, async () => {
  ok('다른 직원도 읽기', (await db.query(`select * from public.change_requests where id = ${id}`)).rows.length === 1);
  const r2 = await one(`update public.change_requests set state = 'approved', reply = '12/1부터 TOEIC', tuition_fee = 150 where id = ${id} returning state, decided_by, decided_at`);
  ok('접수 → 승인(결정자 = 승인한 직원)', r2.state === 'approved' && r2.decided_by === STAFF2 && r2.decided_at !== null, JSON.stringify(r2));
  const r3 = await one(`update public.change_requests set state = 'done' where id = ${id} returning state, decided_by`);
  ok('승인 → 완료(결정자 그대로)', r3.state === 'done' && r3.decided_by === STAFF2, JSON.stringify(r3));
  await denied('완료 뒤 상태 바꾸기 거부', `update public.change_requests set state = 'canceled' where id = ${id}`, /끝난 변경 요청/);
  await denied('완료 뒤 내용 바꾸기 거부', `update public.change_requests set staff_memo = 'x' where id = ${id}`, /끝난 변경 요청/);
});

// 4) 기록: 만들기·접수·승인·완료 4줄, 순서와 사람
await as(STAFF, async () => {
  const log = (await db.query(`select state, actor from public.change_request_log where request_id = ${id} order by id`)).rows;
  ok('상태 기록 4줄', log.map((l) => l.state).join(',') === 'requested,received,approved,done', JSON.stringify(log));
  ok('기록한 사람', log[0].actor === STAFF && log[2].actor === STAFF2, JSON.stringify(log));
  await denied('직원: 기록 쓰기 거부', `insert into public.change_request_log (request_id, state) values (${id}, 'done')`, /permission denied/);
  // 내용만 고치면 기록이 늘지 않는다
  const id2 = (await one(`insert into public.change_requests (tr_id, kind, state) values ('tr2', 'extension', 'received') returning id`)).id;
  await db.query(`update public.change_requests set want = '4주 연장' where id = ${id2}`);
  ok('내용만 고치면 기록 그대로', (await db.query(`select * from public.change_request_log where request_id = ${id2}`)).rows.length === 1);
  const r = await one(`update public.change_requests set state = 'rejected' where id = ${id2} returning state, decided_by`);
  ok('접수 → 거절(결정자)', r.state === 'rejected' && r.decided_by === STAFF, JSON.stringify(r));
});

console.log(`변경 요청 권한·상태 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
