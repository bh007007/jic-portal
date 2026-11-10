// 인트라넷 배포 서버(apps/intranet/worker)의 /api 시험. 실제 마이그레이션을 올린 PGlite(pg-supabase.mjs)에서
// 직원 두 명(Challenger·Premium 담당)으로: 설정·점수표 → 통금 위반 후보·승인 → 결석·외박 처리 → 배차 → 공지·읽음
// → 상담 기록(같은 캠퍼스만, 내용은 함수로, 접근 기록) → Student File, 그리고 가드 공용 계정(출입구 고정, 가드 API 만,
// 재학생 명단·승인된 외박은 서비스 키로 사유 없이), 학교 여행(등록·수정·명단 제외·취소, 참가자 외박 허용이 가드 화면에),
// 역할(오피스: 점수표 쓰기·접근 기록·가드 계정 막힘, 매니저: 허용한 경로만·무단결석 승인은 맡은 캠퍼스만),
// 끝으로 자동 확인(jic-intranet Worker 크론: 서비스 키로 화면과 같은 후보, 여러 번 돌려도 같음).
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
await build({ entryPoints: [`${REPO}apps/student/server/keycard.ts`], bundle: true, platform: 'node', format: 'esm', outfile: `${REPO}node_modules/.cache/keycard-test.mjs`, logLevel: 'warning' });
const { keycardCode } = await import(pathToFileURL(`${REPO}node_modules/.cache/keycard-test.mjs`).href);

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
// 11/10 결정 I16: 맡은 캠퍼스는 user_roles 한 곳. 직원C는 역할 없음 = 관리자(모든 캠퍼스), 직원P는 Premium 오피스.
// staff_campuses 는 더 쓰지 않는다(넣어 둬도 범위에 영향 없음).
await sb.sql(`insert into public.staff_campuses values ($1, 'Challenger'), ($2, 'Premium')`, [U.staffC, U.staffP]);
await sb.sql(`insert into public.user_roles (user_id, role, campus) values ($1, 'office', 'Premium')`, [U.staffP]);
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
ok('점수표 읽기(종류 6, 단계 3)', x.body.kinds?.length === 6 && x.body.stages?.length === 3, x);
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
// 진단서 사진(11/10 결정 I10): 다음 날도 병결이면 이틀 이어져 진단서 필요. 학생이 Storage 에 올리고 붙이면 직원이 본다
const absId2 = '0b000000-0000-4000-8000-000000000002';
await sb.sql(`insert into public.absence_requests (id, student_no, enrollment_id, absence_date, kind, reason) values ($1, $2, $3, current_date + 1, 'sick', '감기 계속')`, [absId2, sC, trC], as(U.student));
x = await api('GET', '/api/requests/absences?tab=pending', tC);
ok('병결 이틀 이어짐: 직원 목록에 진단서 필요·없음', (x.body.absences ?? []).filter((a) => [absId, absId2].includes(a.id)).every((a) => a.documentRequired && !a.hasDocument), x.body.absences);
const tStu = await login('s@students.example', 'studentpass1');
const docPath = `${sC}/${absId}.jpg`;
const upDoc = await fetch(`${sb.url}/storage/v1/object/absence-docs/${docPath}`, {
  method: 'POST',
  headers: { apikey: 'anon-key', Authorization: `Bearer ${tStu}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
  body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
});
await sb.sql(`select public.absence_attach_document($1, $2)`, [absId, docPath], as(U.student));
ok('학생이 진단서를 올리고 붙임', upDoc.status === 200 && (await sb.sql(`select document_path from public.absence_requests where id = $1`, [absId]))[0].document_path === docPath, upDoc.status);
x = await api('GET', `/api/requests/absences/${absId}/document`, tC);
ok('직원: 진단서 사진 보기(직원 토큰으로 Storage)', x.status === 200 && x.body.image === 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64'), x.status);
x = await api('GET', `/api/requests/absences/${absId2}/document`, tC);
ok('진단서가 없는 신청은 404', x.status === 404, x.status);
x = await api('GET', `/api/requests/absences/${absId}/document`, tG);
ok('가드는 진단서 못 봄', x.status === 403 && x.body.error === 'guard_forbidden', x);
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
// 공지 대상 역할(11/10 결정 I14): DB 에 남고, 대상 역할이 아닌 사람에게는 안 보인다(관리자는 모두)
x = await api('POST', '/api/notices', tC, { title: '매니저만', content: '수업 시간표 변경', roles: ['manager'] });
const nMgr = x.body.id;
ok('역할 대상 공지 작성, DB roles', x.status === 201 && (await sb.sql(`select roles from public.internal_notices where id = $1`, [nMgr]))[0]?.roles?.join() === 'manager', x);
x = await api('GET', '/api/notices', tP);
ok('오피스(직원P): 매니저 대상 공지는 목록에 없음', x.status === 200 && !x.body.rows.some((n) => n.id === nMgr), x.body.rows?.map((n) => n.title));
x = await api('GET', '/api/notices', tC);
ok('관리자(직원C): 매니저 대상 공지도 보임', x.body.rows.some((n) => n.id === nMgr && n.roles.join() === 'manager'), x.body.rows?.map((n) => n.title));

// ── 상담 기록: 맡은 캠퍼스만(관리자는 모든 캠퍼스, 오피스는 오피스 역할의 캠퍼스), 내용은 함수로, 열 때마다 기록
const today = (await sb.sql(`select (now() at time zone 'Asia/Manila')::date::text d`))[0].d;
x = await api('POST', '/api/counseling', tC, { stId: sC, date: today, title: '생활 상담', content: '룸메이트 문제', followUpDue: null });
ok('상담 작성(맡은 캠퍼스)', x.status === 201 && x.body.id, x);
const cId = x.body.id;
x = await api('POST', '/api/counseling', tP, { stId: sC, date: today, title: '다른 캠퍼스', content: 'x', followUpDue: null });
ok('오피스(Premium): 맡지 않은 캠퍼스 학생은 작성 불가', x.status === 400 && x.body.error === 'campus_not_allowed', x);
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
ok('오피스(Premium): Challenger 상담은 목록 0', x.body.rows?.length === 0, x.body);
x = await api('GET', `/api/counseling/${cId}`, tP);
ok('오피스(Premium): Challenger 상담 상세 404', x.status === 404, x);
x = await api('GET', '/api/audit', tP);
ok('오피스: 접근 기록 403', x.status === 403 && x.body.error === 'admin_only', x);
x = await api('POST', '/api/counseling', tC, { stId: sP, date: today, title: 'Premium 학생 상담', content: '관리자 작성', followUpDue: null });
const cPId = x.body.id;
ok('관리자: staff_campuses 와 상관없이 다른 캠퍼스 학생도 작성(I16)', x.status === 201 && !!cPId, x);
x = await api('GET', '/api/counseling', tP);
ok('오피스(Premium): Premium 상담만 보임', x.body.rows?.length === 1 && x.body.rows[0].id === cPId, x.body.rows);

// ── Student File
x = await api('GET', `/api/students/${sC}`, tC);
ok('Student File: 상담 제목·패널티·신청(결석 2: 진단서 시험 포함)·항공편', x.status === 200 && x.body.counseling?.length === 1 && x.body.penalties?.length === 1 && x.body.absences?.length === 2 && x.body.departure?.flight === 'PR 468', {
  c: x.body.counseling?.length, p: x.body.penalties?.length, a: x.body.absences?.length, d: x.body.departure,
});
x = await api('GET', `/api/students/${sC}`, tP);
ok('오피스(Premium): Challenger 학생 Student File 403', x.status === 403 && x.body.error === 'campus_forbidden', x);
x = await api('GET', `/api/students/${sP}`, tP);
ok('오피스(Premium): 맡은 캠퍼스 학생 Student File 에는 그 상담 제목', x.status === 200 && x.body.counseling?.length === 1, x.body.counseling);

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
ok('직원 패널티 목록에 가드 리포트 후보(대기, 폭력 리포트 → 폭력)', gp && gp.status === 'pending' && gp.campus === 'Challenger' && gp.kind === 'violence' && gp.kindName === '폭력', x.body.rows?.filter?.((p) => p.source === 'guard'));
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

// ── 카드키 QR: 학생 앱과 같은 비밀 값(DB, 서비스 키)으로 만든 QR 을 가드가 읽는다
const kSecret = (await sb.sql(`select secret from public.keycard_secret where id = 1`))[0].secret;
const sQ = others.find((s) => s !== sC2 && s !== sC3);
x = await api('POST', '/api/guard/scan', tG, { code: (await keycardCode(kSecret, sQ, Date.now())).code, mode: 'out', guard: '근무자1' });
ok('가드: 카드키 QR 로 외출 201(찍은 방법 qr)', x.status === 201 && x.body.row?.stId === sQ && x.body.row.outVia === 'qr', x);
const qdb = await sb.sql(`select out_via from public.outings where student_no = $1`, [sQ]);
ok('DB: out_via = qr', qdb.length === 1 && qdb[0].out_via === 'qr', qdb);
x = await api('POST', '/api/guard/scan', tG, { code: (await keycardCode('z'.repeat(64), sQ, Date.now())).code, mode: 'in', guard: '근무자1' });
ok('가드: 서명이 틀린 QR 400 invalid_qr', x.status === 400 && x.body.error === 'invalid_qr', x);
x = await api('POST', '/api/guard/scan', tG, { code: sQ, mode: 'in', guard: '근무자1' });
ok('가드: 번호 입력 귀가(in_via number)', x.status === 200 && x.body.row.inVia === 'number', x);

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

// ── 학생 계정 관리: 직원이 계정을 만들고(서비스 키, 8명씩) 비밀번호를 생년월일로 되돌린다. 접근 기록에 남는다
x = await api('GET', '/api/accounts', tC);
ok('학생 계정 목록(배포): 대상·상태', x.status === 200 && x.body.available === true && x.body.rows.length > 0 && x.body.counts.none > 0, x.body.counts ?? x);
const before = x.body.counts;
let made = 0;
for (let i = 0; i < 40; i++) {
  const c = await api('POST', '/api/accounts/create', tC, {});
  if (c.status !== 200) {
    ok('계정 만들기', false, c);
    break;
  }
  made += c.body.linked;
  if (!c.body.remaining) break;
}
x = await api('GET', '/api/accounts', tC);
ok('계정 없는 학생이 모두 계정을 받음(첫 비밀번호 변경 전)', x.body.counts.none === 0 && made === before.none && x.body.counts.pending >= before.none, { before, after: x.body.counts, made });
const stR = x.body.rows.find((r) => r.status === 'pending').stId;
const birth = (await sb.sql(`select data->>'st_birthday' b from public.legacy_students where id = $1`, [stR]))[0].b.replace(/-/g, '');
let lr = await (await fetch(`${sb.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${stR}@students.jic.internal`, password: birth }) })).json();
ok('만든 계정으로 학생번호 + 생년월일 로그인', !!lr.access_token, lr);
await fetch(`${sb.url}/auth/v1/user`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lr.access_token}` }, body: JSON.stringify({ password: 'changed1234' }) });
x = await api('POST', `/api/accounts/${stR}/reset`, tP, {});
ok('다른 직원이 비밀번호 초기화', x.status === 200 && x.body.status === 'pending', x);
lr = await (await fetch(`${sb.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${stR}@students.jic.internal`, password: birth }) })).json();
ok('초기화 뒤 다시 생년월일로 로그인, 변경 강제', !!lr.access_token && (await sb.sql(`select must_change_password m from public.student_users where student_no = $1`, [stR]))[0].m === true, lr);
const aud = await sb.sql(`select action, actor_id::text, count(*)::int n from public.audit_logs where target = 'student_account' group by 1, 2 order by 1`);
ok('접근 기록: 만들기(직원C)·초기화(직원P)', aud.some((a) => a.action === 'account_create' && a.actor_id === U.staffC && a.n === made) && aud.some((a) => a.action === 'password_reset' && a.actor_id === U.staffP && a.n === 1), aud);
x = await api('GET', '/api/accounts', tG);
ok('가드는 학생 계정 403', x.status === 403 && x.body.error === 'guard_forbidden', x);
x = await handleApi(new Request('https://intranet.example/api/accounts', { headers: { Authorization: `Bearer ${tC}` } }), { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined });
ok('서비스 키가 없으면 안내(server_config)', (await x.json()).reason === 'server_config');

