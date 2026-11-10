// 보안 규칙 시험(11/10, Supabase 보안 진단을 CI 로): 마이그레이션 전체를 순서대로 두 번 적용한 뒤 DB 전체를 훑는다.
// 에이전시 가입을 열면 '역할 없는 로그인 사용자'가 생기므로, 그 사람과 익명이 아무것도 못 읽는지와 새 마이그레이션이 규칙을 지키는지 본다.
//   1. public 의 모든 표에 RLS 가 켜져 있다.
//   2. 익명·로그인 사용자에게 열린 정책은 역할 확인 함수(is_staff 등)나 본인 확인(auth.uid())을 거친다. 예외는 아래 OPEN 목록뿐.
//   3. SECURITY DEFINER 함수는 익명이 실행할 수 없고, 로그인 사용자가 실행할 수 있으면 함수 안에서 역할을 확인한다. 예외는 UNGUARDED 목록뿐.
//   4. SECURITY DEFINER 트리거 함수는 아무도 직접 실행할 수 없다(20261110131500_trigger_fn_privileges.sql 과 같은 규칙).
//   5. 뷰는 security_invoker 로 만든다(보는 사람 권한으로 읽게).
//   7. public 의 모든 함수는 search_path 를 고정한다(Supabase 진단 'Function Search Path Mutable', 11/10 change_request_next_ok).
//   6. 실제로 읽어 보기: 샘플 학생·연수(가짜)와 에이전시 포털 기본 행을 넣고, 역할 없는 사용자·익명이 모든 표와 표를 돌려주는 DEFINER 함수에서 0행이다.
// 규칙을 일부러 벗어나야 하면 아래 목록에 이유와 함께 더하고 docs/setup-cloud.md '보안 진단'에 적는다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/security_lint.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const MIG = new URL('../migrations/', import.meta.url);
const SAMPLE = new URL('../../data-sample/tables/', import.meta.url);

// 누구나(또는 로그인한 누구나) 읽어도 되는 정책: 표.정책
const OPEN = new Map([
  ['campuses.campuses_public_read', '로그인 전 대시보드의 캠퍼스 카드(원칙 P2)'],
  ['holidays.holidays_read', '휴일 날짜(공휴일·학원 휴일), 개인정보 없음'],
]);
// 로그인 사용자가 실행할 수 있지만 함수 안에 역할 확인이 없는 DEFINER 함수
const UNGUARDED = new Map([
  ['attendance_closed', '그날 출석 마감 여부(참·거짓)'],
  ['counseling_actor_name', '부른 사람 자신의 이름'],
  ['enrollment_of_student', '연수·학생번호가 맞는지(참·거짓). 학생 신청 정책이 써서 권한을 거둘 수 없음. 실제 데이터 전 확인 넣을지 결정(docs/setup-cloud.md)'],
]);
// 역할 확인으로 보는 것
const GUARD = /(is_staff|is_admin|is_lms|is_guard|is_student|is_partner|is_intranet_manager|has_role|can_schedule|can_mark|teaches_session|current_student_no|current_guard_campus|staff_has_campus|counseling_campus_ok|intranet_manager_campus_ok|auth\.uid\(\)|not_allowed)/i;

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const q = async (sql, params) => (await db.query(sql, params)).rows;

// Supabase 와 같은 기본 권한: 표·함수는 만들면 anon·authenticated 에게 열린다(RLS 와 함수 안 확인으로 막는다)
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); -- 실제 Supabase 처럼 크기·종류 제한 열
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  -- 실제 Supabase 의 storage.foldername(경로의 폴더들). Storage 정책이 쓴다(20261110150000_absence_documents.sql)
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
for (const round of [1, 2]) {
  for (const f of files) {
    try {
      await db.exec(readFileSync(new URL(f, MIG), 'utf8'));
    } catch (e) {
      fails.push(`마이그레이션 ${round}회차 ${f}: ${e.message.slice(0, 160)}`);
    }
  }
}
ok(`마이그레이션 ${files.length}개 두 번 적용`, true);

// 1. RLS
const noRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`);
ok('모든 표 RLS 켜짐', noRls.length === 0, noRls.map((r) => r.relname).join(', '));

// 2. 정책
const policies = await q(`select tablename t, policyname p, cmd, roles::text roles, coalesce(qual, '') qual, coalesce(with_check, '') chk from pg_policies where schemaname = 'public'`);
for (const p of policies) {
  const key = `${p.t}.${p.p}`;
  const forAll = /public|anon|authenticated/.test(p.roles);
  if (!forAll) continue;
  // 읽기·지우기는 USING, 넣기는 WITH CHECK, 고치기·전부는 둘 다(WITH CHECK 가 있으면)
  const guarded = p.cmd === 'INSERT' ? GUARD.test(p.chk) : GUARD.test(p.qual) && (!p.chk || GUARD.test(p.chk));
  if (!guarded) ok(`정책 ${key}(${p.cmd}): 역할 확인 또는 허용 목록`, OPEN.has(key), `qual=${p.qual.slice(0, 80)} check=${p.chk.slice(0, 80)}`);
}
ok('정책 확인', true, `${policies.length}개`);

// 3·4. DEFINER 함수
const fns = await q(`
  select p.oid::int oid, p.proname name, pg_get_function_identity_arguments(p.oid) args, p.proretset retset,
    t.typname rettype, p.prosrc src,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
  where n.nspname = 'public' and p.prosecdef`);
for (const f of fns) {
  const sig = `${f.name}(${f.args})`;
  if (['trigger', 'event_trigger'].includes(f.rettype)) {
    ok(`트리거 함수 ${sig}: 직접 실행 불가`, !f.anon_x && !f.auth_x, `anon=${f.anon_x} authenticated=${f.auth_x}`);
    continue;
  }
  ok(`DEFINER 함수 ${sig}: 익명 실행 불가`, !f.anon_x);
  if (f.auth_x && !GUARD.test(f.src)) ok(`DEFINER 함수 ${sig}: 함수 안 역할 확인 또는 허용 목록`, UNGUARDED.has(f.name));
}
ok('DEFINER 함수 확인', true, `${fns.length}개`);

// 7. 함수 search_path 고정(DEFINER 가 아니어도). 확장 기능이 만든 함수는 뺀다
const loose = await q(`
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
ok('함수 search_path 고정', loose.length === 0, loose.map((r) => r.sig).join(', '));

