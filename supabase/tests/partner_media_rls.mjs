// 파트너 포털 사진 보관함·캠프 브로슈어(20261111180000_partner_media.sql, CL-047·053) 권한 시험. 데이터는 전부 가짜다.
// - 직원은 저장소 partner-media 에 올리고 지운다. 에이전시는 못 올린다.
// - 에이전시는 '게시된 사진·캠프가 가리키는 파일'만, 자기 지점 국가 것만 읽는다(초안·숨김·다른 나라·아무도 안 가리키는 파일은 못 읽음).
// - 종류 'photo' 가 들어가고, 다른 저장소(partner-resources) 규칙은 그대로다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/partner_media_rls.mjs
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
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
`);
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261110163500_partner_country_targeting.sql', '20261109130000_legacy_prices.sql', '20261110173500_partner_tuition.sql', '20261110193000_agency_staff.sql', '20261111140000_partner_content_items.sql'])
  await db.exec(mig(f));
await db.exec(mig('20261111180000_partner_media.sql'));
await db.exec(mig('20261111180000_partner_media.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);
const b = (await q(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'partner-media'`))[0];
ok('저장소는 비공개·10MB·사진과 PDF만', b && b.public === false && Number(b.file_size_limit) === 10485760 && b.allowed_mime_types.join() === 'image/jpeg,image/png,image/webp,application/pdf', JSON.stringify(b));

const U = {
  jic: '00000000-0000-0000-0000-0000000000c1',
  kr: '00000000-0000-0000-0000-0000000000a1',
  jp: '00000000-0000-0000-0000-0000000000a2',
  krStaff: '00000000-0000-0000-0000-0000000000b1',
  none: '00000000-0000-0000-0000-0000000000d1',
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

// 1) 직원: 파일 올리기 + 사진·캠프 항목
await as(U.jic, async () => {
  await q(`insert into storage.objects (bucket_id, name) values
    ('partner-media', 'photos/all.jpg'), ('partner-media', 'photos/kr.jpg'), ('partner-media', 'photos/jp.jpg'),
    ('partner-media', 'photos/draft.jpg'), ('partner-media', 'photos/hidden.jpg'), ('partner-media', 'photos/orphan.jpg'),
    ('partner-media', 'camps/kr.pdf'), ('partner-media', 'camps/draft.pdf'), ('partner-resources', 'price.pdf')`);
  await q(`insert into public.partner_content_items (kind, campus, title, status, countries, data) values
    ('photo', 'premium', '전 국가', 'published', '{}', '{"path":"photos/all.jpg","placement":"dorm","focus":[0.5,0.3]}'),
    ('photo', 'premium', '한국만', 'published', '{한국}', '{"path":"photos/kr.jpg","placement":"campus_hero"}'),
    ('photo', 'premium', '일본만', 'published', '{일본}', '{"path":"photos/jp.jpg","placement":"campus_hero"}'),
    ('photo', '', '초안', 'draft', '{}', '{"path":"photos/draft.jpg","placement":"baguio"}'),
    ('photo', '', '숨김', 'hidden', '{}', '{"path":"photos/hidden.jpg","placement":"baguio"}'),
    ('camp', 'mco', '한국 주니어캠프', 'published', '{한국}', '{"brochure_path":"camps/kr.pdf","state":"모집 중"}'),
    ('camp', 'premium', '초안 캠프', 'draft', '{}', '{"brochure_path":"camps/draft.pdf"}'),
    ('event', '', '사진 경로를 흉내 낸 행사', 'published', '{}', '{"path":"photos/orphan.jpg"}')`);
  ok('직원: partner-media 파일 8개 모두 봄', (await q(`select name from storage.objects where bucket_id = 'partner-media'`)).length === 8);
  await q(`delete from storage.objects where name = 'photos/hidden.jpg'`);
  ok('직원: 지우기', (await q(`select 1 from storage.objects where name = 'photos/hidden.jpg'`)).length === 0);
  await q(`insert into storage.objects (bucket_id, name) values ('partner-media', 'photos/hidden.jpg')`);
  await fail('잘못된 종류는 거절', () => q(`insert into public.partner_content_items (kind) values ('picture')`), /check/);
});

// 2) 에이전시: 게시된 항목이 가리키는 파일만, 자기 나라 것만
const names = async () => (await q(`select name from storage.objects where bucket_id = 'partner-media' order by name`)).map((r) => r.name).join(',');
await as(U.kr, async () => {
  ok('한국 대표: 게시 + 모든 나라 + 한국 (초안·숨김·일본·안 가리킴 제외)', (await names()) === 'camps/kr.pdf,photos/all.jpg,photos/kr.jpg', await names());
  ok('한국 대표: 자료실 저장소 규칙은 그대로', (await q(`select name from storage.objects where bucket_id = 'partner-resources'`)).length === 1);
  await fail('한국 대표: 올리기 불가', () => q(`insert into storage.objects (bucket_id, name) values ('partner-media', 'photos/x.jpg')`), /row-level security/);
  const d = await q(`delete from storage.objects where bucket_id = 'partner-media' returning name`);
  ok('한국 대표: 지우기 0건', d.length === 0);
  const u = await q(`update storage.objects set name = 'photos/y.jpg' where bucket_id = 'partner-media' returning name`);
  ok('한국 대표: 고치기 0건', u.length === 0);
});
await as(U.jp, async () => ok('일본 대표: 게시 + 모든 나라 + 일본', (await names()) === 'photos/all.jpg,photos/jp.jpg', await names()));
await as(U.krStaff, async () => ok('한국 지점 직원 아이디: 지점 국가 기준', (await names()) === 'camps/kr.pdf,photos/all.jpg,photos/kr.jpg', await names()));
await as(U.none, async () => ok('역할 없는 사용자: 0건', (await names()) === ''));
await as(null, async () => ok('익명: 0건', (await q(`select name from storage.objects where bucket_id = 'partner-media'`)).length === 0));

// 3) 사진을 숨기면 바로 못 읽는다
await as(U.jic, () => q(`update public.partner_content_items set status = 'hidden' where title = '한국만'`));
await as(U.kr, async () => ok('숨긴 사진은 못 읽음', (await names()) === 'camps/kr.pdf,photos/all.jpg', await names()));
// 4) 정지된 지점
await as(U.jic, () => q(`update public.agency_members set status = 'suspended' where user_id = '${U.kr}'`));
await as(U.kr, async () => ok('정지된 대표: 0건', (await names()) === ''));

console.log(`사진 보관함 저장소 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