// ── 가드 계정 관리: 직원이 만든 계정으로 가드가 로그인 → 비밀번호 변경 → 지우기(서비스 키, 접근 기록)
const gEmail = 'gate-premium@guard.example';
x = await api('POST', '/api/guard-accounts', tC, { label: 'Premium 후문', campus: 'Premium', email: gEmail, password: 'gate2026', confirm: 'gate2026' });
ok('직원: 가드 계정 만들기 201', x.status === 201 && x.body.userId, x);
const gUser = x.body.userId;
const gRow = (await sb.sql(`select campus, label from public.guard_accounts where user_id = $1`, [gUser]))[0];
ok('DB: guard_accounts 연결(캠퍼스·출입구)', gRow?.campus === 'Premium' && gRow.label === 'Premium 후문', gRow);
let tNew = await login(gEmail, 'gate2026');
x = await api('GET', '/api/guard', tNew);
ok('만든 계정으로 가드 태블릿(Premium 고정)', x.status === 200 && x.body.campus === 'Premium', x.body?.campus ?? x);
x = await api('GET', '/api/guard-accounts', tC);
ok('목록: 마지막 로그인 보임', x.body.rows?.some((g) => g.userId === gUser && g.lastSignIn), x.body.rows);
x = await api('GET', '/api/guard-accounts', tNew);
ok('가드는 가드 계정 화면 403', x.status === 403 && x.body.error === 'guard_forbidden', x);
x = await api('POST', `/api/guard-accounts/${gUser}/password`, tP, { password: 'gate2027b', confirm: 'gate2027b' });
ok('오피스는 가드 비밀번호 못 바꿈(I4)', x.status === 403 && x.body.error === 'admin_only', x);
x = await api('POST', `/api/guard-accounts/${gUser}/password`, tC, { password: 'gate2027b', confirm: 'gate2027b' });
ok('관리자가 비밀번호 바꾸기', x.status === 200, x);
ok('옛 비밀번호로는 로그인 안 됨, 새 비밀번호는 됨', !(await login(gEmail, 'gate2026')) && !!(await login(gEmail, 'gate2027b')));
x = await api('POST', `/api/guard-accounts/${U.staffC}/password`, tC, { password: 'hack12345', confirm: 'hack12345' });
ok('직원 계정 id 로는 비밀번호를 못 바꿈(404)', x.status === 404, x);
x = await api('POST', `/api/guard-accounts/${gUser}/delete`, tC, {});
ok('가드 계정 지우기', x.status === 200, x);
ok('지운 뒤 로그인 안 됨, 연결도 없음', !(await login(gEmail, 'gate2027b')) && (await sb.sql(`select count(*)::int n from public.guard_accounts where user_id = $1`, [gUser]))[0].n === 0);
const gaud = await sb.sql(`select action, actor_id::text from public.audit_logs where target = 'guard_account' order by id`);
ok('접근 기록: 만들기·비밀번호·지우기(모두 관리자 직원C, 오피스 시도는 남지 않음)', gaud.map((a) => a.action).join() === 'guard_create,guard_password,guard_delete' && gaud.every((a) => a.actor_id === U.staffC), gaud);

