// 인트라넷 배포 서버(apps/intranet/worker)의 /api 시험. 실제 마이그레이션을 올린 PGlite(pg-supabase.mjs)에서
// 직원 두 명(Challenger·Premium 담당)으로: 설정·점수표 → 통금 위반 후보·승인 → 결석·외박 처리 → 배차 → 공지·읽음
// → 상담 기록(같은 캠퍼스만, 내용은 함수로, 접근 기록) → Student File, 그리고 가드 공용 계정(출입구 고정, 가드 API 만,
// 재학생 명단·승인된 외박은 서비스 키로 사유 없이), 학교 여행(등록·수정·명단 제외·취소, 참가자 외박 허용이 가드 화면에).
// 학생 쓰기는 학생 역할로 SQL 을 실행한다.
//
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node supabase/tests/intranet_worker_api.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { startPgSupabase } from './pg-supabase.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : ' ' + JSON.stringify(extra)}`);
};

const sb = await startPgSupabase();
const out = `${REPO}node_modules/.cache/intranet-worker.mjs`;
await build({ entryPoints: [`${REPO}apps/intranet/worker/index.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
const { handleApi, default: worker } = await import(pathToFileURL(out).href);

const env = { ASSETS: { fetch: async () => new Response('asset') }, SUPABASE_URL: sb.url, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const api = async (method, path, token, body) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await handleApi(new Request(`https://intranet.example${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { status: r.status, body: await r.json() };
};
const login = async (email, password) =>
  (await (await fetch(`${sb.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
const as = (sub) => ({ role: 'authenticated', sub });

// ── 계정: 직원 C(Challenger), 직원 P(Premium), 가드(Challenger 정문), 학생
const U = {
  staffC: '00000000-0000-4000-8000-0000000000c1',
  staffP: '00000000-0000-4000-8000-0000000000c2',
  guard: '00000000-0000-4000-8000-0000000000d1',
  student: '00000000-0000-4000-8000-0000000000a1',
};
await sb.addUser({ id: U.staffC, email: 'c@staff.example', password: 'staffpass1' });
await sb.addUser({ id: U.staffP, email: 'p@staff.example', password: 'staffpass1' });
await sb.addUser({ id: U.guard, email: 'gate-c@guard.example', password: 'guardpass1' });
await sb.addUser({ id: U.student, email: 's@students.example', password: 'studentpass1' });
await sb.sql(`insert into public.staff_users (user_id, name) values ($1, '직원C'), ($2, '직원P')`, [U.staffC, U.staffP]);
await sb.sql(`insert into public.staff_campuses values ($1, 'Challenger'), ($2, 'Premium')`, [U.staffC, U.staffP]);
await sb.sql(`insert into public.guard_accounts values ($1, 'Challenger', 'Challenger 정문')`, [U.guard]);
const tC = await login('c@staff.example', 'staffpass1');
const tP = await login('p@staff.example', 'staffpass1');
const tG = await login('gate-c@guard.example', 'guardpass1');

// ── 설정·로그인
let r = await handleApi(new Request('https://intranet.example/api/meta'), { ASSETS: env.ASSETS });
ok('변수 없으면 500 server_config', r.status === 500);
r = await worker.fetch(new Request('https://intranet.example/penalties'), env);
ok('/api 밖은 정적 파일', (await r.text()) === 'asset');
let x = await api('GET', '/api/meta');
ok('로그인 없이 401', x.status === 401, x);
await sb.addUser({ id: '00000000-0000-4000-8000-0000000000e1', email: 'nobody@example.com', password: 'nobodypass1' });
x = await api('GET', '/api/meta', await login('nobody@example.com', 'nobodypass1'));
ok('직원·가드가 아닌 계정 403 staff_only', x.status === 403 && x.body.error === 'staff_only', x);
x = await api('GET', '/api/meta', tC);
ok('직원 meta: 샘플, 처리자 = staff_users.name, role staff', x.status === 200 && x.body.source === 'sample' && x.body.actor === '직원C' && x.body.role === 'staff', x);
x = await api('GET', '/api/summary', tC);
ok('홈 요약', x.status === 200, x);

// ── 재학생: Challenger·Premium 한 명씩
x = await api('GET', '/api/students?size=200', tC);
const rows = x.body.rows ?? [];
const sC = rows.find((s) => s.campus === 'Challenger')?.stId;
const sP = rows.find((s) => s.campus === 'Premium')?.stId;
ok('Student File 목록(두 캠퍼스)', x.status === 200 && sC && sP, { status: x.status, n: rows.length });
const trOf = async (stId) => (await sb.sql(`select id from public.legacy_enrollments where data->>'tr_st_id' = $1 order by data->>'tr_start_date' desc limit 1`, [stId]))[0].id;
const trC = await trOf(sC);
await sb.sql(`insert into public.student_users (user_id, student_no, must_change_password) values ($1, $2, false)`, [U.student, sC]);

// ── 설정·점수표
x = await api('GET', '/api/settings', tC);
ok('설정 읽기(기본 통금 23:00)', x.body.curfew === '23:00', x);
x = await api('PUT', '/api/settings', tC, { curfew: '22:30', guards: ['근무자1', '근무자2'] });
ok('설정 저장', x.status === 200, x);
x = await api('GET', '/api/settings', tC);
ok('설정이 DB에 남음', x.body.curfew === '22:30' && x.body.guards.join() === '근무자1,근무자2', x);
x = await api('GET', '/api/penalty-rules', tC);
ok('점수표 읽기(종류 4, 단계 3)', x.body.kinds?.length === 4 && x.body.stages?.length === 3, x);
const rules = { kinds: x.body.kinds.map((k) => ({ ...k, score: k.code === 'curfew' ? 3 : k.score, approver: k.code === 'curfew' ? '생활관리' : k.approver })), stages: x.body.stages.map((s, i) => ({ ...s, min: [5, 10, 20][i] })) };
x = await api('PUT', '/api/penalty-rules', tC, rules);
ok('점수표 저장', x.status === 200, x);
x = await api('GET', '/api/penalty-rules', tC);
ok('점수표가 DB에 남음', x.body.kinds.find((k) => k.code === 'curfew').score === 3 && x.body.stages.map((s) => s.min).join() === '5,10,20', x.body);

// ── 통금 위반: 어젯밤 통금(22:30) 뒤에 들어온 기록 → 후보 → 승인(점수표 점수)
const night = (await sb.sql(`select (now() at time zone 'Asia/Manila')::date - 1 as d`))[0].d;
const nightStr = night instanceof Date ? night.toISOString().slice(0, 10) : String(night).slice(0, 10);
const outId = '0a000000-0000-4000-8000-000000000001';
await sb.sql(`insert into public.outings (id, student_no, enrollment_id, campus, out_at, out_by, in_at, in_by) values ($1, $2, $3, 'Challenger', ($4 || ' 20:00+08')::timestamptz, '근무자1', ($4 || ' 23:40+08')::timestamptz, '근무자2')`, [outId, sC, trC, nightStr]);
x = await api('GET', '/api/penalties?tab=pending', tC);
const cand = (x.body.rows ?? []).find((p) => p.sourceId === outId);
ok('통금 위반 후보가 생김', x.status === 200 && cand && cand.status === 'pending' && cand.kind === 'curfew', x.body.rows?.slice?.(0, 3));
const inDb = await sb.sql(`select id, status, source from public.penalties where source_id = $1`, [outId]);
ok('후보가 DB에 저장(id curfew-…)', inDb.length === 1 && inDb[0].id === `curfew-${outId}` && inDb[0].source === 'outing', inDb);
x = await api('POST', '/api/penalties/decide', tC, { ids: [cand.id], approve: true });
ok('패널티 승인', x.status === 200, x);
const pdb = (await sb.sql(`select status, score, decided_by::text from public.penalties where id = $1`, [cand.id]))[0];
ok('DB: 승인, 점수 3, 처리자 = 직원C 계정', pdb.status === 'approved' && pdb.score === 3 && pdb.decided_by === U.staffC, pdb);
x = await api('GET', '/api/penalties?tab=approved', tC);
ok('목록에 처리자 이름', (x.body.rows ?? []).find((p) => p.id === cand.id)?.decidedBy === '직원C', x.body.rows?.[0]);
x = await api('GET', '/api/outings?mode=curfew', tC);
ok('통금 확인 화면', x.status === 200, x);

// ── 결석·외박: 학생이 낸 신청을 직원이 처리
const absId = '0b000000-0000-4000-8000-000000000001';
await sb.sql(`insert into public.absence_requests (id, student_no, enrollment_id, absence_date, kind, reason) values ($1, $2, $3, current_date, 'sick', '감기')`, [absId, sC, trC], as(U.student));
const ovId = '0c000000-0000-4000-8000-000000000001';
await sb.sql(`insert into public.overnight_permissions (id, student_no, enrollment_id, leave_date, return_date, reason) values ($1, $2, $3, current_date, current_date + 1, '가족 방문')`, [ovId, sC, trC], as(U.student));
x = await api('GET', '/api/requests/absences?tab=pending', tC);
ok('결석 신청 목록', x.status === 200 && (x.body.absences ?? []).some((a) => a.id === absId), x.body);
x = await api('POST', '/api/requests/absences/decide', tC, { ids: [absId], approve: false, comment: '진단서 필요' });
ok('결석 반려', x.status === 200, x);
const adb = (await sb.sql(`select status, staff_comment, decided_by::text from public.absence_requests where id = $1`, [absId]))[0];
ok('DB: 반려·메모·처리자', adb.status === 'rejected' && adb.staff_comment === '진단서 필요' && adb.decided_by === U.staffC, adb);
x = await api('POST', '/api/requests/overnights/decide', tC, { ids: [ovId], approve: true });
ok('외박 승인', x.status === 200, x);
x = await api('GET', '/api/requests/overnights?tab=approved', tC);
const ovRow = (x.body.overnights ?? []).find((o) => o.id === ovId);
ok('외박 목록: 승인, 처리자 이름', ovRow?.status === 'approved' && ovRow.decidedBy === '직원C', ovRow);

// ── 귀국 항공편(학생) → 배차(직원)
await sb.sql(`insert into public.departure_flights (enrollment_id, student_no, depart_date, depart_time, flight, airport, needs_ride) values ($1, $2, (now() at time zone 'Asia/Manila')::date + 3, '10:30', 'PR 468', 'MANILA', true)`, [trC, sC], as(U.student));
x = await api('GET', '/api/departures', tC);
const dep = (x.body.registered ?? []).find((d) => d.stId === sC);
ok('귀국 일정에 항공편, 배차 요청', x.status === 200 && dep && dep.ride?.state === 'requested', dep ?? x.body);
x = await api('POST', `/api/departures/dep-${trC}/ride`, tC, { decision: 'confirmed', pickupDate: dep.date, pickupTime: '06:30', note: '정문' });
ok('배차 확정', x.status === 200, x);
const rdb = (await sb.sql(`select decision, pickup_time::text, decided_by::text from public.airport_rides where enrollment_id = $1`, [trC]))[0];
ok('DB: 배차·처리자', rdb?.decision === 'confirmed' && rdb.pickup_time.startsWith('06:30') && rdb.decided_by === U.staffC, rdb);
x = await api('GET', '/api/departures', tC);
const dep2 = (x.body.registered ?? []).find((d) => d.stId === sC);
ok('귀국 일정: 확정, 처리자 이름', dep2?.ride?.state === 'confirmed' && dep2.ride.record?.decidedBy === '직원C', dep2?.ride);

// ── 내부 공지와 읽음
x = await api('POST', '/api/notices', tC, { title: '점검 안내', content: '내일 오전 점검', campus: '', pinned: true, until: null });
ok('공지 작성', x.status === 201 && x.body.id, x);
const nId = x.body.id;
x = await api('GET', `/api/notices/${nId}`, tC);
ok('공지 열기(읽음: 직원C)', x.status === 200 && x.body.reads?.some((rr) => rr.name === '직원C') && x.body.author === '직원C', x.body);
x = await api('GET', `/api/notices/${nId}`, tP);
ok('다른 직원도 읽음(2명)', x.body.reads?.length === 2, x.body.reads);
x = await api('PUT', `/api/notices/${nId}`, tP, { title: '점검 안내(수정)', content: '내일 오후 점검', campus: '', pinned: false, until: null });
ok('공지 수정(수정자 직원P)', x.status === 200 && (await api('GET', `/api/notices/${nId}`, tC)).body.updatedBy === '직원P', x);

// ── 상담 기록: 같은 캠퍼스 직원만, 내용은 함수로, 열 때마다 기록
const today = (await sb.sql(`select (now() at time zone 'Asia/Manila')::date::text d`))[0].d;
x = await api('POST', '/api/counseling', tC, { stId: sC, date: today, title: '생활 상담', content: '룸메이트 문제', followUpDue: null });
ok('상담 작성(맡은 캠퍼스)', x.status === 201 && x.body.id, x);
const cId = x.body.id;
x = await api('POST', '/api/counseling', tC, { stId: sP, date: today, title: '다른 캠퍼스', content: 'x', followUpDue: null });
ok('맡지 않은 캠퍼스 학생은 작성 불가', x.status === 400 && x.body.error === 'campus_not_allowed', x);
x = await api('GET', '/api/counseling', tC);
ok('목록 1건, 내용 없음', x.body.rows?.length === 1 && !('content' in x.body.rows[0]) && x.body.rows[0].author === '직원C', x.body);
x = await api('GET', `/api/counseling/${cId}`, tC);
ok('상세에 내용, 접근 기록(작성·열람)', x.body.note?.content === '룸메이트 문제' && x.body.trail?.map((t) => t.action).sort().join() === 'create,view', x.body);
await api('GET', `/api/counseling/${cId}`, tC);
const views = await sb.sql(`select count(*)::int n from public.audit_logs where target_id = $1 and action = 'view'`, [cId]);
ok('10초 안에 다시 열면 열람 1건', views[0].n === 1, views);
x = await api('PUT', `/api/counseling/${cId}`, tC, { date: today, title: '생활 상담', content: '룸메이트 문제, 방 이동 검토', followUpDue: today });
ok('상담 수정(후속 조치 기한)', x.status === 200, x);
x = await api('POST', `/api/counseling/${cId}/followup`, tC, { done: true });
ok('후속 조치 완료', x.status === 200, x);
x = await api('GET', '/api/counseling', tC);
ok('목록: 후속 조치 완료자 이름', x.body.rows[0].followUpDone === true && x.body.rows[0].followUpDoneBy === '직원C', x.body.rows[0]);
x = await api('GET', '/api/audit', tC);
ok('접근 기록: 작성·열람·수정·완료, 기록자 직원C', x.body.rows?.map((l) => l.action).sort().join() === 'create,followup_done,update,view' && x.body.rows.every((l) => l.actor === '직원C'), x.body.rows);
x = await api('GET', '/api/counseling', tP);
ok('다른 캠퍼스 직원: 목록 0', x.body.rows?.length === 0, x.body);
x = await api('GET', `/api/counseling/${cId}`, tP);
ok('다른 캠퍼스 직원: 상세 404', x.status === 404, x);
x = await api('GET', '/api/audit', tP);
ok('다른 캠퍼스 직원: 접근 기록 0', x.body.rows?.length === 0, x.body);

// ── Student File
x = await api('GET', `/api/students/${sC}`, tC);
ok('Student File: 상담 제목·패널티·신청·항공편', x.status === 200 && x.body.counseling?.length === 1 && x.body.penalties?.length === 1 && x.body.absences?.length === 1 && x.body.departure?.flight === 'PR 468', {
  c: x.body.counseling?.length, p: x.body.penalties?.length, a: x.body.absences?.length, d: x.body.departure,
});
x = await api('GET', `/api/students/${sC}`, tP);
ok('다른 캠퍼스 직원의 Student File에는 상담 제목이 없음', x.status === 200 && x.body.counseling?.length === 0, x.body.counseling);

// ── 생활 요청: 학생이 낸 요청을 직원이 처리(처리자 = 로그인한 직원)
const lifeId = 'e0000000-0000-4000-8000-000000000001';
await sb.sql(`insert into public.nonacademic_requests (id, student_no, enrollment_id, category, content) values ($1, $2, $3, 'facility', '302호 에어컨 누수')`, [lifeId, sC, trC], as(U.student));
x = await api('GET', '/api/requests/life', tC);
ok('생활 요청 목록(접수 1, 이름·캠퍼스)', x.status === 200 && x.body.counts.received === 1 && x.body.rows[0]?.id === lifeId && x.body.rows[0].campus === 'Challenger', x.body);
ok('홈 요약 생활 요청 1', (await api('GET', '/api/summary', tC)).body.lifePending === 1);
x = await api('POST', `/api/requests/life/${lifeId}/handle`, tC, { status: 'rejected', reply: '' });
ok('반려는 사유 필수 400', x.status === 400 && x.body.error === 'reply_required', x);
x = await api('POST', `/api/requests/life/${lifeId}/handle`, tC, { status: 'in_progress', reply: '내일 오전 시설팀 방문' });
ok('처리 중(처리자 이름 직원C)', x.status === 200 && x.body.status === 'in_progress' && x.body.handledBy === '직원C', x);
x = await api('POST', `/api/requests/life/${lifeId}/handle`, tP, { status: 'done' });
ok('다른 직원이 완료', x.status === 200 && x.body.status === 'done' && x.body.handledBy === '직원P' && x.body.reply === '내일 오전 시설팀 방문', x);
const ldb2 = (await sb.sql(`select status, staff_reply, handled_by::text from public.nonacademic_requests where id = $1`, [lifeId]))[0];
ok('DB: 완료·답변·처리자(직원P 계정)', ldb2.status === 'done' && ldb2.staff_reply === '내일 오전 시설팀 방문' && ldb2.handled_by === U.staffP, ldb2);
x = await api('POST', `/api/requests/life/${lifeId}/handle`, tC, { status: 'rejected', reply: 'x' });
ok('끝난 요청 409', x.status === 409 && x.body.error === 'already_closed', x);
x = await api('GET', `/api/students/${sC}`, tC);
ok('Student File 에 생활 요청', x.body.lifeRequests?.length === 1 && x.body.lifeRequests[0].status === 'done', x.body.lifeRequests);
x = await api('GET', '/api/requests/life', tG);
ok('가드는 생활 요청 403', x.status === 403 && x.body.error === 'guard_forbidden', x);

// ── 가드 리포트 목록(가드가 등록)·본문 검사
await sb.sql(`insert into public.incident_reports (id, student_no, enrollment_id, campus, kind, note, occurred_at, reported_by) values ('0d000000-0000-4000-8000-000000000001', $1, $2, 'Challenger', 'alcohol', '음주 귀가', now(), '근무자1')`, [sC, trC], as(U.guard));
x = await api('GET', '/api/reports', tC);
ok('가드 리포트 목록', x.status === 200 && (x.body.rows ?? []).length === 1, x.body);
x = await api('POST', '/api/notices', tC, 'x'.repeat(33 * 1024));
ok('큰 본문 413', x.status === 413, x);
x = await api('POST', '/api/notices', tC, '{bad');
ok('잘못된 JSON 400', x.status === 400 && x.body.error === 'invalid_json', x);

// ── 가드 태블릿: 출입구(Challenger) 공용 계정
x = await api('GET', '/api/meta', tG);
ok('가드 meta: role guard, 출입구 Challenger', x.status === 200 && x.body.role === 'guard' && x.body.campus === 'Challenger', x);
for (const [m, path] of [['GET', '/api/students'], ['GET', '/api/penalties'], ['GET', '/api/counseling'], ['GET', '/api/settings'], ['PUT', '/api/settings']]) {
  x = await api(m, path, tG, m === 'PUT' ? { curfew: '01:00', guards: [] } : undefined);
  ok(`가드는 ${m} ${path} 403`, x.status === 403 && x.body.error === 'guard_forbidden', x);
}
x = await handleApi(new Request('https://intranet.example/api/guard', { headers: { Authorization: `Bearer ${tG}` } }), { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined });
ok('서비스 키가 없으면 가드 요청만 500', x.status === 500 && (await api('GET', '/api/meta', tC)).status === 200);
const others = rows.filter((s) => s.campus === 'Challenger' && s.stId !== sC).map((s) => s.stId);
const [sC2, sC3] = others;
const manila = (await sb.sql(`select (now() at time zone 'Asia/Manila')::date::text d`))[0].d;
const plus = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
// 승인된 외박(어제~모레, 언제 돌려도 오늘 밤을 덮음): 직원이 승인한 상태로 넣는다. 사유·메모는 가드에게 보이면 안 된다
await sb.sql(`insert into public.overnight_permissions (student_no, enrollment_id, leave_date, return_date, reason, status, staff_comment) values ($1, $2, $3, $4, '비밀 사유', 'approved', '비밀 메모')`, [sC3, await trOf(sC3), plus(manila, -1), plus(manila, 2)]);
x = await api('GET', '/api/guard?campus=Premium', tG);
ok('가드 화면: 캠퍼스는 계정 출입구로 고정, 근무자 목록', x.status === 200 && x.body.campus === 'Challenger' && x.body.campuses.join() === 'Challenger' && x.body.guards.join() === '근무자1,근무자2', x.body);
ok('오늘 밤 외박 허용 수(서비스 키로 읽은 승인 외박)', x.body.overnightTonight >= 1, x.body.overnightTonight);
x = await api('POST', '/api/guard/scan', tG, { code: sC2, mode: 'out', campus: 'Premium', guard: '근무자1' });
ok('외출 기록 201, 출입구는 계정 캠퍼스', x.status === 201 && x.body.row?.campus === 'Challenger', x);
let odb = await sb.sql(`select campus, out_by, in_at, recorded_by::text from public.outings where student_no = $1`, [sC2]);
ok('DB: 외출(기록한 계정 = 가드)', odb.length === 1 && odb[0].campus === 'Challenger' && odb[0].out_by === '근무자1' && odb[0].in_at === null && odb[0].recorded_by === U.guard, odb);
x = await api('POST', '/api/guard/scan', tG, { code: sC2, mode: 'out', guard: '근무자1' });
ok('이미 외출 중이면 409 already_out', x.status === 409 && x.body.error === 'already_out', x);
x = await api('POST', '/api/guard/scan', tG, { code: sC2, mode: 'in', guard: '근무자2' });
ok('귀가 200(같은 기록)', x.status === 200 && x.body.row?.inAt, x);
odb = await sb.sql(`select in_by, in_at from public.outings where student_no = $1`, [sC2]);
ok('DB: 귀가 찍힘', odb.length === 1 && odb[0].in_by === '근무자2' && odb[0].in_at, odb);
x = await api('POST', '/api/guard/scan', tG, { code: sC2, mode: 'in', guard: '' });
ok('근무자를 안 고르면 400', x.status === 400 && x.body.error === 'guard_required', x);
x = await api('POST', '/api/guard/scan', tG, { code: '99999999', mode: 'out', guard: '근무자1' });
ok('재학생이 아니면 404 not_current', x.status === 404 && x.body.error === 'not_current', x);
x = await api('POST', '/api/guard/scan', tG, { code: sC3, mode: 'out', guard: '근무자1' });
ok('승인된 외박 학생: 복귀일 표시, 사유·메모는 안 보임', x.status === 201 && x.body.row?.overnightUntil === plus(manila, 2) && !JSON.stringify(x.body).includes('비밀'), x.body);
x = await api('GET', '/api/guard', tG);
ok('가드 화면 외출 중 목록', (x.body.out ?? []).some((o) => o.stId === sC3) && !JSON.stringify(x.body).includes('비밀'), x.body.out);
x = await api('POST', '/api/guard/report', tG, { code: sC2, campus: 'Premium', guard: '근무자1', kind: 'violence', note: '다툼' });
ok('가드 리포트 등록', x.status === 201 || x.status === 200, x);
const rdb2 = await sb.sql(`select campus, recorded_by::text from public.incident_reports where student_no = $1`, [sC2]);
ok('DB: 리포트 출입구·기록 계정', rdb2.length === 1 && rdb2[0].campus === 'Challenger' && rdb2[0].recorded_by === U.guard, rdb2);
x = await api('GET', '/api/penalties?tab=pending', tC);
const gp = (x.body.rows ?? []).find((p) => p.stId === sC2 && p.source === 'guard');
ok('직원 패널티 목록에 가드 리포트 후보(대기)', gp && gp.status === 'pending' && gp.campus === 'Challenger', x.body.rows?.filter?.((p) => p.source === 'guard'));
x = await api('GET', '/api/outings', tC);
ok('직원 외출·귀가 목록에 가드 기록', x.status === 200 && JSON.stringify(x.body).includes(sC2), x.status);
// Premium 출입구 가드는 Challenger 기록을 못 본다
await sb.addUser({ id: '00000000-0000-4000-8000-0000000000d2', email: 'gate-p@guard.example', password: 'guardpass1' });
await sb.sql(`insert into public.guard_accounts values ('00000000-0000-4000-8000-0000000000d2', 'Premium', 'Premium 정문')`);
const tGP = await login('gate-p@guard.example', 'guardpass1');
x = await api('GET', '/api/guard', tGP);
ok('다른 출입구 가드: 캠퍼스 Premium, Challenger 외출 안 보임', x.body.campus === 'Premium' && !(x.body.out ?? []).some((o) => o.stId === sC3) && !(x.body.recent ?? []).some((o) => o.stId === sC2), x.body);
x = await api('POST', '/api/guard/scan', tGP, { code: sC3, mode: 'in', guard: '근무자1' });
const p3 = await sb.sql(`select campus, in_at from public.outings where student_no = $1 order by created_at`, [sC3]);
ok('다른 출입구에서 귀가를 찍으면 그 출입구의 새 기록(원래 외출 기록은 그대로)', x.status === 201 && p3.length === 2 && p3[0].campus === 'Challenger' && p3[0].in_at === null && p3[1].campus === 'Premium', p3);

// ── 학교 여행: 직원 등록·수정 → 학생 신청(함수) → 가드 화면 외박 허용 → 명단 제외(함수) → 취소
const tplus = (n) => plus(manila, n);
// 가드의 '오늘 밤'은 마닐라 05시(core NIGHT_CUTOFF_HOUR)까지 전날 밤이다. 00~05시에 돌리면 오늘 출발하는 여행은 아직 오늘 밤에 들지 않는다(CI가 UTC 16~21시에 돌 때)
const beforeCutoff = (await sb.sql(`select extract(hour from now() at time zone 'Asia/Manila')::int h`))[0].h < 5;
const fitT = await sb.sql(
  `select data->>'tr_st_id' st, id from public.legacy_enrollments where data->>'first_co_ca_code' = 'CHALLENGER' and left(data->>'tr_start_date', 10) <= $1 and left(data->>'tr_finish_date', 10) >= $2
     and coalesce(data->>'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청' and data->>'tr_st_id' not in ($3, $4, $5) order by 1 limit 1`,
  [manila, tplus(1), sC, sC2, sC3],
);
ok('오늘~내일 재학하는 Challenger 학생', fitT.length === 1, fitT);
const [{ st: sT, id: trT }] = fitT;
const U2 = '00000000-0000-4000-8000-0000000000a2';
await sb.addUser({ id: U2, email: 's2@students.example', password: 'studentpass1' });
await sb.sql(`insert into public.student_users (user_id, student_no, must_change_password) values ($1, $2, false)`, [U2, sT]);
const tripBody = { campus: 'Challenger', title: '라 우니온 1박', place: 'La Union', meeting: '정문 07:00', description: '왕복 밴', start: manila, end: tplus(1), deadline: manila, capacity: 10, cost: 1800 };
x = await api('POST', '/api/trips', tC, { ...tripBody, start: tplus(-1), deadline: tplus(-2) });
ok('지난 날짜 여행 400', x.status === 400 && x.body.error === 'start_in_past', x);
x = await api('POST', '/api/trips', tC, tripBody);
ok('여행 등록 201(올린 직원 = 로그인한 직원)', x.status === 201 && x.body.id, x);
const tripId = x.body.id;
let tdb2 = (await sb.sql(`select created_by_name, created_by::text, seats_taken from public.trips where id = $1`, [tripId]))[0];
ok('DB: 올린 직원 이름·계정', tdb2.created_by_name === '직원C' && tdb2.created_by === U.staffC && tdb2.seats_taken === 0, tdb2);
x = await api('GET', '/api/trips', tP);
const tl0 = (x.body.rows ?? []).find((t) => t.id === tripId);
ok('다른 직원도 여행 목록에서 봄(올린 직원 이름)', x.status === 200 && tl0?.createdBy === '직원C' && tl0.nights === 1 && tl0.accepting === true, tl0);
const g0 = (await api('GET', '/api/guard', tG)).body.overnightTonight;
const suT = (await sb.sql(`select public.trip_sign_up($1, $2) id`, [tripId, trT], as(U2)))[0].id;
x = await api('GET', `/api/trips/${tripId}`, tC);
ok('여행 상세: 명단 1(이름·캠퍼스), 신청 1', x.status === 200 && x.body.trip.taken === 1 && x.body.signups.length === 1 && x.body.signups[0].stId === sT && x.body.signups[0].name && x.body.signups[0].campus === 'Challenger', x.body);
x = await api('PUT', `/api/trips/${tripId}`, tC, { ...tripBody, title: '라 우니온 1박 (밴 2대)', capacity: 12 });
ok('여행 수정', x.status === 200 && x.body.title === '라 우니온 1박 (밴 2대)', x);
ok('DB: 수정됨', (await sb.sql(`select title, capacity from public.trips where id = $1`, [tripId]))[0].capacity === 12);
x = await api('GET', '/api/guard', tG);
ok('가드 화면: 여행 참가자만큼 오늘 밤 외박 허용이 늘어남', x.body.overnightTonight === g0 + (beforeCutoff ? 0 : 1), [g0, x.body.overnightTonight, beforeCutoff]);
x = await api('POST', '/api/guard/scan', tG, { code: sT, mode: 'out', guard: '근무자1' });
ok(
  '가드: 여행 참가자 외출에 외박 허용·여행 이름',
  x.status === 201 && (beforeCutoff ? x.body.row?.overnightTrip === null : x.body.row?.overnightUntil === tplus(1) && x.body.row.overnightTrip === '라 우니온 1박 (밴 2대)'),
  x.body,
);
x = await api('GET', '/api/trips', tG);
ok('가드는 여행 화면 403', x.status === 403 && x.body.error === 'guard_forbidden', x);
x = await api('POST', `/api/trips/signups/${suT}/remove`, tP, { reason: '' });
ok('명단 제외는 사유 필수 400', x.status === 400 && x.body.error === 'reason_required', x);
x = await api('POST', `/api/trips/signups/${suT}/remove`, tP, { reason: '출발 전 연락 없음' });
ok('명단 제외(함수), 처리자 이름 직원P', x.status === 200 && x.body.status === 'removed', x);
const sdb = (await sb.sql(`select s.status, s.removed_reason, s.handled_by::text, t.seats_taken from public.trip_signups s join public.trips t on t.id = s.trip_id where s.id = $1`, [suT]))[0];
ok('DB: 제외·사유·처리자, 신청 수 0', sdb.status === 'removed' && sdb.removed_reason === '출발 전 연락 없음' && sdb.handled_by === U.staffP && sdb.seats_taken === 0, sdb);
x = await api('GET', `/api/trips/${tripId}`, tC);
ok('명단에 제외 처리자 이름', x.body.signups[0].status === 'removed' && x.body.signups[0].handledBy === '직원P', x.body.signups);
x = await api('GET', '/api/guard', tG);
ok('명단에서 빠지면 가드 화면 외박 허용도 빠짐', x.body.overnightTonight === g0 && !JSON.stringify(x.body).includes('출발 전 연락 없음'), x.body.overnightTonight);
x = await api('GET', `/api/students/${sT}`, tC);
ok('Student File 에 학교 여행', x.body.trips?.length === 1 && x.body.trips[0].status === 'removed' && x.body.trips[0].trip.title === '라 우니온 1박 (밴 2대)', x.body.trips);
x = await api('POST', `/api/trips/${tripId}/status`, tC, { status: 'cancelled' });
ok('여행 취소', x.status === 200 && x.body.status === 'cancelled', x);
x = await api('PUT', `/api/trips/${tripId}`, tC, tripBody);
ok('취소한 여행 수정 409', x.status === 409 && x.body.error === 'trip_cancelled', x);
ok('홈 요약: 다가오는 여행 0', (await api('GET', '/api/summary', tC)).body.tripsUpcoming === 0);

await sb.close();
console.log(fails ? `${fails}건 실패` : '모두 통과');
process.exit(fails ? 1 : 0);
