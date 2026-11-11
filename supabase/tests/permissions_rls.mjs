// 권한 구조 1단계(20261112110000_permissions_foundation.sql, CL-025, 11/12 레오님 결정 6가지) 시험. 데이터는 전부 가짜다.
// - 기본값이 지금 규칙과 같다(관리자·오피스·강사·매니저·센터장의 보기·입력·승인)
// - 센터장은 관리자가 아니다(오피스 없이 센터장만 남아도). 센터장은 자기 캠퍼스로만, 남에게만 승인·강사 포털 역할을 준다
// - 사람별 '빼기'가 기본값보다 앞선다. 직원·강사 포털 사용자가 아니면 '더하기'도 뜻이 없다
// - 권한표는 직원이 읽고 관리자만 고친다. 판단 함수는 로그인 사용자만
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/permissions_rls.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const mig = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
// 역할(user_roles·is_admin)이 여러 앱 마이그레이션에 걸쳐 있어 security_lint 처럼 전부 차례로 적용한다(이 파일까지)
const THIS = '20261112110000_permissions_foundation.sql';
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql') && x <= THIS).sort()) await db.exec(mig(f));
await db.exec(mig(THIS)); // 두 번째 실행
ok('마이그레이션 2회 실행', true);
ok('메뉴 그룹 23개', (await q(`select count(*)::int n from public.menu_groups`))[0].n === 23);
ok('승인 종류 13개', (await q(`select count(*)::int n from public.approval_kinds`))[0].n === 13);
ok('2회 실행해도 기본값이 늘지 않음', (await q(`select count(*)::int n from public.role_permissions`))[0].n === (await q(`select count(distinct (menu_group, role))::int n from public.role_permissions`))[0].n);