// ── 무단결석: 강사 포털 출석(서비스 키로 넣음)에서 마감된 날의 결석 → 직원 패널티 후보 → 사유 인정하면 지워짐
const sAb = others[2] ?? sP;
const yday = plus(manila, -1);
const sess = (await sb.sql(`insert into public.class_sessions (day, start_time, campus, subject) values ($1, '08:00', 'Challenger', 'Grammar') returning id::text`, [yday]))[0].id;
await sb.sql(`insert into public.attendance (session_id, student_no, result) values ($1, $2, 'AB')`, [sess, sAb]);
const absenceRows = async () => ((await api('GET', '/api/penalties?tab=pending', tC)).body.rows ?? []).filter((p) => p.source === 'attendance');
ok('마감 전에는 무단결석 후보 없음', (await absenceRows()).length === 0);
await sb.sql(`insert into public.attendance_closings (day, campus) values ($1, 'Challenger')`, [yday]);
let abr = await absenceRows();
ok('출석 마감 → 무단결석 후보(학생·날짜, 근거, 캠퍼스)', abr.length === 1 && abr[0].id === `absence-${sAb}-${yday}` && abr[0].kind === 'absence' && abr[0].date === yday && abr[0].basis === '수업 결석 1회(08:00 Grammar)' && abr[0].campus === 'Challenger', abr);
ok('여러 번 열어도 한 건', (await absenceRows()).length === 1 && (await sb.sql(`select count(*)::int n from public.penalties where source = 'attendance'`))[0].n === 1);
x = await api('GET', '/api/guard', tG);
ok('가드 화면은 그대로(가드는 결석을 읽지 않음)', x.status === 200);
await sb.sql(`update public.attendance set excused = true where session_id = $1`, [sess]);
ok('사유 인정 → 대기 후보 지워짐', (await absenceRows()).length === 0 && (await sb.sql(`select count(*)::int n from public.penalties where source = 'attendance'`))[0].n === 0);

