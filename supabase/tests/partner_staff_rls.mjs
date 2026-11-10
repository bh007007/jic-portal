// 에이전시 대표·직원 아이디(CL-032, 20261110193000_agency_staff.sql) 권한 시험. 데이터는 전부 가짜다.
// - 대표가 직원 이메일을 등록 → 그 이메일로 가입·인증한 사람이 로그인하면 직원 아이디(claim_agency_staff_invite)
// - 직원은 상담·자료·공지 내용은 보고, 학비표·방문 신청·직원 관리는 못 한다. 대표가 정지·해제, 대표가 정지되면 직원도 막힘
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/partner_staff_rls.mjs
import { readFileSync } from 'node:fs';
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
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
const files = [
  '20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261109130000_legacy_prices.sql',
  '20261110131500_trigger_fn_privileges.sql', '20261110143500_perf_policies_indexes.sql', '20261110163500_partner_country_targeting.sql',
  '20261110173500_partner_tuition.sql',
];
for (const f of files) await db.exec(mig(f));
await db.exec(mig('20261110193000_agency_staff.sql'));
await db.exec(mig('20261110193000_agency_staff.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  owner: '00000000-0000-0000-0000-0000000000a1', // 샘플유학 서울(한국)
  owner2: '00000000-0000-0000-0000-0000000000a2', // 다른 지점(일본)
  staffA: '00000000-0000-0000-0000-0000000000b1', // 대표가 등록한 이메일, 인증함
  unconfirmed: '00000000-0000-0000-0000-0000000000b2', // 등록된 이메일이지만 인증 전
  stranger: '00000000-0000-0000-0000-0000000000b3', // 등록 안 된 이메일
  jic: '00000000-0000-0000-0000-0000000000c1', // JIC 관리자
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${U.owner}', 'owner@example.com', now()), ('${U.owner2}', 'owner2@example.com', now()),
    ('${U.staffA}', 'Staff.A@Example.com', now()), ('${U.unconfirmed}', 'wait@example.com', null),
    ('${U.stranger}', 'nobody@example.com', now()), ('${U.jic}', 'jic@example.com', now());
  insert into public.staff_users (user_id, name) values ('${U.jic}', 'JIC 직원');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values
    ('${U.owner}', 'owner@example.com', '샘플유학', '서울', '한국', 'active'),
    ('${U.owner2}', 'owner2@example.com', '테스트留学', '도쿄', '일본', 'active');
  insert into public.legacy_meta (id, data) values ('current', '{"source":"extract"}');
  insert into public.legacy_prices (id, data) values ('price_etc:0', '{"_table":"price_etc","ec_type":"SSP","ec_name":"SSP","ec_peso":"6800"}');
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
const one = async (sql) => (await q(sql))[0];

// 1) 대표가 직원 이메일을 등록한다
await as(U.owner, async () => {
  await q(`insert into public.agency_staff_invites (email, name) values ('staff.a@example.com', '김직원'), ('wait@example.com', '대기')`);
  ok('대표: 직원 등록 2건', (await q(`select * from public.agency_staff_invites`)).length === 2);
  await fail('대표: 다른 지점 이름으로 등록 불가', () => q(`insert into public.agency_staff_invites (owner_id, email) values ('${U.owner2}', 'x@example.com')`), /row-level security/);
  await fail('대표: 대문자 이메일은 거절(화면에서 소문자로 바꿔 보냄)', () => q(`insert into public.agency_staff_invites (email) values ('Upper@Example.com')`), /check/);
  await fail('대표: 이메일 형식 확인', () => q(`insert into public.agency_staff_invites (email) values ('not-an-email')`), /check/);
});
await as(U.owner2, async () => {
  ok('다른 지점 대표: 남의 등록 안 보임', (await q(`select * from public.agency_staff_invites`)).length === 0);
  await fail('다른 지점 대표: 이미 등록된 이메일은 중복 불가', () => q(`insert into public.agency_staff_invites (email) values ('staff.a@example.com')`), /duplicate|unique/);
});
await as(U.stranger, async () => {
  await fail('지점 아이디 없는 사람: 등록 불가', () => q(`insert into public.agency_staff_invites (email) values ('y@example.com')`), /row-level security/);
});
await as(null, async () => {
  await fail('익명: 등록 표 못 읽음', () => q(`select * from public.agency_staff_invites`), /permission denied/);
  await fail('익명: 직원 연결 함수 실행 불가', () => q(`select public.claim_agency_staff_invite()`), /permission denied/);
});

// 2) 로그인하면 직원 아이디가 생긴다
await as(U.unconfirmed, async () => ok('인증 전 이메일: 연결 안 됨', (await one(`select public.claim_agency_staff_invite() as c`)).c === false));
await as(U.stranger, async () => ok('등록 안 된 이메일: 연결 안 됨', (await one(`select public.claim_agency_staff_invite() as c`)).c === false));
await as(U.owner, async () => ok('대표 자신: 연결 안 됨', (await one(`select public.claim_agency_staff_invite() as c`)).c === false));
await as(U.staffA, async () => {
  ok('직원: 등록된 이메일(대소문자 무시)로 연결', (await one(`select public.claim_agency_staff_invite() as c`)).c === true);
  ok('직원: 두 번째는 연결 안 됨', (await one(`select public.claim_agency_staff_invite() as c`)).c === false);
  const me = await one(`select * from public.agency_members where user_id = '${U.staffA}'`);
  ok('직원 행: 역할·대표·지점·국가', me && me.role === 'staff' && me.owner_id === U.owner && me.agency_name === '샘플유학' && me.country === '한국' && me.contact_name === '김직원' && me.email === 'staff.a@example.com', JSON.stringify(me));
  ok('직원: is_partner 참, is_partner_owner 거짓', (await one(`select public.is_partner() as p, public.is_partner_owner() as o`)).p === true && (await one(`select public.is_partner_owner() as o`)).o === false);
});
const inv = await one(`select * from public.agency_staff_invites where email = 'staff.a@example.com'`);
ok('등록 표: 연결 기록', inv.claimed_by === U.staffA && inv.claimed_at !== null);

// 3) 직원이 할 수 있는 것·없는 것
await db.exec(`
  insert into public.partner_notices (kind, title, body, published, countries) values
    ('notice', '모두에게', '', true, '{}'), ('notice', '일본 전용', '', true, '{일본}'), ('notice', '한국 전용', '', true, '{한국}');
`);
await as(U.staffA, async () => {
  const titles = (await q(`select title from public.partner_notices order by title`)).map((r) => r.title);
  ok('직원: 공지(지점 국가 기준)', titles.join(',') === '모두에게,한국 전용', titles.join(','));
  ok('직원: 학비표 0행(대표만)', (await q(`select * from public.partner_tuition()`)).length === 0);
  await fail('직원: 방문 신청 불가(대표만)', () => q(`insert into public.visit_requests (visit_date, people, purpose) values ('2026-12-01', 2, '견학')`), /row-level security/);
  ok('직원: 등록 표 못 봄', (await q(`select * from public.agency_staff_invites`)).length === 0);
  await fail('직원: 직원 등록 불가', () => q(`insert into public.agency_staff_invites (email) values ('z@example.com')`), /row-level security/);
  ok('직원: 대표 행 못 봄', (await q(`select * from public.agency_members where user_id = '${U.owner}'`)).length === 0);
  await q(`update public.agency_members set contact_name = '김직원2' where user_id = '${U.staffA}'`);
  ok('직원: 내 연락처는 고침', (await one(`select contact_name from public.agency_members where user_id = '${U.staffA}'`)).contact_name === '김직원2');
  await fail('직원: 내 상태는 못 바꿈', () => q(`update public.agency_members set status = 'suspended' where user_id = '${U.staffA}'`), /연락처와 화면 설정만/);
  await fail('직원: 직원 정지 함수 불가', () => q(`select public.set_agency_staff_status('${U.staffA}', false)`), /지점 대표만/);
});
await as(U.owner, async () => {
  ok('대표: 학비표 봄', (await q(`select * from public.partner_tuition()`)).length > 0);
  await q(`insert into public.visit_requests (visit_date, people, purpose) values ('2026-12-01', 2, '견학')`);
  ok('대표: 방문 신청', (await q(`select * from public.visit_requests`)).length === 1);
  const staff = await q(`select user_id, email, status from public.agency_members where owner_id = '${U.owner}'`);
  ok('대표: 내 지점 직원 봄', staff.length === 1 && staff[0].user_id === U.staffA, JSON.stringify(staff));
  const n = await q(`update public.agency_members set contact_name = '바꿈' where user_id = '${U.staffA}' returning user_id`);
  ok('대표: 직원 행을 직접 고치지는 못함', n.length === 0);
});
await as(U.owner2, async () => {
  ok('다른 지점 대표: 남의 직원 안 보임', (await q(`select * from public.agency_members where user_id = '${U.staffA}'`)).length === 0);
  await fail('다른 지점 대표: 남의 직원 정지 불가', () => q(`select public.set_agency_staff_status('${U.staffA}', false)`), /이 지점의 직원 아이디가 아닙니다/);
});

// 4) 대표가 정지·해제, 대표가 정지되면 직원도 막힘
await as(U.owner, () => q(`select public.set_agency_staff_status('${U.staffA}', false)`));
await as(U.staffA, async () => ok('대표가 정지: 직원 막힘', (await one(`select public.is_partner() as p`)).p === false && (await q(`select * from public.partner_notices`)).length === 0));
await as(U.owner, () => q(`select public.set_agency_staff_status('${U.staffA}', true)`));
await as(U.staffA, async () => ok('대표가 해제: 직원 다시 사용', (await one(`select public.is_partner() as p`)).p === true));
await as(U.jic, () => q(`update public.agency_members set status = 'suspended' where user_id = '${U.owner}'`));
await as(U.staffA, async () => ok('JIC가 대표 정지: 직원도 막힘', (await one(`select public.is_partner() as p`)).p === false));
await as(U.jic, () => q(`update public.agency_members set status = 'active' where user_id = '${U.owner}'`));

// 5) 대표 행의 지점 정보가 바뀌면 직원 행도 같이
await as(U.jic, () => q(`update public.agency_members set agency_name = '샘플유학원', country = '일본' where user_id = '${U.owner}'`));
const synced = await one(`select agency_name, country from public.agency_members where user_id = '${U.staffA}'`);
ok('대표 정보 변경 → 직원 행 같이', synced.agency_name === '샘플유학원' && synced.country === '일본', JSON.stringify(synced));
await as(U.staffA, async () => {
  const titles = (await q(`select title from public.partner_notices order by title`)).map((r) => r.title);
  ok('직원: 바뀐 국가의 공지', titles.join(',') === '모두에게,일본 전용', titles.join(','));
});

// 6) 등록 취소: 연결 전만
await as(U.owner, async () => {
  const del = await q(`delete from public.agency_staff_invites returning email`);
  ok('대표: 연결 전 등록만 지움', del.length === 1 && del[0].email === 'wait@example.com', JSON.stringify(del));
});

// 7) JIC 관리자: 직원 아이디를 대표 아이디로 승인할 수 없다
await db.exec(`insert into public.agency_requests (user_id, email, agency_name) values ('${U.staffA}', 'staff.a@example.com', '새 지점')`);
const reqId = (await one(`select id from public.agency_requests where user_id = '${U.staffA}'`)).id;
await as(U.jic, async () => {
  await fail('JIC: 직원 아이디를 대표로 승인 불가', () => q(`select public.approve_agency_request(${reqId}, true)`), /이미 다른 지점의 직원/);
  ok('JIC: 직원 행·등록 표 모두 봄', (await q(`select * from public.agency_members where role = 'staff'`)).length === 1 && (await q(`select * from public.agency_staff_invites`)).length === 1);
});

console.log(`대표·직원 아이디 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
