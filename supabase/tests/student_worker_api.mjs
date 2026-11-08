// 학생 앱 배포 서버(apps/student/worker)의 /api 시험. 실제 마이그레이션을 올린 PGlite(pg-supabase.mjs)에
// 계정 생성 스크립트(npm run student:accounts)로 샘플 학생 계정을 만들고, Worker 를 묶어 학생 흐름 전체를 돌린다:
// 첫 비밀번호 변경 전 403 → 결석·외박 등록·취소 → 직원 승인을 학생이 봄 → 귀국 항공편 → 직원 배차 → 재확인 → 다른 학생과 분리.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/student_worker_api.mjs
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { startPgSupabase } from './pg-supabase.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : ' ' + JSON.stringify(extra)}`);
};

const sbs = await startPgSupabase();
const SB = sbs.url;
// 시험 서버가 같은 프로세스에서 돌므로 스크립트는 기다리는 동안 이벤트 루프를 막지 않게 띄운다.
const run = await new Promise((resolve) => {
  const child = spawn('npm', ['run', '-s', 'student:accounts', '--', '--apply'], {
    cwd: REPO,
    env: { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key' },
    shell: process.platform === 'win32',
  });
  let text = '';
  child.stdout.on('data', (c) => (text += c));
  child.stderr.on('data', (c) => (text += c));
  child.on('close', (status) => resolve({ status, text }));
});
ok('계정 생성 스크립트', run.status === 0 && /실패 0/.test(run.text), run.text);

const out = `${REPO}node_modules/.cache/student-worker.mjs`;
await build({ entryPoints: [`${REPO}apps/student/worker/index.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
const { handleApi, default: worker } = await import(pathToFileURL(out).href);

const env = { ASSETS: { fetch: async () => new Response('asset') }, SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const api = async (method, path, token, body) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await handleApi(new Request(`https://student.example${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { status: r.status, body: await r.json() };
};
const sql = (q, params = [], who = {}) => sbs.sql(q, params, who);
const students = Object.fromEntries(fs.readFileSync(`${REPO}data-sample/tables/students.ndjson`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((s) => [String(s.st_id), s]));
async function login(stId, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'anon-key' }, body: JSON.stringify({ email: `${stId}@students.jic.internal`, password }) });
  return (await r.json()).access_token;
}
async function firstLogin(stId) {
  const token = await login(stId, students[stId].st_birthday.replace(/-/g, ''));
  await fetch(`${SB}/auth/v1/user`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ password: 'jic2026ok' }) });
  await fetch(`${SB}/rest/v1/rpc/student_password_changed`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'anon-key', Authorization: `Bearer ${token}` }, body: '{}' });
  return token;
}

// ── 설정·로그인 전
let r = await handleApi(new Request('https://student.example/api/meta'), { ASSETS: env.ASSETS });
ok('변수 없으면 500 server_config', r.status === 500 && (await r.json()).error === 'server_config');
r = await worker.fetch(new Request('https://student.example/requests'), env);
ok('/api 밖은 정적 파일', (await r.text()) === 'asset');
let x = await api('GET', '/api/meta');
ok('로그인 전 meta: 샘플, 로컬 로그인 없음', x.status === 200 && x.body.source === 'sample' && x.body.localLogin === false && x.body.sampleLogin === null, x);
x = await api('GET', '/api/me');
ok('로그인 전 me 401', x.status === 401, x);
x = await api('GET', '/api/me', 'not.a.token');
ok('엉터리 토큰 401', x.status === 401, x);

// ── 첫 로그인: 비밀번호를 바꾸기 전에는 403
const A = '30095'; // 샘플: 재학 2026-07-26 ~ 2026-11-13
const t0 = await login(A, students[A].st_birthday.replace(/-/g, ''));
x = await api('GET', '/api/me', t0);
ok('변경 전 403 password_change_required', x.status === 403 && x.body.error === 'password_change_required', x);
const tA = await firstLogin(A);
x = await api('GET', '/api/me', tA);
ok('변경 후 내 정보: 본인 학생·연수만', x.status === 200 && x.body.student.stId === A && x.body.enrollment && x.body.departure === null, x);
ok('내 정보에 기숙사(배정 표)', !!x.body.enrollment.dorm, x.body.enrollment);