// ── 직원 역할(docs/roles.md): 오피스(Challenger)는 점수표 저장·접근 기록 403, Student File 은 맡은 캠퍼스만. 역할 없는 직원은 관리자
const officeId = '00000000-0000-4000-8000-0000000000c3';
await sb.addUser({ id: officeId, email: 'o@staff.example', password: 'staffpass1' });
await sb.sql(`insert into public.staff_users (user_id, name) values ($1, '오피스O')`, [officeId]);
await sb.sql(`insert into public.user_roles (user_id, role, campus) values ($1, 'office', 'Challenger')`, [officeId]);
const tO = await login('o@staff.example', 'staffpass1');
x = await api('GET', '/api/meta', tO);
ok('오피스: meta 에 역할·맡은 캠퍼스', x.status === 200 && x.body.staffRole === 'office' && x.body.campuses?.join() === 'Challenger', x.body);
x = await api('GET', '/api/meta', tC);
ok('역할 없는 직원은 관리자(모든 캠퍼스)', x.body.staffRole === 'admin' && x.body.campuses === null, x.body);
const rulesO = (await api('GET', '/api/penalty-rules', tO)).body;
ok('오피스: 점수표 읽기(종류 6개: 무단결석·통금·음주·폭력·무단외출·기타)', Array.isArray(rulesO.kinds) && rulesO.kinds.map((k) => k.code).join() === 'absence,curfew,alcohol,violence,unauthorized,other', rulesO);
x = await api('PUT', '/api/penalty-rules', tO, rulesO);
ok('오피스: 점수표 저장 403 admin_only', x.status === 403 && x.body.error === 'admin_only', x);
const direct = await fetch(`${sb.url}/rest/v1/penalty_rules?code=eq.curfew`, {
  method: 'PATCH',
  headers: { apikey: 'anon-key', Authorization: `Bearer ${tO}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ score: 99 }),
});
ok('오피스: 화면을 거치지 않고 REST 로 고쳐도 DB 가 막음', (await direct.json()).length === 0 && (await sb.sql(`select score from public.penalty_rules where code = 'curfew'`))[0].score !== 99);
x = await api('GET', '/api/audit', tO);
ok('오피스: 접근 기록 403', x.status === 403 && x.body.error === 'admin_only', x);
x = await api('GET', '/api/audit', tC);
ok('관리자: 접근 기록 200', x.status === 200, x.status);
x = await api('GET', '/api/students?size=200', tO);
ok('오피스: Student File 은 Challenger 만', x.status === 200 && x.body.rows.length > 0 && x.body.rows.every((s) => s.campus === 'Challenger'), x.body.campuses);
x = await api('GET', `/api/students/${sP}`, tO);
ok('오피스: 다른 캠퍼스 학생 상세 403', x.status === 403 && x.body.error === 'campus_forbidden', x);
x = await api('GET', `/api/students/${sC}`, tO);
ok('오피스: 맡은 캠퍼스 학생 상세 200', x.status === 200, x.status);
x = await api('GET', '/api/penalties?tab=pending', tO);
ok('오피스: 패널티 승인 목록은 그대로', x.status === 200, x.status);
x = await api('GET', '/api/guard-accounts', tO);
ok('오피스: 가드 계정 403 admin_only(I4)', x.status === 403 && x.body.error === 'admin_only', x);
x = await api('POST', `/api/guard-accounts/${officeId}/password`, tO, { password: 'hack12345', confirm: 'hack12345' });
ok('오피스: 가드 비밀번호 바꾸기 403(I4)', x.status === 403 && x.body.error === 'admin_only', x);
x = await api('GET', '/api/accounts', tO);
ok('오피스: 학생 계정은 그대로(I4)', x.status === 200, x);

// ── 강사 포털 매니저(user_roles manager, 직원 아님): 인트라넷 일부만. 업체 원본은 서버가 서비스 키로, 쓰기는 매니저 토큰(RLS)
const mgrId = '00000000-0000-4000-8000-0000000000b1';
await sb.addUser({ id: mgrId, email: 'm@teacher.example', password: 'managerpass1' });
await sb.sql(`insert into public.user_roles (user_id, role, campus) values ($1, 'manager', '')`, [mgrId]);
await sb.sql(`insert into public.staff (user_id, name) values ($1, '매니저M')`, [mgrId]);
const tM = await login('m@teacher.example', 'managerpass1');
x = await api('GET', '/api/meta', tM);
ok('매니저: meta 역할·이름(강사 목록)', x.status === 200 && x.body.role === 'manager' && x.body.actor === '매니저M' && x.body.staffRole === null && x.body.campuses === null, x.body);
const noKey = await handleApi(new Request('https://intranet.example/api/meta', { headers: { Authorization: `Bearer ${tM}` } }), { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined });
ok('매니저: 서비스 키가 없으면 500 server_config', noKey.status === 500);
for (const [m, path] of [['GET', '/api/requests/overnights'], ['GET', '/api/departures'], ['PUT', '/api/settings'], ['GET', '/api/audit'], ['GET', '/api/accounts']]) {
  x = await api(m, path, tM, m === 'PUT' ? { curfew: '23:00', guards: [] } : undefined);
  ok(`매니저 막힘: ${m} ${path}`, x.status === 403 && x.body.error === 'manager_forbidden', x);
}
x = await api('GET', '/api/students?size=200', tM);
ok('매니저: Student File 목록(서비스 키로 읽음)', x.status === 200 && x.body.rows.length > 0, x.status);
// 무단결석: 매니저가 화면을 열면 후보를 만들고(매니저 토큰, RLS), 승인한다
const sAb2 = others[3] ?? sP;
const d2 = plus(manila, -2);
const sess2 = (await sb.sql(`insert into public.class_sessions (day, start_time, campus, subject) values ($1, '09:00', 'Challenger', 'Reading') returning id::text`, [d2]))[0].id;
await sb.sql(`insert into public.attendance (session_id, student_no, result) values ($1, $2, 'AB')`, [sess2, sAb2]);
await sb.sql(`insert into public.attendance_closings (day, campus) values ($1, 'Challenger') on conflict do nothing`, [d2]);
x = await api('GET', '/api/penalties?tab=pending', tM);
const mAb = (x.body.rows ?? []).find((p) => p.source === 'attendance' && p.stId === sAb2);
ok('매니저: 화면을 열면 무단결석 후보가 생기고 승인할 수 있음', x.status === 200 && mAb?.canDecide === true && mAb.basis === '수업 결석 1회(09:00 Reading)', x.body.rows?.map((p) => [p.source, p.stId, p.canDecide]));
x = await api('POST', '/api/penalties/decide', tM, { ids: [mAb.id], approve: true });
const mAbDb = (await sb.sql(`select status, decided_by::text from public.penalties where id = $1`, [mAb.id]))[0];
ok('매니저: 무단결석 승인(처리자 = 매니저)', x.status === 200 && x.body.done === 1 && mAbDb.status === 'approved' && mAbDb.decided_by === mgrId, [x.body, mAbDb]);
await sb.sql(`insert into public.penalties (id, student_no, kind, occurred_on, campus, basis, source, source_id) values ('curfew-mgr', $1, 'curfew', $2, 'Challenger', '통금', 'outing', 'mgr') on conflict do nothing`, [sAb2, d2]);
x = await api('POST', '/api/penalties/decide', tM, { ids: ['curfew-mgr'], approve: true });
ok('매니저: 통금 위반 승인 403', x.status === 403 && x.body.error === 'manager_absence_only' && (await sb.sql(`select status from public.penalties where id = 'curfew-mgr'`))[0].status === 'pending', x);
// I5: Premium 만 맡은 매니저는 Challenger 무단결석을 보기만 한다(서버 403, REST 로 고쳐도 DB 가 막음)
const mgrPId = '00000000-0000-4000-8000-0000000000b2';
await sb.addUser({ id: mgrPId, email: 'mp@teacher.example', password: 'managerpass2' });
await sb.sql(`insert into public.user_roles (user_id, role, campus) values ($1, 'manager', 'Premium')`, [mgrPId]);
await sb.sql(`insert into public.staff (user_id, name) values ($1, '매니저P')`, [mgrPId]);
const tMP = await login('mp@teacher.example', 'managerpass2');
const sFar = others[5] ?? others[1];
await sb.sql(`insert into public.attendance (session_id, student_no, result) values ($1, $2, 'AB')`, [sess2, sFar]);
x = await api('GET', '/api/penalties?tab=pending', tMP);
const far = (x.body.rows ?? []).find((p) => p.source === 'attendance' && p.stId === sFar);
ok('매니저(Premium): Challenger 무단결석 후보는 보이지만 승인 불가 표시', x.status === 200 && far?.campus === 'Challenger' && far.canDecide === false, far);
x = await api('POST', '/api/penalties/decide', tMP, { ids: [far.id], approve: true });
ok('매니저(Premium): Challenger 무단결석 승인 403 campus_forbidden', x.status === 403 && x.body.error === 'campus_forbidden', x);
const farPatch = await fetch(`${sb.url}/rest/v1/penalties?id=eq.${far.id}`, {
  method: 'PATCH',
  headers: { apikey: 'anon-key', Authorization: `Bearer ${tMP}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ status: 'approved' }),
});
ok('매니저(Premium): REST 로 고쳐도 DB 가 막음', (await farPatch.json()).length === 0 && (await sb.sql(`select status from public.penalties where id = $1`, [far.id]))[0].status === 'pending');
x = await api('POST', '/api/penalties/decide', tM, { ids: [far.id], approve: false, note: '확인' });
ok('매니저(모든 캠퍼스): 같은 건 반려', x.status === 200 && x.body.done === 1, x);
const absM = (await sb.sql(`insert into public.absence_requests (student_no, enrollment_id, absence_date, kind, reason) values ($1, $2, $3, 'sick', '감기') returning id::text`, [sAb2, await trOf(sAb2), manila]))[0].id;
x = await api('POST', '/api/requests/absences/decide', tM, { ids: [absM], approve: true, comment: '확인' });
x = await api('GET', `/api/requests/absences/${absId}/document`, tM);
ok('매니저: 진단서 사진 보기(결석 신청 처리, 매니저 토큰으로 Storage)', x.status === 200 && x.body.image?.startsWith('data:image/jpeg;base64,'), x.status);
ok('매니저: 결석 신청 승인(처리자 = 매니저)', x.status === 200 && (await sb.sql(`select decided_by::text from public.absence_requests where id = $1`, [absM]))[0].decided_by === mgrId, x);
x = await api('POST', '/api/notices', tM, { title: '매니저 공지', content: '수업 시간 변경' });
ok('매니저: 공지 쓰기(작성자 = 매니저)', x.status === 201 && (await sb.sql(`select author_id::text, author_name from public.internal_notices where id = $1`, [x.body.id]))[0]?.author_id === mgrId, x);

