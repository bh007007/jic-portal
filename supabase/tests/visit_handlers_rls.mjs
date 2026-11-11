// 방문 신청 단계별 처리자(20261112090000_visit_handlers.sql, CL-046, 11/12 결정) 권한 시험. 데이터는 전부 가짜다.
// - 처리자 지정은 관리자만(오피스는 못 함), 직원은 지정 목록을 읽는다.
// - 지정이 없으면 직원 모두 처리. 지정되면: 일정 조율·승인 요청 = 그 나라 마케터, 확정·반려·다시 조율 = 그 캠퍼스 센터장, 직원 취소 = 둘 중 누구나.
// - 관리자라도 지정된 센터장이 있는 캠퍼스는 확정하지 못한다(승인 권한은 따로, CL-025). 방문 일정·안내도 같은 사람만. 에이전시 취소는 그대로.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/visit_handlers_rls.mjs
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
const THIS = '20261112090000_visit_handlers.sql';
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql') && x <= THIS).sort()) await db.exec(mig(f));
await db.exec(mig(THIS));
await db.exec(mig('20261112090000_visit_handlers.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  admin: '00000000-0000-0000-0000-0000000000c1', // 역할 없는 직원 = 관리자
  krMkt: '00000000-0000-0000-0000-0000000000c2', // 오피스, 한국 마케터로 지정
  preDir: '00000000-0000-0000-0000-0000000000c3', // 오피스, Premium 센터장으로 지정
  office: '00000000-0000-0000-0000-0000000000c4', // 오피스, 지정 없음
  kr: '00000000-0000-0000-0000-0000000000a1',
  jp: '00000000-0000-0000-0000-0000000000a2',
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${U.admin}', 'admin@example.com', now()), ('${U.krMkt}', 'krmkt@example.com', now()), ('${U.preDir}', 'predir@example.com', now()),
    ('${U.office}', 'office@example.com', now()), ('${U.kr}', 'kr@example.com', now()), ('${U.jp}', 'jp@example.com', now());
  insert into public.staff_users (user_id, name) values ('${U.admin}', '관리자'), ('${U.krMkt}', '한국 마케터'), ('${U.preDir}', 'Premium 센터장'), ('${U.office}', '오피스');
  insert into public.user_roles (user_id, role, campus) values ('${U.krMkt}', 'office', ''), ('${U.preDir}', 'office', ''), ('${U.office}', 'office', '');
  insert into public.agency_members (user_id, email, agency_name, branch, country, status) values
    ('${U.kr}', 'kr@example.com', '샘플유학', '서울', '한국', 'active'), ('${U.jp}', 'jp@example.com', '테스트', '도쿄', '일본', 'active');
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
const NEW = `insert into public.visit_requests (campus, visit_date, people, purposes) values`;
const step = (id, status, extra = '') => q(`update public.visit_requests set status = '${status}'${extra} where id = $1 returning status`, [id]);

// 신청: 한국 Premium 2건, 일본 Challenger 1건
const kr1 = (await as(U.kr, () => q(`${NEW} ('premium', '2026-12-01', 2, '{캠퍼스 투어}') returning id`)))[0].id;
const kr2 = (await as(U.kr, () => q(`${NEW} ('premium', '2026-12-03', 2, '{수업 참관}') returning id`)))[0].id;
const jp1 = (await as(U.jp, () => q(`${NEW} ('challenger', '2026-12-05', 1, '{운영진 미팅}') returning id`)))[0].id;

// 1) 지정 전: 오피스 직원도 처리(지금처럼)
await as(U.office, async () => {
  ok('지정 전: 오피스 직원이 일정 조율 시작', (await step(jp1, 'scheduling'))[0]?.status === 'scheduling');
});

// 2) 처리자 지정은 관리자만
await as(U.office, () => fail('오피스: 처리자 지정 불가', () => q(`insert into public.visit_handlers (user_id, kind, country) values ('${U.office}', 'marketer', '한국')`), /row-level security/));
await as(U.admin, async () => {
  await q(`insert into public.visit_handlers (user_id, kind, country) values ('${U.krMkt}', 'marketer', '한국')`);
  await q(`insert into public.visit_handlers (user_id, kind, campus) values ('${U.preDir}', 'director', 'premium')`);
  await fail('마케터는 나라가 있어야', () => q(`insert into public.visit_handlers (user_id, kind) values ('${U.office}', 'marketer')`), /check/);
  await fail('센터장 캠퍼스는 목록 안', () => q(`insert into public.visit_handlers (user_id, kind, campus) values ('${U.office}', 'director', 'mco')`), /check/);
  await fail('직원이 아닌 계정은 지정 불가', () => q(`insert into public.visit_handlers (user_id, kind, country) values ('${U.kr}', 'marketer', '한국')`), /foreign key/);
});
await as(U.office, async () => ok('오피스: 지정 목록 읽기', (await q(`select * from public.visit_handlers`)).length === 2));
await as(U.kr, async () => ok('에이전시: 지정 목록 0건', (await q(`select * from public.visit_handlers`)).length === 0));

// 3) 한국 신청: 마케터만 조율·승인 요청
await as(U.office, async () => {
  await fail('지정 뒤: 다른 직원은 한국 신청 조율 불가', () => step(kr1, 'scheduling'), /마케터/);
  await fail('다른 직원은 방문 일정 고치기 불가', () => q(`update public.visit_requests set schedule_date = '2026-12-01' where id = $1`, [kr1]), /마케터나/);
  await fail('다른 직원은 취소 불가', () => step(kr1, 'cancelled', `, decision_reason = 'x'`), /취소는/);
  // 메모는 직원 모두
  await q(`insert into public.visit_request_events (request_id, kind, note, actor) values ($1, 'memo', '전화 옴', '${U.office}')`, [kr1]);
});
await as(U.admin, () => fail('관리자도 지정된 나라는 조율 불가', () => step(kr1, 'scheduling'), /마케터/));
await as(U.krMkt, async () => {
  ok('한국 마케터: 조율 시작', (await step(kr1, 'scheduling'))[0]?.status === 'scheduling');
  ok('한국 마케터: 일정 넣고 승인 요청', (await step(kr1, 'approval', `, schedule_date = '2026-12-01'`))[0]?.status === 'approval');
  await fail('마케터는 확정 불가', () => step(kr1, 'confirmed'), /센터장/);
});
// 4) Premium 센터장만 확정·반려·다시 조율
await as(U.admin, () => fail('관리자도 지정된 캠퍼스는 확정 불가(승인 권한 따로)', () => step(kr1, 'confirmed'), /센터장/));
await as(U.preDir, async () => {
  ok('Premium 센터장: 다시 조율로', (await step(kr1, 'scheduling'))[0]?.status === 'scheduling');
  await fail('센터장은 한국 신청 승인 요청 불가(마케터 몫)', () => step(kr1, 'approval'), /마케터/);
});
await as(U.krMkt, () => step(kr1, 'approval'));
await as(U.preDir, async () => {
  ok('Premium 센터장: 확정', (await step(kr1, 'confirmed'))[0]?.status === 'confirmed');
  ok('센터장: 취소(사유)', (await step(kr1, 'cancelled', `, decision_reason = '일정 변경'`))[0]?.status === 'cancelled');
});
// 5) 일본(마케터 지정 없음)·Challenger(센터장 지정 없음)는 직원 모두
await as(U.office, async () => {
  ok('지정 없는 나라: 오피스가 승인 요청', (await step(jp1, 'approval', `, schedule_date = '2026-12-05'`))[0]?.status === 'approval');
  ok('지정 없는 캠퍼스: 오피스가 확정', (await step(jp1, 'confirmed'))[0]?.status === 'confirmed');
});
// 6) 에이전시 취소는 그대로
await as(U.kr, async () => {
  await q(`select public.cancel_visit_request($1, '학생 사정')`, [kr2]);
  ok('에이전시 취소는 처리자와 상관없이', (await q(`select status from public.visit_requests where id = $1`, [kr2]))[0].status === 'cancelled');
});
// 7) 이력에 처리자
await as(U.admin, async () => {
  const ev = await q(`select to_status, actor from public.visit_request_events where request_id = $1 and kind = 'status' order by id`, [kr1]);
  const who = ev.map((e) => `${e.to_status}:${e.actor === U.kr ? 'kr' : e.actor === U.krMkt ? 'mkt' : e.actor === U.preDir ? 'dir' : '?'}`).join(',');
  ok('이력: 신청 대표 → 마케터 → 센터장', who === 'received:kr,scheduling:mkt,approval:mkt,scheduling:dir,approval:mkt,confirmed:dir,cancelled:dir', who);
  await q(`delete from public.visit_handlers where user_id = '${U.krMkt}'`);
  ok('관리자: 지정 지우기', (await q(`select * from public.visit_handlers`)).length === 1);
});
await as(null, () => fail('익명: 처리 함수 실행 불가', () => q(`select public.visit_handler_ok('marketer', '한국', '')`), /permission denied/));

console.log(`방문 신청 처리자 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
