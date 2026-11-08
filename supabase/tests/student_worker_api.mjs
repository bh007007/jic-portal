// 학생 앱 배포 서버(apps/student/worker)의 /api 시험. 실제 마이그레이션을 올린 PGlite(pg-supabase.mjs)에
// 계정 생성 스크립트(npm run student:accounts)로 샘플 학생 계정을 만들고, Worker 를 묶어 학생 흐름 전체를 돌린다:
// 첫 비밀번호 변경 전 403 → 결석·외박 등록·취소 → 직원 승인을 학생이 봄 → 귀국 항공편 → 직원 배차 → 재확인 → 생활 요청
// → 다른 학생과 분리 → 학교 여행 참가 신청·취소(정원·명단 제외).
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
x = await api('POST', '/api/overnights', tA, { from: '2026-11-11', until: '2026-11-12', reason: '여행', destination: 'Baguio', contact: '+63 917 555 0000' });
ok('외박 등록(여행 정보 저장)', x.status === 201 && x.body.from === '2026-11-11' && x.body.until === '2026-11-12' && x.body.destination === 'Baguio', x);
const odb = await sql(`select destination, contact from public.overnight_permissions where id = $1`, [x.body.id]);
ok('DB: 행선지·연락처', odb[0]?.destination === 'Baguio' && odb[0].contact === '+63 917 555 0000', odb);
const ov = x.body.id;
x = await api('POST', '/api/overnights', tA, { from: '2026-11-11', until: '2026-11-13', reason: '겹침', destination: 'Baguio', contact: '+63 917 555 0000' });
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

// ── 생활 요청: 학생 등록·취소 → 직원 처리(함수) → 학생이 답변을 봄
x = await api('GET', '/api/life-requests', tA);
ok('생활 요청 목록: 요청 가능, 비어 있음', x.status === 200 && x.body.canRequest === true && x.body.rows.length === 0, x);
x = await api('POST', '/api/life-requests', tA, { category: 'id_card', content: 'ID 카드를 잃어버렸습니다' });
ok('생활 요청 등록 201, 번호 UUID, 접수', x.status === 201 && /^[0-9a-f-]{36}$/.test(x.body.id) && x.body.status === 'received' && x.body.trId === trA, x);
const lifeA = x.body.id;
x = await api('POST', '/api/life-requests', tA, { category: 'facility', content: '방 전등이 깜빡입니다' });
const lifeB = x.body.id;
x = await api('POST', `/api/life-requests/${lifeB}/cancel`, tA, {});
ok('접수 상태 취소(취소 함수)', x.status === 200 && x.body.status === 'cancelled', x);
x = await api('POST', '/api/life-requests', tA, { category: 'bogus', content: 'x' });
ok('없는 종류 400', x.status === 400 && x.body.error === 'invalid_category', x);
await sql(`select public.handle_nonacademic_request($1, 'done', '사무실에서 새 카드를 받으세요')`, [lifeA], { role: 'authenticated', sub: staff });
x = await api('GET', '/api/life-requests', tA);
const lr = x.body.rows.find((r) => r.id === lifeA);
ok('학생이 완료·답변을 봄, 처리자는 안 보임', lr?.status === 'done' && lr.reply === '사무실에서 새 카드를 받으세요' && lr.handledAt && !lr.handledBy, lr);
x = await api('POST', `/api/life-requests/${lifeA}/cancel`, tA, {});
ok('처리된 요청 취소 409', x.status === 409 && x.body.error === 'not_pending', x);
const ldb = await sql(`select count(*)::int n from public.nonacademic_requests where student_no = $1`, [A]);
ok('DB: 생활 요청 2건', ldb[0].n === 2, ldb);

// ── 다른 학생에게는 안 보임
const linked = await sql(`select student_no from public.student_users where student_no <> $1 order by student_no limit 1`, [A]);
const Bno = linked[0].student_no;
const tB = await firstLogin(Bno);
x = await api('GET', '/api/absences', tB);
ok('학생B는 A의 신청을 못 봄', x.status === 200 && x.body.rows.every((y) => y.stId === Bno) && !x.body.rows.some((y) => y.id === abs1), x.body.rows);
x = await api('POST', `/api/absences/${abs1}/cancel`, tB, {});
ok('학생B가 A의 신청 취소 불가', x.status === 404 || x.body.error === 'not_found', x);
x = await api('GET', '/api/life-requests', tB);
ok('학생B는 A의 생활 요청을 못 봄', x.status === 200 && !x.body.rows.some((r) => r.id === lifeA), x.body.rows);
x = await api('POST', `/api/life-requests/${lifeA}/cancel`, tB, {});
ok('학생B가 A의 생활 요청 취소 불가', x.status === 404, x);