// 상담 기록: 매니저 역할의 캠퍼스(빈칸 = 모든 캠퍼스). 작성자·접근 기록 이름은 강사 목록 이름
x = await api('POST', '/api/counseling', tM, { stId: sAb2, date: manila, title: '수업 태도 상담', content: '매니저 상담 내용' });
const mCn = x.body.id;
ok('매니저: 상담 기록 작성', x.status === 201 && !!mCn, x);
x = await api('GET', `/api/counseling/${mCn}`, tM);
ok('매니저: 상담 열람(내용, 작성자 = 매니저 이름)', x.status === 200 && x.body.note?.content === '매니저 상담 내용' && x.body.note?.author === '매니저M', x.body);
const mAud = await sb.sql(`select action, actor_id::text, actor_name from public.audit_logs where target_id = $1 order by id`, [mCn]);
ok('매니저 상담 접근 기록(작성·열람)', mAud.map((a) => a.action).join() === 'create,view' && mAud.every((a) => a.actor_id === mgrId && a.actor_name === '매니저M'), mAud);
x = await api('GET', '/api/counseling', tC);
ok('직원C(Challenger): 매니저가 쓴 Challenger 상담이 목록에 보임', x.body.rows?.some((r) => r.id === mCn), x.body.rows?.length);

// ── Student File '수업 출석': 강사 포털 출석(lms_student_attendance)을 직원·매니저가 지난 30일 합계로 본다
const attSt = others[4] ?? sP;
const attSess = (await sb.sql(`insert into public.class_sessions (day, start_time, campus, subject) values ($1, '11:00', 'Challenger', 'Listening'), ($1, '14:00', 'Challenger', 'Writing') returning id::text`, [manila])).map((r) => r.id);
await sb.sql(`insert into public.attendance (session_id, student_no, result, late_min) values ($1, $3, 'AB', null), ($2, $3, 'TA', 5)`, [attSess[0], attSess[1], attSt]);
x = await api('GET', `/api/students/${attSt}`, tC);
ok('직원: Student File 수업 출석(결석 무단 1·지각 5분)', x.status === 200 && x.body.attendance?.counts.absent === 1 && x.body.attendance.counts.unexcused === 1 && x.body.attendance.counts.late === 1 && x.body.attendance.counts.lateMin === 5 && x.body.attendance.rows.length === 2, x.body.attendance);
x = await api('GET', `/api/students/${attSt}`, tM);
ok('매니저: Student File 수업 출석도 보임', x.status === 200 && x.body.attendance?.counts.sessions === 2, x.body.attendance);

