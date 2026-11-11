// 방문 신청 확장(20261111220000_visit_requests_v2.sql, CL-046) 권한·단계 시험. 데이터는 전부 가짜다.
// - 에이전시 대표는 캠퍼스·목적을 채워 신청하고 자기 것만 본다. 직원 아이디는 신청 못 한다. 처리 칸을 채워 넣을 수 없다.
// - 단계: 접수 → 일정 조율 중 → 승인 요청(조율한 날짜 필요) → 확정 / 반려(사유), 취소(사유). 건너뛰기·되돌리기 막음. 이력이 남는다.
// - 에이전시는 고치지 못하고 취소 함수로 자기 신청만 취소한다. 이력은 직원만 본다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/partner_visits_rls.mjs
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
for (const f of ['20261107000000_legacy_tables.sql', '20261107010000_partner_portal.sql', '20261110143500_perf_policies_indexes.sql', '20261110163500_partner_country_targeting.sql', '20261109130000_legacy_prices.sql', '20261110173500_partner_tuition.sql', '20261110193000_agency_staff.sql'])
  await db.exec(mig(f));
await db.exec(mig('20261111220000_visit_requests_v2.sql'));
await db.exec(mig('20261111220000_visit_requests_v2.sql')); // 두 번째 실행
ok('마이그레이션 2회 실행', true);

const U = {
  jic: '00000000-0000-0000-0000-0000000000c1',
  kr: '00000000-0000-0000-0000-0000000000a1',
  jp: '00000000-0000-0000-0000-0000000000a2',
  krStaff: '00000000-0000-0000-0000-0000000000b1',
};
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${U.jic}', 'jic@example.com', now()), ('${U.kr}', 'kr@example.com', now()), ('${U.jp}', 'jp@example.com', now()), ('${U.krStaff}', 'krstaff@example.com', now());
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
const NEW = `insert into public.visit_requests (campus, visit_date, visit_date2, visit_time, people, purposes, pickup, purpose)`;

// 1) 에이전시 신청
let krId;
await as(U.kr, async () => {
  const r = await q(`${NEW} values ('premium', '2026-12-01', '2026-12-02', '오전', 3, '{캠퍼스 투어,수업 참관}', 'airport', '점심 포함 부탁') returning id, status, member_id`);
  krId = r[0].id;
  ok('대표: 신청 → 접수, 내 아이디', r[0].status === 'received' && r[0].member_id === U.kr);
  await q(`${NEW} values ('challenger', '2026-12-01', null, '오후', 3, '{기숙사 확인}', 'none', null)`);
  await fail('대표: 캠퍼스 없이 불가', () => q(`${NEW} values (null, '2026-12-01', null, null, 1, '{캠퍼스 투어}', 'none', null)`), /row-level security/);
  await fail('대표: 목적 없이 불가', () => q(`${NEW} values ('premium', '2026-12-01', null, null, 1, '{}', 'none', null)`), /row-level security/);
  await fail('대표: 목록에 없는 목적 불가', () => q(`${NEW} values ('premium', '2026-12-01', null, null, 1, '{관광}', 'none', null)`), /check/);
  await fail('대표: 확정으로 넣기 불가', () => q(`insert into public.visit_requests (campus, visit_date, people, purposes, status) values ('premium', '2026-12-01', 1, '{캠퍼스 투어}', 'confirmed')`), /row-level security/);
  await fail('대표: 일정·안내를 채워 넣기 불가', () => q(`insert into public.visit_requests (campus, visit_date, people, purposes, schedule_date) values ('premium', '2026-12-01', 1, '{캠퍼스 투어}', '2026-12-01')`), /row-level security/);
  await fail('대표: 1·2순위 같은 날 불가', () => q(`${NEW} values ('premium', '2026-12-01', '2026-12-01', null, 1, '{캠퍼스 투어}', 'none', null)`), /check/);
  const u = await q(`update public.visit_requests set status = 'confirmed' returning id`);
  ok('대표: 직접 고치기 0건', u.length === 0);
  ok('대표: 내 신청 2건', (await q(`select id from public.visit_requests`)).length === 2);
  // 이력 표는 정책으로 막는다(직원만) → 0건
  ok('대표: 이력 0건', (await q(`select * from public.visit_request_events`)).length === 0);
});
await as(U.krStaff, async () => {
  await fail('지점 직원 아이디: 신청 불가', () => q(`${NEW} values ('premium', '2026-12-01', null, null, 1, '{캠퍼스 투어}', 'none', null)`), /row-level security/);
});
await as(U.jp, async () => {
  await q(`${NEW} values ('premium', '2026-12-05', null, null, 2, '{운영진 미팅}', 'city', null)`);
  ok('일본 대표: 내 것만', (await q(`select id from public.visit_requests`)).length === 1);
});

