// 견적 가격 버전(20261112170000_price_books.sql, T-21, CL-066) 권한·단계 시험. 데이터는 전부 가짜다(첫 버전은 기획 정정본 가격, 개인정보 없음).
// - 첫 버전(기획 정정본)은 승인된 상태로 하나만(2회 실행해도 그대로)
// - 초안 만들기·고치기·승인 요청·되돌리기 = 기초관리 입력 권한(오피스·관리자·센터장), 승인·반려 = '가격 변경 승인'(역할 기본값 없음 → 사람별 승인)
// - 승인된 버전은 바꾸거나 지울 수 없다, 반려는 사유, 승인 요청 중에는 못 고침, 승인할 때 가격을 못 바꿈
// - 에이전시는 지점 대표 아이디만 승인된 버전을 읽는다(직원 아이디·익명은 못 읽음)
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/price_books_rls.mjs
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
const THIS = '20261112170000_price_books.sql';
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql') && x <= THIS).sort()) await db.exec(mig(f));
await db.exec(mig(THIS)); // 두 번째 실행
ok('마이그레이션 2회 실행: 첫 버전 하나', (await q(`select count(*)::int n from public.price_books`))[0].n === 1);
const v1 = (await q(`select * from public.price_books`))[0];
ok('첫 버전: 승인됨·v1·정정본 코스 19·숙소 12·프로모션 14', v1.status === 'approved' && v1.version === 1 && v1.data.courses.length === 19 && v1.data.dorms.length === 12 && v1.data.promotions.length === 14);
ok('승인 종류 가격 변경 승인, 역할 기본값 없음', (await q(`select count(*)::int n from public.approval_kinds where kind = 'price_change'`))[0].n === 1 && (await q(`select count(*)::int n from public.approval_defaults where kind = 'price_change'`))[0].n === 0);

const U = {
  admin: '00000000-0000-0000-0000-0000000000e1', // 역할 없는 직원 = 관리자
  office: '00000000-0000-0000-0000-0000000000e2',
  ceo: '00000000-0000-0000-0000-0000000000e3', // 오피스 + 사람별 승인 price_change
  teacher: '00000000-0000-0000-0000-0000000000e4',
  owner: '00000000-0000-0000-0000-0000000000a1',
  staffAg: '00000000-0000-0000-0000-0000000000a2',
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@example.com', now())`).join(', ')};
  insert into public.staff_users (user_id, name) values ('${U.admin}', '관리자'), ('${U.office}', '오피스'), ('${U.ceo}', '대표');
  insert into public.user_roles (user_id, role, campus) values ('${U.office}', 'office', ''), ('${U.ceo}', 'office', ''), ('${U.teacher}', 'teacher', '');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values ('${U.owner}', 'owner@example.com', '샘플유학', '서울', '한국', 'active');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status, role, owner_id) values ('${U.staffAg}', 'staffag@example.com', '샘플유학', '서울', '한국', 'active', 'staff', '${U.owner}');
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
const upd = (id, set) => q(`update public.price_books set ${set} where id = $1 returning status, version`, [id]);

// 1) 오피스: 새 버전 초안(v1을 복사), 고치기, 승인 요청
const draft = await as(U.office, async () => {
  const r = (await q(`insert into public.price_books (label, effective_from, data, based_on) select '2027 인상안', date '2027-01-03', data, id from public.price_books where version = 1 returning *`))[0];
  ok('오피스: 초안 만들기(버전 자동 2, 만든 사람 = 나)', r.version === 2 && r.status === 'draft' && r.created_by === U.office, JSON.stringify(r));
  await upd(r.id, `data = jsonb_set(data, '{registration,KRW}', '120000'), note = '등록금 인상'`);
  ok('오피스: 초안 고치기', (await q(`select data->'registration'->>'KRW' v from public.price_books where id = $1`, [r.id]))[0].v === '120000');
  await fail('오피스: 승인된 버전으로 바로 만들기 불가', () => q(`insert into public.price_books (label, effective_from, status, data) values ('x', '2027-01-03', 'approved', '{}')`), /row-level security|초안으로/);
  ok('오피스: 승인 요청', (await upd(r.id, `status = 'submitted'`))[0]?.status === 'submitted');
  await fail('승인 요청 중에는 고치기 불가', () => upd(r.id, `label = '바꿈'`), /초안일 때만/);
  await fail('오피스: 승인 불가(가격 변경 승인 없음)', () => upd(r.id, `status = 'approved'`), /가격 변경 승인 권한/);
  ok('오피스: 되돌리기 → 초안', (await upd(r.id, `status = 'draft'`))[0]?.status === 'draft');
  await upd(r.id, `status = 'submitted'`);
  return r;
});
await as(U.admin, () => fail('관리자도 기본값으로는 승인 불가(CL-066)', () => upd(draft.id, `status = 'approved'`), /가격 변경 승인 권한/));
await as(U.teacher, () => fail('강사: 초안 만들기 불가', () => q(`insert into public.price_books (label, effective_from, data) values ('x', '2027-01-03', '{}')`), /row-level security/));