const U = {
  admin: '00000000-0000-0000-0000-0000000000d1', // 역할 없는 직원 = 관리자
  office: '00000000-0000-0000-0000-0000000000d2', // 오피스(모든 캠퍼스)
  dir: '00000000-0000-0000-0000-0000000000d3', // 오피스 + Premium 센터장
  dirOnly: '00000000-0000-0000-0000-0000000000d4', // 센터장만(오피스 없음)
  teacher: '00000000-0000-0000-0000-0000000000d5', // 강사(직원 아님)
  manager: '00000000-0000-0000-0000-0000000000d6', // Premium 매니저(직원 아님)
  office2: '00000000-0000-0000-0000-0000000000d7', // 오피스(Premium)
  agency: '00000000-0000-0000-0000-0000000000a1',
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@example.com', now())`).join(', ')};
  insert into public.staff_users (user_id, name) values
    ('${U.admin}', '관리자'), ('${U.office}', '오피스'), ('${U.dir}', '센터장'), ('${U.dirOnly}', '센터장만'), ('${U.office2}', '오피스2');
  insert into public.user_roles (user_id, role, campus) values
    ('${U.office}', 'office', ''), ('${U.dir}', 'office', 'Premium'), ('${U.dir}', 'director', 'Premium'), ('${U.dirOnly}', 'director', 'Challenger'),
    ('${U.teacher}', 'teacher', ''), ('${U.manager}', 'manager', 'Premium'), ('${U.office2}', 'office', 'Premium');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values ('${U.agency}', 'agency@example.com', '샘플유학', '서울', '한국', 'active');
`);
async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const fail = async (name, fn, re = /./) => {
  try {
    await fn();
    fails.push(`${name}: 막혀야 함`);
  } catch (e) {
    ok(name, re.test(e.message), e.message);
  }
};
const one = async (sql) => Object.values((await q(sql))[0])[0];
const view = (g) => one(`select public.can_view('${g}')`);
const input = (g, c = '') => one(`select public.can_input('${g}', '${c}')`);
const approve = (k, c = '') => one(`select public.can_approve('${k}', '${c}')`);

// 1) 관리자 판단: 센터장은 관리자가 아니다
await as(U.admin, async () => ok('역할 없는 직원 = 관리자', (await one(`select public.is_admin()`)) === true));
await as(U.dir, async () => ok('오피스+센터장은 관리자 아님', (await one(`select public.is_admin()`)) === false));
await as(U.dirOnly, async () => ok('센터장만 있어도 관리자 아님', (await one(`select public.is_admin()`)) === false));

// 2) 기본값 = 지금 규칙(docs/permissions.md 2·3장)
await as(U.admin, async () => {
  ok('관리자: 모든 메뉴 보기', (await one(`select bool_and(public.can_view(key)) from public.menu_groups`)) === true);
  ok('관리자: 사용자·권한 입력', (await input('base_admin')) === true);
  ok('관리자: 회계 입력', (await input('accounting')) === true);
  ok('관리자: 역할 주기 승인', (await approve('grant_roles')) === true);
  ok('관리자: 상담 기록 입력(모든 캠퍼스)', (await input('life_counsel', 'challenger')) === true);
  ok('관리자: 방문 확정 기본값 없음(처리자 지정이 따로)', (await approve('visit_confirm', 'premium')) === false);
});
await as(U.office, async () => {
  ok('오피스: 회계 보기', (await view('accounting')) === true);
  ok('오피스: 회계 입력 불가', (await input('accounting')) === false);
  ok('오피스: 사용자·권한 안 보임', (await view('base_admin')) === false);
  ok('오피스: 통금·근무자 설정 입력(결정 ④)', (await input('life_settings')) === true);
  ok('오피스: 출석 체크 안 보임', (await view('lms_attendance')) === false);
  ok('오피스: 결석 승인(모든 캠퍼스)', (await approve('absence_decide', 'Challenger')) === true);
  ok('오피스: 출석 마감 승인 없음', (await approve('attendance_close', 'premium')) === false);
  ok('오피스: 역할 주기 없음', (await approve('grant_roles')) === false);
});
await as(U.office2, async () => {
  ok('Premium 오피스: 상담 입력 Premium', (await input('life_counsel', 'premium')) === true);
  ok('Premium 오피스: 상담 입력 Challenger 불가', (await input('life_counsel', 'challenger')) === false);
});
await as(U.teacher, async () => {
  ok('강사: 대시보드 안 보임', (await view('dashboard')) === false);
  ok('강사: 출석 입력', (await input('lms_attendance')) === true);
  ok('강사: 수업 관리 입력 불가', (await input('lms_classes')) === false);
  ok('강사: 공지 보기', (await view('notices')) === true);
  ok('강사: 결석 승인 없음', (await approve('absence_decide', 'premium')) === false);
});
await as(U.manager, async () => {
  ok('Premium 매니저: 결석 승인 Premium', (await approve('absence_decide', 'premium')) === true);
  ok('Premium 매니저: 결석 승인 Challenger 불가', (await approve('absence_decide', 'challenger')) === false);
  ok('Premium 매니저: 출석 마감 Premium', (await approve('attendance_close', 'Premium')) === true);
  ok('매니저: 회계 안 보임', (await view('accounting')) === false);
});
await as(U.dir, async () => {
  ok('센터장: 방문 확정 Premium', (await approve('visit_confirm', 'premium')) === true);
  ok('센터장: 방문 확정 Challenger 불가', (await approve('visit_confirm', 'challenger')) === false);
  ok('센터장: 통금 패널티 Premium', (await approve('penalty_curfew', 'premium')) === true);
  ok('센터장: 사용자·권한 안 보임', (await view('base_admin')) === false);
});
await as(U.agency, async () => {
  ok('에이전시: 대시보드 안 보임', (await view('dashboard')) === false);
  ok('에이전시: 권한표 0건', (await q(`select * from public.role_permissions`)).length === 0);
});

// 3) 사람별 승인: 센터장은 자기 캠퍼스로, 남에게만
const GRANT = `insert into public.approval_grants (user_id, kind, campus, allow) values`;
await as(U.dir, async () => {
  await q(`${GRANT} ('${U.office2}', 'attendance_close', 'Premium', true)`);
  ok('센터장: 자기 캠퍼스 승인 주기', true);
  await fail('센터장: 다른 캠퍼스 불가', () => q(`${GRANT} ('${U.office2}', 'attendance_close', 'Challenger', true)`), /row-level security/);
  await fail('센터장: 모든 캠퍼스 불가', () => q(`${GRANT} ('${U.office2}', 'nonacademic', '', true)`), /row-level security/);
  await fail('센터장: 역할 주기 권한은 불가', () => q(`${GRANT} ('${U.office2}', 'grant_roles', 'Premium', true)`), /row-level security/);
  await fail('센터장: 자기 자신 불가', () => q(`${GRANT} ('${U.dir}', 'attendance_close', 'Premium', true)`), /row-level security/);
});
await as(U.dirOnly, () => fail('Challenger 센터장: Premium 불가', () => q(`${GRANT} ('${U.office2}', 'nonacademic', 'Premium', true)`), /row-level security/));
await as(U.office, () => fail('오피스: 승인 주기 불가', () => q(`${GRANT} ('${U.office2}', 'nonacademic', 'Premium', true)`), /row-level security/));
await as(U.office2, async () => {
  ok('더하기: 출석 마감 Premium', (await approve('attendance_close', 'premium')) === true);
  ok('더하기: 다른 캠퍼스에는 없음', (await approve('attendance_close', 'challenger')) === false);
  ok('본인 승인 목록 읽기', (await q(`select * from public.approval_grants`)).length === 1);
});
await as(U.admin, async () => {
  await q(`${GRANT} ('${U.office}', 'absence_decide', '', false)`);
  await q(`${GRANT} ('${U.agency}', 'absence_decide', '', true)`);
});
await as(U.office, async () => {
  ok('빼기가 기본값보다 앞섬', (await approve('absence_decide', 'premium')) === false);
  ok('빼지 않은 승인은 그대로', (await approve('penalty_absence', 'premium')) === true);
});
await as(U.agency, async () => ok('직원 아닌 계정은 더하기도 무효', (await approve('absence_decide', 'premium')) === false));
await as(U.dir, async () => {
  ok('센터장: 남이 준 다른 캠퍼스 줄은 못 지움', (await q(`delete from public.approval_grants where user_id = '${U.office}' returning id`)).length === 0);
  ok('센터장: 자기 캠퍼스 줄 회수', (await q(`delete from public.approval_grants where user_id = '${U.office2}' returning id`)).length === 1);
});

// 4) 역할: 센터장은 자기 캠퍼스의 강사 포털 역할만, 남에게만
const ROLE = `insert into public.user_roles (user_id, role, campus) values`;
await as(U.dir, async () => {
  await q(`${ROLE} ('${U.teacher}', 'checker', 'Premium')`);
  ok('센터장: Premium 체커 주기', true);
  await fail('센터장: 오피스 역할은 불가(관리자 판단이 바뀜)', () => q(`${ROLE} ('${U.admin}', 'office', 'Premium')`), /row-level security/);
  await fail('센터장: 센터장 역할 불가', () => q(`${ROLE} ('${U.office2}', 'director', 'Premium')`), /row-level security/);
  await fail('센터장: 다른 캠퍼스 불가', () => q(`${ROLE} ('${U.teacher}', 'checker', 'Challenger')`), /row-level security/);
  await fail('센터장: 자기 자신 불가', () => q(`${ROLE} ('${U.dir}', 'manager', 'Premium')`), /row-level security/);
  ok('센터장: 남의 오피스 역할 회수 불가', (await q(`delete from public.user_roles where user_id = '${U.office2}' and role = 'office' returning user_id`)).length === 0);
  ok('센터장: 자기 오피스 역할 회수 불가', (await q(`delete from public.user_roles where user_id = '${U.dir}' and role = 'office' returning user_id`)).length === 0);
  ok('센터장: 준 체커 회수', (await q(`delete from public.user_roles where user_id = '${U.teacher}' and role = 'checker' returning user_id`)).length === 1);
});
await as(U.office, () => fail('오피스: 역할 주기 불가', () => q(`${ROLE} ('${U.teacher}', 'checker', 'Premium')`), /row-level security/));
await as(U.admin, async () => {
  await q(`${ROLE} ('${U.office2}', 'director', 'Premium')`);
  ok('관리자: 센터장 역할 주기', true);
  await fail('없는 역할은 불가', () => q(`${ROLE} ('${U.office2}', 'boss', 'Premium')`), /check/);
});

// 5) 권한표는 관리자만 고친다
await as(U.office, async () => {
  ok('오피스: 권한표 읽기', (await q(`select * from public.role_permissions where role = 'office'`)).length > 0);
  ok('오피스: 권한표 고치기 0건', (await q(`update public.role_permissions set can_input = true where menu_group = 'accounting' and role = 'office' returning role`)).length === 0);
  await fail('오피스: 승인 기본값 추가 불가', () => q(`insert into public.approval_defaults (kind, role) values ('nonacademic', 'teacher')`), /row-level security/);
});
await as(U.dir, async () => ok('센터장: 권한표 고치기 0건', (await q(`update public.role_permissions set can_view = true where menu_group = 'base_admin' and role = 'director' returning role`)).length === 0));
await as(U.admin, async () => {
  ok('관리자: 권한표 고치기', (await q(`update public.role_permissions set can_input = true where menu_group = 'accounting' and role = 'office' returning role`)).length === 1);
  await fail('입력은 보기가 있어야', () => q(`insert into public.role_permissions (menu_group, role, can_view, can_input) values ('base_admin', 'teacher', false, true)`), /check/);
});
await as(U.office, async () => ok('고친 표가 바로 반영(오피스 회계 입력)', (await input('accounting')) === true));

// 6) 함수 실행 권한
await as(null, () => fail('익명: can_view 불가', () => q(`select public.can_view('dashboard')`), /permission denied/));
await as(U.office, () => fail('my_role_scopes 직접 실행 불가', () => q(`select * from public.my_role_scopes()`), /permission denied/));
await as(null, () => fail('익명: 권한표 읽기 불가', () => q(`select * from public.role_permissions`), /permission denied/));

console.log(`permissions_rls: ${pass} 통과, ${fails.length} 실패`);
if (fails.length) {
  for (const f of fails) console.log('  ✗', f);
  process.exit(1);
}
