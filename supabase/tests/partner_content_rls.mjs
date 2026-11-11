// 파트너 포털 화면 콘텐츠(20261111140000_partner_content_items.sql, CL-045·054) 권한 시험. 데이터는 전부 가짜다.
// - 직원은 모두 읽고 쓴다. 에이전시는 게시된 것만, 자기 지점 국가에 맞는 것만 읽고 쓰지 못한다. 익명은 못 읽는다.
// - 고치면 수정한 사람·시각이 자동으로 바뀐다. 종류·다음 업데이트 예정 형식은 DB가 막는다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/partner_content_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261110163500_partner_country_targeting.sql', '20261110193000_agency_staff.sql']) {
  // agency_staff 는 legacy_prices·partner_tuition 을 고치므로 앞의 두 파일이 필요하다
  if (f === '20261110193000_agency_staff.sql') for (const g of ['20261109130000_legacy_prices.sql', '20261110173500_partner_tuition.sql']) await db.exec(mig(g));
  await db.exec(mig(f));
}
await db.exec(mig('20261111140000_partner_content_items.sql'));
await db.exec(mig('20261111140000_partner_content_items.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  jic: '00000000-0000-0000-0000-0000000000c1',
  kr: '00000000-0000-0000-0000-0000000000a1', // 한국 지점 대표
  jp: '00000000-0000-0000-0000-0000000000a2', // 일본 지점 대표
  krStaff: '00000000-0000-0000-0000-0000000000b1', // 한국 지점 직원 아이디
  none: '00000000-0000-0000-0000-0000000000d1', // 역할 없음
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${U.jic}', 'jic@example.com', now()), ('${U.kr}', 'kr@example.com', now()), ('${U.jp}', 'jp@example.com', now()),
    ('${U.krStaff}', 'krstaff@example.com', now()), ('${U.none}', 'none@example.com', now());
  insert into public.staff_users (user_id, name) values ('${U.jic}', 'JIC 직원');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values
    ('${U.kr}', 'kr@example.com', '샘플유학', '서울', '한국', 'active'), ('${U.jp}', 'jp@example.com', '테스트', '도쿄', '일본', 'active');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status, role, owner_id) values
    ('${U.krStaff}', 'krstaff@example.com', '샘플유학', '서울', '한국', 'active', 'staff', '${U.kr}');
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

// 1) 직원이 쓴다
await as(U.jic, async () => {
  await q(`insert into public.partner_content_items (kind, campus, title, body, status, countries, updated_on, next_update) values
    ('teacher', 'premium', 'Teacher A', '스피킹', 'published', '{}', '2026-10-23', '2026-12'),
    ('event', 'challenger', '11월 입학', '', 'published', '{한국}', null, null),
    ('event', 'premium', '일본 설명회', '', 'published', '{일본}', null, null),
    ('playbook', '', '어려운 질문', '답변 요점', 'draft', '{}', null, null),
    ('camp', 'mco', '한국 주니어캠프', '', 'hidden', '{한국}', null, null)`);
  ok('직원: 5건 넣고 모두 봄', (await q(`select * from public.partner_content_items`)).length === 5);
  const before = (await q(`select updated_by from public.partner_content_items where title = 'Teacher A'`))[0];
  ok('직원: 넣을 때 수정한 사람 = 나', before.updated_by === U.jic);
  await fail('잘못된 종류는 거절', () => q(`insert into public.partner_content_items (kind) values ('price')`), /check/);
  await fail('다음 업데이트 예정 형식(YYYY-MM 또는 날짜)', () => q(`insert into public.partner_content_items (kind, next_update) values ('event', '12월')`), /check/);
  await fail('data 는 객체만', () => q(`insert into public.partner_content_items (kind, data) values ('event', '[1]')`), /check/);
});
// 다른 직원이 고치면 수정한 사람이 바뀐다
await db.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'jic2@example.com'); insert into public.staff_users (user_id, name) values ('00000000-0000-0000-0000-0000000000c2', '직원2');`);
await as('00000000-0000-0000-0000-0000000000c2', async () => {
  await q(`update public.partner_content_items set body = '스피킹 전문' where title = 'Teacher A'`);
  const r = (await q(`select updated_by, updated_at > created_at as moved from public.partner_content_items where title = 'Teacher A'`))[0];
  ok('고치면 수정한 사람·시각 자동', r.updated_by === '00000000-0000-0000-0000-0000000000c2' && r.moved === true, JSON.stringify(r));
});

// 2) 에이전시: 게시된 것만, 자기 나라 것만
const titles = async () => (await q(`select title from public.partner_content_items order by title`)).map((r) => r.title).join(',');
await as(U.kr, async () => {
  ok('한국 대표: 게시 + 모든 나라 + 한국', (await titles()) === '11월 입학,Teacher A', await titles());
  await fail('한국 대표: 넣기 불가', () => q(`insert into public.partner_content_items (kind, title) values ('event', 'x')`), /row-level security/);
  const n = await q(`update public.partner_content_items set title = 'x' returning id`);
  ok('한국 대표: 고치기 0건', n.length === 0);
  const d = await q(`delete from public.partner_content_items returning id`);
  ok('한국 대표: 지우기 0건', d.length === 0);
});
await as(U.jp, async () => ok('일본 대표: 게시 + 모든 나라 + 일본', (await titles()) === 'Teacher A,일본 설명회', await titles()));
await as(U.krStaff, async () => ok('한국 지점 직원 아이디: 지점 국가 기준', (await titles()) === '11월 입학,Teacher A', await titles()));
await as(U.none, async () => ok('역할 없는 사용자: 0건', (await q(`select * from public.partner_content_items`)).length === 0));
await as(null, async () => fail('익명: 못 읽음', () => q(`select * from public.partner_content_items`), /permission denied/));

// 3) 정지된 지점은 못 본다
await as(U.jic, () => q(`update public.agency_members set status = 'suspended' where user_id = '${U.kr}'`));
await as(U.kr, async () => ok('정지된 대표: 0건', (await q(`select * from public.partner_content_items`)).length === 0));
await as(U.krStaff, async () => ok('대표가 정지된 직원 아이디: 0건', (await q(`select * from public.partner_content_items`)).length === 0));

console.log(`화면 콘텐츠 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