// 2) 관리자가 대표에게 '가격 변경 승인'(사람별 승인) → 대표가 반려·승인
await as(U.admin, () => q(`insert into public.approval_grants (user_id, kind, campus, allow) values ('${U.ceo}', 'price_change', '', true)`));
await as(U.ceo, async () => {
  await fail('반려는 사유가 있어야', () => upd(draft.id, `status = 'rejected'`), /사유/);
  await fail('승인하면서 가격 바꾸기 불가', () => upd(draft.id, `status = 'approved', effective_from = '2027-02-07'`), /바꿀 수 없습니다/);
  ok('대표: 반려(사유)', (await upd(draft.id, `status = 'rejected', decision_note = '적용일 다시'`))[0]?.status === 'rejected');
});
await as(U.office, async () => {
  ok('오피스: 반려된 버전을 초안으로', (await upd(draft.id, `status = 'draft'`))[0]?.status === 'draft');
  await upd(draft.id, `effective_from = '2027-02-07'`);
  await upd(draft.id, `status = 'submitted'`);
});
await as(U.ceo, async () => {
  ok('대표: 승인', (await upd(draft.id, `status = 'approved'`))[0]?.status === 'approved');
  const r = (await q(`select decided_by, submitted_by from public.price_books where id = $1`, [draft.id]))[0];
  ok('승인한 사람·올린 사람 기록', r.decided_by === U.ceo && r.submitted_by === U.office, JSON.stringify(r));
});
await as(U.office, async () => {
  await fail('승인된 버전은 고치기 불가', () => upd(draft.id, `label = '바꿈'`), /승인된 가격 버전은 바꿀 수 없습니다/);
  ok('승인된 버전은 지우기 0건', (await q(`delete from public.price_books where id = $1 returning id`, [draft.id])).length === 0);
  const tmp = (await q(`insert into public.price_books (label, effective_from, data) values ('임시', '2027-03-07', '{}') returning id`))[0];
  ok('초안은 지우기', (await q(`delete from public.price_books where id = $1 returning id`, [tmp.id])).length === 1);
  await fail('버전 번호는 바꿀 수 없음', async () => {
    const t2 = (await q(`insert into public.price_books (label, effective_from, data) values ('임시2', '2027-03-07', '{}') returning id`))[0];
    await upd(t2.id, `version = 99`);
  }, /버전 번호/);
});

// 3) 읽기: 직원 모두, 에이전시는 대표만 승인된 것
await as(U.teacher, async () => ok('강사: 0건', (await q(`select * from public.price_books`)).length === 0));
await as(U.owner, async () => {
  const rows = await q(`select status from public.price_books`);
  ok('지점 대표: 승인된 버전만(2개)', rows.length === 2 && rows.every((r) => r.status === 'approved'), JSON.stringify(rows));
  await fail('지점 대표: 넣기 불가', () => q(`insert into public.price_books (label, effective_from, data) values ('x', '2027-01-03', '{}')`), /row-level security/);
  ok('지점 대표: 고치기 0건', (await q(`update public.price_books set label = 'x' returning id`)).length === 0);
});
await as(U.staffAg, async () => ok('지점 직원 아이디: 0건(견적은 대표만)', (await q(`select * from public.price_books`)).length === 0));
await as(null, () => fail('익명: 못 읽음', () => q(`select * from public.price_books`), /permission denied/));
await as(U.office, async () => ok('오피스: 모두 읽음(초안 포함)', (await q(`select * from public.price_books`)).length >= 3));

console.log(`견적 가격 버전 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