// ── 결석 신청 → 직원 승인 → 학생이 결과를 봄
x = await api('POST', '/api/absences', tA, { date: '2026-11-10', kind: 'sick', periods: [1, 2], reason: '감기' });
ok('결석 등록 201, 번호는 UUID', x.status === 201 && /^[0-9a-f-]{36}$/.test(x.body.id) && x.body.status === 'pending', x);
const abs1 = x.body.id;
const findAbs = async (token, id) => (await api('GET', '/api/absences', token)).body.rows.find((y) => y.id === id);
let a1 = await findAbs(tA, abs1);
ok('등록한 번호가 목록에 그대로', a1 && a1.periods.join() === '1,2' && a1.date === '2026-11-10' && a1.status === 'pending', a1);
x = await api('POST', '/api/absences', tA, { date: '2026-11-10', kind: 'sick', periods: [2], reason: '감기' });
ok('같은 날 같은 교시 409', x.status === 409 && x.body.error === 'duplicate', x);
x = await api('POST', '/api/absences', tA, { date: '2026-12-20', kind: 'sick', periods: [], reason: 'x' });
ok('연수 기간 밖 400', x.status === 400 && x.body.error === 'date_out_of_range', x);
const staff = '00000000-0000-4000-8000-0000000000c1';
await sbs.addUser({ id: staff, email: 'staff@jic.example', password: 'staffpass1' });
await sql(`insert into public.staff_users (user_id, name) values ($1, '오피스 김') on conflict do nothing`, [staff]);
const dec = await sql(`select public.decide_absence_requests(array[$1]::uuid[], true, '진단서 확인') n`, [abs1], { role: 'authenticated', sub: staff });
ok('직원 승인 1건', dec[0]?.n === 1, dec);
a1 = await findAbs(tA, abs1);
ok('학생이 승인·메모를 봄, 처리자는 안 보임', a1.status === 'approved' && a1.comment === '진단서 확인' && a1.decidedAt && a1.decidedBy === null, a1);
x = await api('POST', '/api/absences', tA, { date: '2026-11-12', kind: 'personal', periods: [], reason: '병원' });
const abs2 = x.body.id;
x = await api('POST', `/api/absences/${abs2}/cancel`, tA, {});
ok('취소(취소 함수)', x.status === 200 && x.body.status === 'cancelled', x);
x = await api('POST', `/api/absences/${abs2}/cancel`, tA, {});
ok('다시 취소 409 not_pending', x.status === 409 && x.body.error === 'not_pending', x);
x = await api('POST', `/api/absences/${abs1}/cancel`, tA, {});
ok('승인된 건 취소 불가', x.status === 409 && x.body.error === 'not_pending', x);
x = await api('GET', '/api/absences', tA);
ok('신청 목록: 최신순 2건', x.status === 200 && x.body.rows.length === 2 && x.body.rows[0].id === abs2, x.body.rows?.map((y) => y.id));

// ── 외박
x = await api('POST', '/api/overnights', tA, { from: '2026-11-11', until: '2026-11-12', reason: '여행' });
ok('외박 등록', x.status === 201 && x.body.from === '2026-11-11' && x.body.until === '2026-11-12', x);
const ov = x.body.id;
x = await api('POST', '/api/overnights', tA, { from: '2026-11-11', until: '2026-11-13', reason: '겹침' });
ok('겹치는 외박 409', x.status === 409 && x.body.error === 'duplicate', x);
const ol = await api('GET', '/api/overnights', tA);
ok('외박 목록에 박 수', ol.body.rows.find((y) => y.id === ov)?.nights === 1, ol.body.rows);
x = await api('POST', `/api/overnights/${ov}/cancel`, tA, {});
ok('외박 취소', x.status === 200 && x.body.status === 'cancelled', x);

