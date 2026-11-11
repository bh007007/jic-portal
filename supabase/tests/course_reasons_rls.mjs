// 추천 이유 3칸(20261112010000_course_reasons.sql, CL-050) 권한 시험. 데이터는 전부 가짜다.
// - 직원은 쓰고 모두 본다. 에이전시(대표·지점 직원 아이디)는 게시된 것만 읽고 쓰지 못한다. 익명·역할 없는 사용자는 못 읽는다.
// - 코스 × 칸 × 답은 하나만, 이유 3은 기본(답 '')만, 증거는 3개까지, 제목 필수, 설명 300자까지. 고치면 수정한 사람·시각이 바뀐다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/course_reasons_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261110163500_partner_country_targeting.sql', '20261109130000_legacy_prices.sql', '20261110173500_partner_tuition.sql', '20261110193000_agency_staff.sql', '20261111140000_partner_content_items.sql'])
  await db.exec(mig(f));
await db.exec(mig('20261112010000_course_reasons.sql'));
await db.exec(mig('20261112010000_course_reasons.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  jic: '00000000-0000-0000-0000-0000000000c1',
  jic2: '00000000-0000-0000-0000-0000000000c2',
  kr: '00000000-0000-0000-0000-0000000000a1',
  krStaff: '00000000-0000-0000-0000-0000000000b1',
  none: '00000000-0000-0000-0000-0000000000d1',
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${U.jic}', 'jic@example.com', now()), ('${U.jic2}', 'jic2@example.com', now()), ('${U.kr}', 'kr@example.com', now()),
    ('${U.krStaff}', 'krstaff@example.com', now()), ('${U.none}', 'none@example.com', now());
  insert into public.staff_users (user_id, name) values ('${U.jic}', 'JIC 직원'), ('${U.jic2}', '직원2');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values ('${U.kr}', 'kr@example.com', '샘플유학', '서울', '한국', 'active');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status, role, owner_id) values
    ('${U.krStaff}', 'krstaff@example.com', '샘플유학', '서울', '한국', 'active', 'staff', '${U.kr}');
  insert into public.campuses (id, name, sort) values ('premium', 'Premium', 1) on conflict do nothing;
  insert into public.courses (id, campus_id, name, sort) values ('p-tep', 'premium', 'TEP', 1), ('p-esl', 'premium', 'ESL', 2) on conflict do nothing;
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
const EV = ['00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004'];

// 1) 직원 쓰기와 제약
await as(U.jic, async () => {
  await q(`insert into public.course_reasons (course_id, slot, answer, title, body, evidence, status) values
    ('p-tep', 1, '', '관심 주제로 배우는 영어', '기본 이유 1', '{${EV[0]}}', 'published'),
    ('p-tep', 1, 'tep', '테마 수업이 목적에 맞음', 'Q1 = TEP', '{${EV[0]},${EV[1]}}', 'published'),
    ('p-tep', 2, '', '말하기 시간이 많음', '기본 이유 2', '{}', 'published'),
    ('p-tep', 3, '', '매주 리포트로 성장 확인', '공통', '{${EV[2]}}', 'published'),
    ('p-tep', 2, 'study', '자습 관리', '초안', '{}', 'draft')`);
  ok('직원: 5건 넣고 모두 봄', (await q(`select id from public.course_reasons`)).length === 5);
  ok('직원: 넣을 때 수정한 사람 = 나', (await q(`select updated_by from public.course_reasons where answer = 'tep'`))[0].updated_by === U.jic);
  await fail('같은 코스·칸·답 두 번 불가', () => q(`insert into public.course_reasons (course_id, slot, answer, title) values ('p-tep', 1, 'tep', '중복')`), /unique|duplicate/);
  await fail('이유 3은 기본만', () => q(`insert into public.course_reasons (course_id, slot, answer, title) values ('p-tep', 3, 'tep', 'x')`), /slot3|check/);
  await fail('칸은 1~3', () => q(`insert into public.course_reasons (course_id, slot, title) values ('p-tep', 4, 'x')`), /check/);
  await fail('제목 필수', () => q(`insert into public.course_reasons (course_id, slot, answer, title) values ('p-esl', 1, '', '  ')`), /check/);
  await fail('증거 4개 불가', () => q(`insert into public.course_reasons (course_id, slot, answer, title, evidence) values ('p-esl', 1, '', 'x', '{${EV.join(',')}}')`), /check/);
  await fail('설명 300자 넘게 불가', () => q(`insert into public.course_reasons (course_id, slot, answer, title, body) values ('p-esl', 1, '', 'x', repeat('가', 301))`), /check/);
  await fail('없는 코스 불가', () => q(`insert into public.course_reasons (course_id, slot, title) values ('nope', 1, 'x')`), /foreign key/);
});
await as(U.jic2, async () => {
  await q(`update public.course_reasons set body = '고친 설명' where answer = 'tep'`);
  const r = (await q(`select updated_by, updated_at > created_at as moved from public.course_reasons where answer = 'tep'`))[0];
  ok('고치면 수정한 사람·시각 자동', r.updated_by === U.jic2 && r.moved === true, JSON.stringify(r));
});

// 2) 에이전시: 게시된 것만 읽기
const titles = async () => (await q(`select slot, answer from public.course_reasons order by slot, answer`)).map((r) => `${r.slot}${r.answer || '-'}`).join(',');
await as(U.kr, async () => {
  ok('대표: 게시된 4건', (await titles()) === '1-,1tep,2-,3-', await titles());
  await fail('대표: 넣기 불가', () => q(`insert into public.course_reasons (course_id, slot, title) values ('p-esl', 1, 'x')`), /row-level security/);
  ok('대표: 고치기 0건', (await q(`update public.course_reasons set title = 'x' returning id`)).length === 0);
  ok('대표: 지우기 0건', (await q(`delete from public.course_reasons returning id`)).length === 0);
});
await as(U.krStaff, async () => ok('지점 직원 아이디: 게시된 4건(상담에 씀)', (await titles()) === '1-,1tep,2-,3-', await titles()));
await as(U.none, async () => ok('역할 없는 사용자: 0건', (await titles()) === ''));
await as(null, async () => fail('익명: 못 읽음', () => q(`select * from public.course_reasons`), /permission denied/));
await as(U.jic, () => q(`update public.agency_members set status = 'suspended' where user_id = '${U.kr}'`));
await as(U.kr, async () => ok('정지된 대표: 0건', (await titles()) === ''));
// 코스를 지우면 이유도 지워진다
await as(U.jic, async () => {
  await q(`delete from public.courses where id = 'p-tep'`);
  ok('코스 지우면 이유도 지움', (await q(`select id from public.course_reasons`)).length === 0);
});

console.log(`추천 이유 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
