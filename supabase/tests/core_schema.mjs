// 정규화 스키마 1단계(20261110110000_core_schema.sql) 시험: 가짜 샘플 업체 원본(legacy_*)을 넣고 load_core_from_legacy() 로 채운 뒤
// 건수·값 바꾸기·종료일(연장 반영)·상태가 관리자 core 규칙과 같은지, 두 번 돌려도 같은지, 직원만 읽는지 본다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/core_schema.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
const nd = (f) => readFileSync(new URL(`../../data-sample/tables/${f}`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

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
await db.exec(mig('20261109030000_legacy_extend.sql'));
await db.exec(mig('20261110110000_core_schema.sql'));
await db.exec(mig('20261110110000_core_schema.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

// 가짜 샘플 업체 원본
const students = nd('students.ndjson');
const enrollments = nd('enrollments.ndjson');
const extensions = nd('extend.ndjson');
const put = async (table, rows, idOf) => {
  for (const r of rows) await db.query(`insert into public.${table} (id, data) values ($1, $2::jsonb)`, [String(idOf(r)), JSON.stringify(r)]);
};
await put('legacy_students', students, (r) => r.st_id);
await put('legacy_enrollments', enrollments, (r) => r.tr_id);
await put('legacy_extensions', extensions, (r) => r.tt_id);

const STAFF = '00000000-0000-0000-0000-0000000000c1';
const OTHER = '00000000-0000-0000-0000-0000000000a1';
await db.exec(`
  insert into auth.users (id) values ('${STAFF}'), ('${OTHER}');
  insert into public.staff_users (user_id, name) values ('${STAFF}', '직원');
`);
async function as(user, fn, role) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${role ?? (user ? 'authenticated' : 'anon')};`);
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

// 1) 불러오기: 서비스 키만, 두 번 돌려도 같은 건수
await as(STAFF, () => denied('직원: 불러오기 함수 거부', `select * from public.load_core_from_legacy()`, /permission denied/));
const counts = async () => Object.fromEntries((await as(null, () => db.query(`select * from public.load_core_from_legacy()`), 'service_role')).rows.map((r) => [r.tbl, r.row_count]));
const c1 = await counts();
const c2 = await counts();
const batchCount = new Set(enrollments.map((e) => e.sd_name).filter(Boolean)).size;
ok('건수: 학생·기수·연수·연장', c1.students === students.length && c1.batches === batchCount && c1.enrollments === enrollments.length && c1.enrollment_extensions === extensions.length, JSON.stringify(c1));
ok('두 번 돌려도 같은 건수', JSON.stringify(c1) === JSON.stringify(c2), JSON.stringify(c2));

// 2) 값 바꾸기(샘플 첫 행)
const s0 = students[0];
const e0 = enrollments[0];
const sRow = (await db.query(`select * from public.students where student_no = $1`, [s0.st_id])).rows[0];
ok('학생 값', sRow.name === s0.st_name && sRow.gender === s0.st_gender && sRow.country === s0.st_country_cd_name && String(sRow.birthday?.toISOString?.() ?? sRow.birthday).startsWith(s0.st_birthday), JSON.stringify(sRow));
const eRow = (await db.query(`select *, to_char(start_date, 'YYYY-MM-DD') s, to_char(finish_date, 'YYYY-MM-DD') f, to_char(invoiced_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') inv from public.enrollments where id = $1`, [e0.tr_id])).rows[0];
ok('연수 값', eRow.student_no === e0.tr_st_id && eRow.batch_id === e0.sd_name && eRow.s === e0.tr_start_date && eRow.f === e0.tr_finish_date && eRow.weeks === Number(e0.tr_total_week) && eRow.campus_code === e0.first_co_ca_code && eRow.room_clear === (e0.tr_room_clear_yn === 'Y') && eRow.inv === e0.tr_invoice_dt, JSON.stringify(eRow));
ok('빈 값은 빈 글자(널 아님)', (await db.query(`select count(*)::int n from public.enrollments where agency_memo is null or pickup_type is null`)).rows[0].n === 0);

// 3) 종료일 = 원래 종료일과 마지막 연장 종료일 중 늦은 날(core finishOf)
const extEnd = new Map();
for (const t of extensions) extEnd.set(t.tr_id, (extEnd.get(t.tr_id) ?? '') > t.tt_finish_date ? extEnd.get(t.tr_id) : t.tt_finish_date);
const endOf = (e) => { const f = e.tr_finish_date ?? ''; const x = extEnd.get(e.tr_id) ?? ''; return x > f ? x : f; };
const periods = new Map((await db.query(`select id, to_char(end_date, 'YYYY-MM-DD') e, extensions from public.enrollment_periods`)).rows.map((r) => [r.id, r]));
const badEnd = enrollments.filter((e) => (periods.get(e.tr_id)?.e ?? '') !== endOf(e));
ok('종료일(연장 반영) 모두 같음', badEnd.length === 0, JSON.stringify(badEnd.slice(0, 3).map((e) => [e.tr_id, periods.get(e.tr_id)?.e, endOf(e)])));
ok('연장 있는 연수가 있고 늘어난 종료일이 있음', enrollments.some((e) => endOf(e) > e.tr_finish_date));

// 4) 상태(core statusOf 와 같은 규칙)를 기준일 하나로
const REF = '2026-11-07';
const CANCELLED = /캔슬|거절|취소|연기|홀드|요청/;
const jsStatus = (e) => {
  const state = e.tr_state_name ?? '';
  if (CANCELLED.test(state)) return 'cancelled';
  const s = e.tr_start_date, f = endOf(e);
  if (!s || !f) return 'other';
  if (s > REF) return 'upcoming';
  if (state === '퇴교') return 'other';
  return f < REF ? 'graduated' : 'current';
};
const sqlStatus = new Map((await db.query(`select e.id, public.enrollment_status(e.state_name, p.start_date, p.end_date, $1::date) st from public.enrollments e join public.enrollment_periods p on p.id = e.id`, [REF])).rows.map((r) => [r.id, r.st]));
const badStatus = enrollments.filter((e) => sqlStatus.get(e.tr_id) !== jsStatus(e));
const byStatus = {};
for (const v of sqlStatus.values()) byStatus[v] = (byStatus[v] ?? 0) + 1;
ok('상태 모두 같음', badStatus.length === 0, JSON.stringify(badStatus.slice(0, 3).map((e) => [e.tr_id, sqlStatus.get(e.tr_id), jsStatus(e)])));
ok('상태가 여럿 나옴(재학·입학 예정·졸업·취소)', ['current', 'upcoming', 'graduated', 'cancelled'].every((k) => byStatus[k] > 0), JSON.stringify(byStatus));

// 5) 권한: 직원만 읽기, 아무도 직접 쓰지 못함
for (const t of ['students', 'batches', 'enrollments', 'enrollment_extensions', 'enrollment_periods']) {
  await as(STAFF, async () => ok(`직원: ${t} 읽기`, (await db.query(`select * from public.${t} limit 1`)).rows.length === 1));
  await as(OTHER, async () => ok(`직원 아님: ${t} 0행`, (await db.query(`select * from public.${t}`)).rows.length === 0));
  await as(null, () => denied(`익명: ${t} 거부`, `select * from public.${t}`, /permission denied/));
}
await as(STAFF, async () => {
  await denied('직원: 학생 쓰기 거부', `insert into public.students (student_no) values ('x1')`, /permission denied/);
  await denied('직원: 연수 고치기 거부', `update public.enrollments set courses = 'x'`, /permission denied/);
});

console.log(`정규화 스키마 1단계 시험: 통과 ${pass}, 실패 ${fails.length}`, byStatus);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