// ── 학교 여행: 직원이 올린 여행에 학생이 신청·취소(DB 함수), 정원, 명단 제외 사유를 학생이 봄
const manila = (await sql(`select (now() at time zone 'Asia/Manila')::date::text d`))[0].d;
const dplus = (n) => new Date(Date.parse(manila) + n * 864e5).toISOString().slice(0, 10);
// 여행 날짜(내일~모레)가 연수 기간에 들어가는 계정 학생(가능하면 A). 샘플 연수가 끝나 없으면 샘플 데이터를 다시 만든다.
const fit = await sql(
  `select su.student_no, e.data->>'first_co_ca_code' ca from public.student_users su join public.legacy_enrollments e on e.data->>'tr_st_id' = su.student_no
    where left(e.data->>'tr_start_date', 10) <= $1 and left(e.data->>'tr_finish_date', 10) >= $2 and coalesce(e.data->>'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청'
    order by (su.student_no = $3) desc, su.student_no`,
  [dplus(1), dplus(2), A],
);
ok('여행 날짜에 재학하는 계정 학생이 있음', fit.length >= 2, fit.length);
const S = fit[0].student_no;
const tS = S === A ? tA : S === Bno ? tB : await firstLogin(S);
const S2 = fit.find((f) => f.student_no !== S).student_no;
const tS2 = S2 === A ? tA : S2 === Bno ? tB : await firstLogin(S2);
const otherCampus = String(fit[0].ca).toUpperCase() === 'PREMIUM' ? 'Challenger' : 'Premium';
const mkTrip = async (title, campus, start, end, capacity) =>
  (await sql(`insert into public.trips (campus, title, place, start_date, end_date, deadline, capacity, cost) values ($1, $2, 'La Union', $3, $4, $5, $6, 1800) returning id`, [campus, title, start, end, manila, capacity], { role: 'authenticated', sub: staff }))[0].id;
const trip1 = await mkTrip('라 우니온 1박', '', dplus(1), dplus(2), 1);
const tripOther = await mkTrip('다른 캠퍼스', otherCampus, dplus(1), dplus(2), 5);
x = await api('GET', '/api/trips', tS);
const row1 = x.body.rows?.find((t) => t.id === trip1);
ok('여행 목록: 전체 캠퍼스 여행, 다른 캠퍼스는 안 보임, 올린 직원 안 보임', x.status === 200 && row1 && !x.body.rows.some((t) => t.id === tripOther) && !('createdBy' in row1), x.body);
ok('여행 행: 1박, 남은 1, 신청 가능', row1?.nights === 1 && row1.left === 1 && row1.canApply === true && row1.cost === 1800, row1);
x = await api('POST', `/api/trips/${trip1}/signup`, tS, {});
ok('참가 신청 201(DB 함수), 남은 0', x.status === 201 && x.body.mine?.status === 'applied' && x.body.left === 0 && x.body.canCancel === true, x);
const su1 = x.body.mine?.id;
let tdb = await sql(`select t.seats_taken, s.id::text sid, s.student_no from public.trips t join public.trip_signups s on s.trip_id = t.id where t.id = $1`, [trip1]);
ok('DB: 신청 1(번호 = 서버가 정한 값), 신청 수 1', tdb.length === 1 && tdb[0].seats_taken === 1 && tdb[0].sid === su1 && tdb[0].student_no === S, tdb);
x = await api('POST', `/api/trips/${trip1}/signup`, tS, {});
ok('같은 여행 두 번 409', x.status === 409 && x.body.error === 'already_applied', x);
x = await api('GET', `/api/trips/${trip1}`, tS2);
ok('다른 학생: 정원이 차서 신청 불가, 남의 신청은 안 보임', x.status === 200 && x.body.why === 'trip_full' && x.body.mine === null, x.body);
x = await api('POST', `/api/trips/${trip1}/signup`, tS2, {});
ok('정원 초과 409', x.status === 409 && x.body.error === 'trip_full', x);
x = await api('POST', `/api/trips/${tripOther}/signup`, tS, {});
ok('다른 캠퍼스 여행 404', x.status === 404, x);
x = await api('POST', `/api/trips/${trip1}/cancel`, tS, {});
ok('신청 취소(DB 함수), 자리 돌아옴', x.status === 200 && x.body.mine?.status === 'cancelled' && x.body.left === 1, x);
x = await api('POST', `/api/trips/${trip1}/signup`, tS2, {});
ok('자리가 나면 다른 학생 신청', x.status === 201, x);
const su2 = x.body.mine?.id;
await sql(`select public.trip_remove_signup($1, '보호자 동의서 미제출')`, [su2], { role: 'authenticated', sub: staff });
x = await api('GET', `/api/trips/${trip1}`, tS2);
ok('명단 제외: 학생이 사유를 봄, 처리자는 안 보임, 다시 신청 가능', x.body.mine?.status === 'removed' && x.body.mine.reason === '보호자 동의서 미제출' && !('handledBy' in x.body.mine) && x.body.canApply === true, x.body);
tdb = await sql(`select seats_taken from public.trips where id = $1`, [trip1]);
ok('DB: 신청 수 0', tdb[0].seats_taken === 0, tdb);
await sql(`update public.trips set status = 'cancelled' where id = $1`, [trip1], { role: 'authenticated', sub: staff });
x = await api('GET', '/api/trips', tS2);
ok('신청했던 여행이 취소되면 목록에 취소로 남음', x.body.rows?.find((t) => t.id === trip1)?.status === 'cancelled', x.body.rows);

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