// 5. 뷰
const views = await q(`select c.relname, coalesce(array_to_string(c.reloptions, ','), '') opts from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v','m')`);
for (const v of views) ok(`뷰 ${v.relname}: security_invoker`, /security_invoker=(true|on)/.test(v.opts), v.opts || '(옵션 없음)');

// 6. 실제로 읽어 보기
const nd = (f) => readFileSync(new URL(f, SAMPLE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const load = async (table, rows, idOf) => {
  for (const r of rows) await db.query(`insert into public.${table} (id, data) values ($1, $2::jsonb) on conflict do nothing`, [String(idOf(r)), JSON.stringify(r)]);
};
const students = nd('students.ndjson');
await load('legacy_students', students, (r) => r.st_id);
await load('legacy_enrollments', nd('enrollments.ndjson'), (r) => r.tr_id);
await load('legacy_dorm_assignments', nd('dorm_assignments.ndjson'), (r) => r.tr_id);
const STAFF = '00000000-0000-0000-0000-00000000c0c1';
const NOBODY = '00000000-0000-0000-0000-00000000dead'; // 에이전시 가입만 하고 승인 전인 사람과 같다
await db.exec(`
  insert into auth.users (id, email) values ('${STAFF}', 'staff@example.com'), ('${NOBODY}', 'nobody@example.com');
  insert into public.staff_users (user_id, name) values ('${STAFF}', '직원');
  insert into public.user_roles (user_id, role, campus) values ('${STAFF}', 'office', '');
`);
try {
  await db.exec(`select public.load_core_from_legacy()`); // 정규화 표(학생·연수)도 채워 둔다
} catch (e) {
  fails.push(`정규화 표 채우기: ${e.message.slice(0, 120)}`);
}
const tables = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`)).map((r) => r.relname);
const filled = (await q(`select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public'`)).length;
const someStudent = students[0]?.st_id ?? '1';
async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
// 표를 돌려주는 DEFINER 함수를 넓은 기간·샘플 학생 번호로 부른다(쓰기 함수는 표를 돌려주지 않아 부르지 않는다)
const argFor = (name, type, i, types) => {
  if (type === 'date') return types.slice(0, i).includes('date') ? "'2100-12-31'::date" : "'2000-01-01'::date";
  if (type === 'text') return /student/.test(name) ? `'${someStudent}'` : 'null::text';
  if (type === 'boolean') return 'true';
  if (type === 'uuid') return `'${NOBODY}'::uuid`;
  return `null::${type}`;
};
const setFns = await q(`
  select p.proname name, coalesce(p.proargnames, '{}') argnames, array(select format_type(t, null) from unnest(p.proargtypes) t) argtypes, p.pronargs n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proretset`);
for (const [who, user] of [['역할 없는 로그인 사용자', NOBODY], ['익명', null]]) {
  await as(user, async () => {
    for (const t of tables) {
      let rows = 0;
      try {
        rows = (await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n;
      } catch {
        rows = 0; // 권한 없음 = 못 읽음
      }
      const allowed = [...OPEN.keys()].some((k) => k.startsWith(`${t}.`) && (user || k === 'campuses.campuses_public_read'));
      if (rows > 0) ok(`${who}: ${t} 못 읽음`, allowed, `${rows}행`);
    }
    for (const f of setFns) {
      const args = f.argtypes.map((ty, i) => argFor(f.argnames[i] ?? '', ty, i, f.argtypes)).join(', ');
      let rows = 0;
      try {
        rows = (await db.query(`select count(*)::int n from public."${f.name}"(${args}) x`)).rows[0].n;
      } catch {
        rows = 0;
      }
      ok(`${who}: ${f.name}() 0행`, rows === 0, `${rows}행`);
    }
  });
}
// 직원은 같은 방법으로 읽힌다(위 0행이 '데이터가 없어서'가 아님을 확인)
await as(STAFF, async () => {
  ok('직원: 학생 원본 읽음', (await q(`select count(*)::int n from public.legacy_students`))[0].n === students.length);
  ok('직원: 정규화 연수 읽음', (await q(`select count(*)::int n from public.enrollments`))[0].n > 0);
});
ok('표 훑기', true, `표·뷰 ${tables.length}개, 통계 ${filled}개`);

console.log(`보안 규칙 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