// ── 자동 확인(jic-intranet Worker 크론, apps/intranet/worker/cron.ts, 11/9 결정 I3): 서비스 키로 화면과 같은 후보를 만든다
const cronOut = `${REPO}node_modules/.cache/intranet-cron.mjs`;
await build({ entryPoints: [`${REPO}apps/intranet/worker/cron.ts`], bundle: true, platform: 'node', format: 'esm', outfile: cronOut, logLevel: 'warning' });
const { runChecks, default: cronWorker } = await import(pathToFileURL(cronOut).href);
const cronEnv = { SUPABASE_URL: sb.url, SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const pendingAuto = async () =>
  (await sb.sql(`select id, basis, campus from public.penalties where status = 'pending' and source in ('outing', 'attendance') order by id`)).map((r) => `${r.id}|${r.basis}|${r.campus}`).join('\n');
// 직원 화면이 만든 무단결석 후보(대기)가 있는 상태에서 돌린다. 서비스 키에 빈 결과를 주는 함수를 쓰면 이 후보를 지운다
const sScreen = others[7] ?? others[1];
const dScreen = plus(manila, -4);
const sessScreen = (await sb.sql(`insert into public.class_sessions (day, start_time, campus, subject) values ($1, '13:00', 'Challenger', 'Speaking') returning id::text`, [dScreen]))[0].id;
await sb.sql(`insert into public.attendance (session_id, student_no, result) values ($1, $2, 'AB')`, [sessScreen, sScreen]);
await sb.sql(`insert into public.attendance_closings (day, campus) values ($1, 'Challenger') on conflict do nothing`, [dScreen]);
await api('GET', '/api/penalties?tab=pending', tC);
const screenSnap = await pendingAuto();
let cr = await runChecks(cronEnv);
ok('자동 확인: 화면이 만든 대기 후보를 지우거나 바꾸지 않음(서비스 키 출석 함수)', screenSnap.includes(`absence-${sScreen}-${dScreen}|`) && (await pendingAuto()) === screenSnap, [cr, screenSnap.split('\n').length]);
// 화면을 열지 않은 새 통금 위반(새벽 2시 귀가)과 마감된 날의 결석
const sCron = others[6] ?? others[0];
const dCron = plus(manila, -3);
const outCron = (await sb.sql(
  `insert into public.outings (student_no, enrollment_id, campus, out_at, out_by, in_at, in_by) values ($1, $2, 'Challenger', ($3 || ' 20:00+08')::timestamptz, '근무자1', ($4 || ' 02:00+08')::timestamptz, '근무자2') returning id::text`,
  [sCron, await trOf(sCron), dCron, plus(dCron, 1)],
))[0].id;
const sessCron = (await sb.sql(`insert into public.class_sessions (day, start_time, campus, subject) values ($1, '10:00', 'Challenger', 'Grammar') returning id::text`, [dCron]))[0].id;
await sb.sql(`insert into public.attendance (session_id, student_no, result) values ($1, $2, 'AB')`, [sessCron, sCron]);
await sb.sql(`insert into public.attendance_closings (day, campus) values ($1, 'Challenger') on conflict do nothing`, [dCron]);
cr = await runChecks(cronEnv);
const cronRows = await sb.sql(`select id, kind, source, status, decided_by from public.penalties where id in ($1, $2)`, [`curfew-${outCron}`, `absence-${sCron}-${dCron}`]);
ok('자동 확인: 화면을 열지 않아도 통금 위반·무단결석 후보가 생김(대기, 처리자 없음)', cronRows.length === 2 && cronRows.every((r) => r.status === 'pending' && r.decided_by === null), cronRows);
const counts = await sb.sql(`select source, count(*)::int n from public.penalties where status = 'pending' group by source`);
const nOf = (src) => counts.find((c) => c.source === src)?.n ?? 0;
ok('자동 확인: 돌려준 수 = 대기 중 자동 후보 수', cr.curfew === nOf('outing') && cr.absence === nOf('attendance'), [cr, counts]);
const cronSnap = await pendingAuto();
ok('자동 확인: 여러 번 돌려도 같은 결과', JSON.stringify(await runChecks(cronEnv)) === JSON.stringify(cr) && (await pendingAuto()) === cronSnap);
await api('GET', '/api/penalties?tab=pending', tC);
ok('자동 확인 뒤 직원 화면을 열어도 같은 후보', (await pendingAuto()) === cronSnap);
let cronErr = '';
await runChecks({ SUPABASE_URL: sb.url }).catch((e) => (cronErr = e.message));
ok('자동 확인: 서비스 키가 없으면 오류(아무것도 바꾸지 않음)', cronErr.startsWith('server_config') && (await pendingAuto()) === cronSnap, cronErr);
const svcFn = await fetch(`${sb.url}/rest/v1/rpc/intranet_absence_marks_service`, {
  method: 'POST',
  headers: { apikey: 'anon-key', Authorization: `Bearer ${tC}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_from: plus(manila, -30), p_to: manila }),
});
ok('서비스 키 전용 출석 함수: 직원 토큰은 403', svcFn.status === 403, svcFn.status);
const cronPage = await cronWorker.fetch(new Request('https://jic-intranet.example/api/meta'));
ok('jic-intranet Worker 주소는 화면·API 없이 안내만(404)', cronPage.status === 404 && (await cronPage.text()).includes('/intranet'));

await sb.close();
console.log(fails ? `${fails}건 실패` : '모두 통과');
process.exit(fails ? 1 : 0);