// 2) 직원 처리: 단계
await as(U.jic, async () => {
  ok('직원: 모두 봄(3건)', (await q(`select id from public.visit_requests`)).length === 3);
  await fail('건너뛰기(접수 → 확정) 불가', () => q(`update public.visit_requests set status = 'confirmed' where id = $1`, [krId]), /바꿀 수 없습니다/);
  await q(`update public.visit_requests set status = 'scheduling', staff_note = '담당자가 연락드립니다' where id = $1`, [krId]);
  await fail('조율 날짜 없이 승인 요청 불가', () => q(`update public.visit_requests set status = 'approval' where id = $1`, [krId]), /날짜/);
  await q(`update public.visit_requests set status = 'approval', schedule_date = '2026-12-02', schedule_time = '10:00' where id = $1`, [krId]);
  await fail('사유 없이 반려 불가', () => q(`update public.visit_requests set status = 'rejected' where id = $1`, [krId]), /사유/);
  await q(`update public.visit_requests set status = 'scheduling' where id = $1`, [krId]); // 센터장이 다시 조율로 돌려보냄
  await q(`update public.visit_requests set status = 'approval' where id = $1`, [krId]);
  await q(`update public.visit_requests set status = 'confirmed' where id = $1`, [krId]);
  await fail('확정 → 접수 되돌리기 불가', () => q(`update public.visit_requests set status = 'received' where id = $1`, [krId]), /바꿀 수 없습니다/);
  await q(`insert into public.visit_request_events (request_id, kind, note) values ($1, 'memo', '픽업 차량 배정')`, [krId]);
  await fail('직원: 단계 이력을 직접 넣기 불가', () => q(`insert into public.visit_request_events (request_id, kind, to_status) values ($1, 'status', 'confirmed')`, [krId]), /row-level security/);
  const ev = await q(`select kind, from_status, to_status, note, actor from public.visit_request_events where request_id = $1 order by id`, [krId]);
  const flow = ev.filter((e) => e.kind === 'status').map((e) => e.to_status).join('>');
  ok('이력: 접수>조율>승인 요청>조율>승인 요청>확정', flow === 'received>scheduling>approval>scheduling>approval>confirmed', flow);
  ok('이력: 신청은 대표, 처리는 직원', ev[0].actor === U.kr && ev[1].actor === U.jic, JSON.stringify(ev.slice(0, 2)));
  ok('이력: 메모', ev.some((e) => e.kind === 'memo' && e.note === '픽업 차량 배정' && e.actor === U.jic));
  const u = (await q(`select updated_at > created_at as moved from public.visit_requests where id = $1`, [krId]))[0];
  ok('고친 시각', u.moved === true);
});

// 3) 에이전시 취소
await as(U.kr, async () => {
  await fail('사유 없이 취소 불가', () => q(`select public.cancel_visit_request($1, '  ')`, [krId]), /사유/);
  await q(`select public.cancel_visit_request($1, '일정 변경')`, [krId]);
  const r = (await q(`select status, decision_reason from public.visit_requests where id = $1`, [krId]))[0];
  ok('대표: 확정된 신청 취소 + 사유가 보임', r.status === 'cancelled' && r.decision_reason === '일정 변경', JSON.stringify(r));
  await fail('이미 취소된 것 다시 취소 불가', () => q(`select public.cancel_visit_request($1, '또')`, [krId]), /취소할 수 있는/);
});
const jpId = (await q(`select id from public.visit_requests where member_id = '${U.jp}'`))[0].id;
await as(U.kr, () => fail('남의 신청 취소 불가', () => q(`select public.cancel_visit_request($1, '장난')`, [jpId]), /취소할 수 있는/));
await as(U.krStaff, () => fail('지점 직원 아이디: 취소 불가', () => q(`select public.cancel_visit_request($1, 'x')`, [jpId]), /대표/));
await as(null, () => fail('익명: 취소 함수 실행 불가', () => q(`select public.cancel_visit_request(1, 'x')`), /permission denied/));
await as(U.jic, async () => {
  const ev = await q(`select actor, note from public.visit_request_events where request_id = $1 and to_status = 'cancelled'`, [krId]);
  ok('취소 이력: 대표·사유', ev.length === 1 && ev[0].actor === U.kr && ev[0].note === '일정 변경', JSON.stringify(ev));
  await fail('취소 뒤 다시 진행 불가', () => q(`update public.visit_requests set status = 'scheduling' where id = $1`, [krId]), /바꿀 수 없습니다/);
});

console.log(`방문 신청 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
process.exit(fails.length ? 1 : 0);