// ── 귀국 항공편 → 직원 배차 → 학생이 시각을 바꾸면 재확인
x = await api('GET', '/api/departure', tA);
ok('항공편 화면: 연수, 배차 없음', x.status === 200 && x.body.enrollment && x.body.departure === null && x.body.ride.state === 'none', x);
const trA = x.body.enrollment.trId;
x = await api('PUT', '/api/departure', tA, { date: '2026-11-14', time: '10:30', flight: 'pr 468', airport: 'MANILA', needsRide: true, note: '' });
ok('항공편 등록 201', x.status === 201 && x.body.flight === 'PR 468' && x.body.time === '10:30', x);
x = await api('GET', '/api/departure', tA);
ok('저장된 항공편 + 배차 요청', x.body.departure?.date === '2026-11-14' && x.body.ride.state === 'requested', x.body);
await sql(`insert into public.airport_rides (enrollment_id, student_no, decision, pickup_date, pickup_time, note, for_date, for_time, decided_by) values ($1, $2, 'confirmed', '2026-11-14', '06:30', '정문, 밴 2호차', '2026-11-14', '10:30', $3)`, [trA, A, staff], { role: 'authenticated', sub: staff });
x = await api('GET', '/api/departure', tA);
ok('학생에게 배차 확정·기숙사 출발 시각', x.body.ride.state === 'confirmed' && x.body.ride.pickupTime === '06:30' && x.body.ride.note === '정문, 밴 2호차', x.body.ride);
x = await api('PUT', '/api/departure', tA, { date: '2026-11-14', time: '12:00', flight: 'PR 468', airport: 'MANILA', needsRide: true, note: '' });
ok('항공편 수정(PATCH)', x.status === 200 && x.body.time === '12:00', x);
x = await api('GET', '/api/departure', tA);
ok('시각을 바꾸면 재확인', x.body.ride.state === 'changed', x.body.ride);
x = await api('GET', '/api/me', tA);
ok('내 정보에 항공편', x.body.departure?.flight === 'PR 468', x.body.departure);

// ── 다른 학생에게는 안 보임
const linked = await sql(`select student_no from public.student_users where student_no <> $1 order by student_no limit 1`, [A]);
const Bno = linked[0].student_no;
const tB = await firstLogin(Bno);
x = await api('GET', '/api/absences', tB);
ok('학생B는 A의 신청을 못 봄', x.status === 200 && x.body.rows.every((y) => y.stId === Bno) && !x.body.rows.some((y) => y.id === abs1), x.body.rows);
x = await api('POST', `/api/absences/${abs1}/cancel`, tB, {});
ok('학생B가 A의 신청 취소 불가', x.status === 404 || x.body.error === 'not_found', x);

// ── 본문 검사
x = await api('POST', '/api/absences', tA, 'x'.repeat(17 * 1024));
ok('큰 본문 413', x.status === 413 && x.body.error === 'body_too_large', x);
x = await api('POST', '/api/absences', tA, '{not json');
ok('잘못된 JSON 400', x.status === 400 && x.body.error === 'invalid_json', x);

// ── DB에 실제로 남은 것
const rows = await sql(`select status, created_by::text = (select user_id::text from public.student_users where student_no = $1) mine from public.absence_requests where student_no = $1 order by created_at`, [A]);
ok('DB: 결석 2건(승인·취소), 작성자 = 학생 계정', rows.length === 2 && rows[0].status === 'approved' && rows[1].status === 'cancelled' && rows.every((y) => y.mine), rows);

await sbs.close();
console.log(fails ? `${fails}건 실패` : '모두 통과');
process.exit(fails ? 1 : 0);
