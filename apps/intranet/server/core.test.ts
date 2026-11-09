/**
 * 인트라넷 core 시험: 가짜 시계와 메모리 저장소로 통금 판정·패널티 흐름을 확인한다.
 * 실행: npm --workspace apps/intranet run test (빌드할 때도 함께 돈다). 샘플 데이터(data-sample)만 쓴다.
 */
import path from 'node:path';
import { loadDir } from '../../admin/server/localData';
import type { Departure, Ride } from '../../student/server/departures';
import { newLifeRequest, type LifeRequest } from '../../student/server/lifeRequests';
import type { Absence, Overnight, RequestStore } from '../../student/server/requests';
import { memoryTripStore, signUp } from '../../student/server/trips';
import { KEYCARD_PERIOD, keycardCode } from '../../student/server/keycard';
import { AccountAdminError, type AccountAdmin, type LinkedAccount } from '../../student/server/accountAdmin';
import type { GuardAccount, GuardAdmin } from './guardAccounts';
import { handleIntranetApi, scheduledChecks, type AbsenceMark, type AttendanceRow, type Stores } from './core';

function memRepo<T extends { id: string }>() {
  const m = new Map<string, T>();
  return {
    async all() {
      return [...m.values()].map((x) => ({ ...x }));
    },
    async put(x: T) {
      m.set(x.id, { ...x });
    },
    async remove(id: string) {
      m.delete(id);
    },
  };
}
function memReq<T extends { id: string; stId: string }>(): RequestStore<T> {
  const m = new Map<string, T>();
  return {
    async listAll() {
      return [...m.values()].map((x) => ({ ...x }));
    },
    async listByStudent(stId) {
      return [...m.values()].filter((x) => x.stId === stId);
    },
    async get(id) {
      return m.has(id) ? { ...m.get(id)! } : null;
    },
    async put(x) {
      m.set(x.id, { ...x });
    },
  };
}
function memDoc<T>() {
  let v: T | null = null;
  return {
    async get() {
      return v;
    },
    async set(x: T) {
      v = x;
    },
  };
}

const db = loadDir(path.resolve(process.cwd(), '../../data-sample/tables'));
const stores: Stores = {
  outings: memRepo(),
  penalties: memRepo(),
  settings: memDoc(),
  rules: memDoc(),
  absences: memReq<Absence>(),
  overnights: memReq<Overnight>(),
  counseling: memRepo(),
  audit: memRepo(),
  notices: memRepo(),
  noticeReads: memRepo(),
  reports: memRepo(),
  departures: memReq<Departure>(),
  rides: memReq<Ride>(),
  lifeRequests: memReq<LifeRequest>(),
  trips: memoryTripStore(),
};
let clock = Date.parse('2026-11-05T19:02:00+08:00');
let n = 0;
let actor: string | null = null;
const KSECRET = 'k'.repeat(64);
const ctx = { db, stores, keycardSecret: async () => KSECRET, now: () => new Date(clock), newId: () => 'o' + ++n, get actor() {
  return actor;
} };
const at = (s: string) => { clock = Date.parse(s + '+08:00'); };
const call = async (m: string, p: string, body: any = null, q = '') => handleIntranetApi(ctx, m, p, new URLSearchParams(q), body);
let fails = 0;
const expect = (label: string, cond: boolean, extra?: unknown) => { if (!cond) fails++; console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label + (cond ? '' : ' ' + JSON.stringify(extra))); };

const cur = db.listEnrollments(new URLSearchParams({ tab: 'current', all: '1' })).rows;
const [A, B, C, D, E] = cur.map((r) => r.stId).filter((v, i, a) => a.indexOf(v) === i);
const campus = cur[0].campus;
const notCurrent = db.listEnrollments(new URLSearchParams({ tab: 'graduated', all: '1' })).rows[0].stId;

let r = await call('GET', '/guard', null, 'campus=' + campus);
expect('guard view campuses', (r.body as any).campuses.length > 0, r.body);
r = await call('POST', '/guard/scan', { code: notCurrent, mode: 'out', campus });
expect('졸업생 거절 404 not_current', r.status === 404 && (r.body as any).error === 'not_current', r);
r = await call('POST', '/guard/scan', { code: 'JIC-' + A, mode: 'out', campus, guard: 'RAMOS' });
expect('QR 문자열에서 숫자만 뽑아 외출 201', r.status === 201, r);
r = await call('POST', '/guard/scan', { code: A, mode: 'out', campus });
expect('이미 외출 중 409', r.status === 409 && (r.body as any).error === 'already_out', r);
r = await call('POST', '/guard/scan', { code: A, mode: 'sideways', campus });
expect('잘못된 mode 400', r.status === 400, r);

// A: 19:02 외출 → 21:46 귀가 (위반 아님)
at('2026-11-05T21:46:00');
r = await call('POST', '/guard/scan', { code: A, mode: 'in', campus, guard: 'CRUZ' });
expect('A 귀가 200, 164분, 위반 없음', r.status === 200 && (r.body as any).row.minutes === 164 && (r.body as any).row.breach === null, r.body);

// B: 20:00 외출 → 23:41 귀가 (통금 위반)
at('2026-11-05T20:00:00'); await call('POST', '/guard/scan', { code: B, mode: 'out', campus });
// C: 22:30 외출 → 미귀가
at('2026-11-05T22:30:00'); await call('POST', '/guard/scan', { code: C, mode: 'out', campus });
// D: 23:30 외출(통금 후 외출) → 23:50 귀가
at('2026-11-05T23:30:00'); await call('POST', '/guard/scan', { code: D, mode: 'out', campus });
at('2026-11-05T23:41:00'); await call('POST', '/guard/scan', { code: B, mode: 'in', campus });
at('2026-11-05T23:50:00'); await call('POST', '/guard/scan', { code: D, mode: 'in', campus });
// E: 외출 기록 없이 01:10 귀가 → 전날 밤(11/05)으로 계산
at('2026-11-06T01:10:00'); r = await call('POST', '/guard/scan', { code: E, mode: 'in', campus });
expect('E 외출 기록 없이 귀가 201, night=11-05', r.status === 201 && (r.body as any).row.night === '2026-11-05' && (r.body as any).row.outAt === null, r.body);

at('2026-11-06T01:15:00');
r = await call('GET', '/outings', null, 'date=2026-11-05');
const ol = r.body as any;
expect('11/05 밤 기록 5건, 외출 중 1(C), 위반 4(B,C,D,E)', ol.counts.all === 5 && ol.counts.out === 1 && ol.counts.breach === 4, ol.counts);
const basis = Object.fromEntries(ol.rows.map((x: any) => [x.stId, x.breach]));
expect('B 근거', basis[B] === '통금 23:00, 귀가 23:41', basis[B]);
expect('C 근거', basis[C] === '통금 23:00, 미귀가', basis[C]);
expect('D 근거', basis[D] === '통금 23:00 이후 외출 23:30, 귀가 23:50', basis[D]);
expect('E 근거', basis[E] === '통금 23:00, 귀가 01:10 (외출 기록 없음)', basis[E]);
expect('A 위반 아님', basis[A] === null, basis[A]);

r = await call('GET', '/penalties');
let pl = r.body as any;
expect('패널티 대기 4건, 점수 미정, 경고 기준 미정', pl.counts.pending === 4 && pl.rows.every((x: any) => x.score === null && x.stage === null), pl.rows.map((x: any) => [x.score, x.stage]));

// C 가 01:20 에 귀가 → 대기 중 후보 근거가 바뀐다
at('2026-11-06T01:20:00'); await call('POST', '/guard/scan', { code: C, mode: 'in', campus });
pl = (await call('GET', '/penalties')).body as any;
expect('C 근거 갱신(귀가 01:20), 여전히 4건', pl.counts.pending === 4 && pl.rows.find((x: any) => x.stId === C).basis === '통금 23:00, 귀가 01:20', pl.rows.find((x: any) => x.stId === C));

// 점수표: 잘못된 값 거절, 정상 저장
r = await call('PUT', '/penalty-rules', { kinds: [{ code: 'curfew', score: 2 }], stages: [{ min: 3 }, { min: 5 }, { min: 8 }] });
expect('종류 빠지면 400', r.status === 400, r);
const rules = (await call('GET', '/penalty-rules')).body as any;
r = await call('PUT', '/penalty-rules', { kinds: rules.kinds.map((k: any) => ({ ...k, score: k.code === 'curfew' ? 2 : null })), stages: [{ min: 5 }, { min: 3 }, { min: 8 }] });
expect('단계 기준이 줄면 400', r.status === 400, r);
r = await call('PUT', '/penalty-rules', { kinds: rules.kinds.map((k: any) => ({ ...k, score: k.code === 'curfew' ? 2 : null, approver: k.code === 'curfew' ? '오피스' : '' })), stages: [{ min: 3 }, { min: 5 }, { min: null }] });
expect('점수표 저장 200', r.status === 200, r);

pl = (await call('GET', '/penalties')).body as any;
const rowB = pl.rows.find((x: any) => x.stId === B);
expect('B 점수 2, 승인 후 누적 2, 단계 "-"', rowB.score === 2 && rowB.total === 2 && rowB.stage === '-' && rowB.approver === '오피스', rowB);

// B 승인 후 B의 다른 위반이 생기면 누적 2 → 4, 단계 - → 1단계
r = await call('POST', '/penalties/decide', { ids: [rowB.id], approve: true });
expect('B 승인 done 1', (r.body as any).done === 1, r.body);
r = await call('POST', '/penalties/decide', { ids: [rowB.id], approve: false });
expect('처리된 건은 다시 처리 안 됨(skipped)', (r.body as any).done === 0 && (r.body as any).skipped.length === 1, r.body);
at('2026-11-06T22:00:00'); await call('POST', '/guard/scan', { code: B, mode: 'out', campus });
at('2026-11-07T00:05:00'); await call('POST', '/guard/scan', { code: B, mode: 'in', campus });
pl = (await call('GET', '/penalties')).body as any;
const rowB2 = pl.rows.find((x: any) => x.stId === B);
expect('B 두 번째 위반: 날짜 11-06, 누적 4, 단계 "- → 1단계"', rowB2.date === '2026-11-06' && rowB2.total === 4 && rowB2.stage === '- → 1단계', rowB2);
const ap = (await call('GET', '/penalties', null, 'tab=approved')).body as any;
expect('승인 완료 탭 1건, 점수 스냅숏 2', ap.rows.length === 1 && ap.rows[0].score === 2 && ap.rows[0].total === 2, ap.rows);

// 점수표를 바꿔도 승인된 점수는 그대로
await call('PUT', '/penalty-rules', { kinds: rules.kinds.map((k: any) => ({ ...k, score: k.code === 'curfew' ? 5 : null })), stages: [{ min: 3 }, { min: 5 }, { min: null }] });
const ap2 = (await call('GET', '/penalties', null, 'tab=approved')).body as any;
expect('점수표 변경 후에도 승인 점수 2 유지', ap2.rows[0].score === 2, ap2.rows[0]);

// 통금을 01:30 으로 늦추면 11/05 밤 후보(B 23:41, C 01:20, D 23:30 외출, E 01:10)와 11/06 B(00:05)가 모두 위반이 아니게 된다.
r = await call('PUT', '/settings', { curfew: '25:00', guards: [] });
expect('잘못된 통금 400', r.status === 400, r);
await call('PUT', '/settings', { curfew: '01:30', guards: [] });
pl = (await call('GET', '/penalties')).body as any;
expect('통금 01:30: 11/05 밤 대기 후보 모두 사라짐, 11/06 B(00:05)도 아님 → 대기 0', pl.counts.pending === 0, pl.rows.map((x: any) => [x.stId, x.basis]));
await call('PUT', '/settings', { curfew: '23:00', guards: ['RAMOS', 'CRUZ'] });
r = await call('POST', '/guard/scan', { code: A, mode: 'out', campus, guard: '' });
expect('근무자 목록이 있으면 근무자 필수 400', r.status === 400 && (r.body as any).error === 'guard_required', r);
r = await call('POST', '/penalties/decide', { ids: [], approve: true });
expect('ids 없으면 400', r.status === 400, r);
const sm = (await call('GET', '/summary')).body as any;
expect('summary', typeof sm.pending === 'number' && sm.current > 0, sm);

// ── 외박 허용과 신청 처리
await call('PUT', '/settings', { curfew: '23:00', guards: [] });
const req = (id: string, stId: string, extra: Record<string, unknown>) => ({
  id, stId, trId: '', reason: '사유', status: 'pending', submittedAt: '2026-11-04T01:00:00.000Z', updatedAt: '2026-11-04T01:00:00.000Z', decidedAt: null, decidedBy: null, comment: null, ...extra,
});
// C 는 11/05 밤 미귀가 → 귀가 01:20 이었던 학생. 11/05~11/06 외박 신청(대기)
await stores.overnights.put(req('ov1', C, { from: '2026-11-05', until: '2026-11-06' }) as Overnight);
await stores.absences.put(req('ab1', A, { date: '2026-11-09', periods: [], kind: 'sick' }) as Absence);
await stores.absences.put(req('ab2', B, { date: '2026-11-10', periods: [3, 4], kind: 'official' }) as Absence);
pl = (await call('GET', '/penalties')).body as any;
expect('대기 중 외박은 통금 판정에 영향 없음: C 후보 그대로', pl.rows.some((x: any) => x.stId === C && x.date === '2026-11-05'), pl.rows.map((x: any) => x.stId));
let rq = (await call('GET', '/requests/overnights')).body as any;
expect('외박 대기 1건, 1박', rq.counts.pending === 1 && rq.overnights[0].nights === 1 && rq.overnights[0].name, rq);
expect('외박 행: 성년이면 미성년 표시 없음, 보호자 동의 표시 false(11/10 결정 I11)', rq.overnights[0].minor === false && rq.overnights[0].guardianConsent === false, rq.overnights[0]);
r = await call('POST', '/requests/overnights/decide', { ids: ['ov1'], approve: true, comment: '보호자 확인' });
expect('외박 승인 done 1', (r.body as any).done === 1, r.body);
pl = (await call('GET', '/penalties')).body as any;
expect('외박 승인 후 C 의 11/05 밤 통금 위반 후보가 빠짐', !pl.rows.some((x: any) => x.stId === C && x.date === '2026-11-05'), pl.rows.map((x: any) => [x.stId, x.date]));
const ovl = (await call('GET', '/outings', null, 'date=2026-11-05')).body as any;
const cRow = ovl.rows.find((x: any) => x.stId === C);
expect('외출 기록에 외박 허용(복귀일 11-06) 표시, 위반 아님', cRow.overnightUntil === '2026-11-06' && cRow.breach === null, cRow);
rq = (await call('GET', '/requests/absences', null, 'kind=official')).body as any;
expect('결석 대기 2건, 종류 검색 1건', rq.counts.pending === 2 && rq.absences.length === 1 && rq.absences[0].id === 'ab2', rq);
r = await call('POST', '/requests/absences/decide', { ids: ['ab1', 'ab2', 'nope'], approve: false, comment: '진단서 필요' });
expect('결석 반려 2건, 없는 id 건너뜀', (r.body as any).done === 2 && (r.body as any).skipped[0] === 'nope', r.body);
const ab1 = await stores.absences.get('ab1');
expect('반려 메모가 학생 신청에 남음', ab1?.status === 'rejected' && ab1?.comment === '진단서 필요' && ab1?.decidedAt !== null, ab1);
r = await call('POST', '/requests/absences/decide', { ids: ['ab1'], approve: true });
expect('처리된 결석은 다시 처리 안 됨', (r.body as any).done === 0, r.body);
rq = (await call('GET', '/requests/absences', null, 'tab=rejected')).body as any;
expect('반려 탭 2건', rq.absences.length === 2, rq.absences.length);
r = await call('POST', '/requests/absences/decide', { ids: ['ab1'] });
expect('승인/반려 값 없으면 400', r.status === 400, r);
// 오늘 밤 외박 허용 수: 지금(11/07 00:05 이후)을 11/07 밤으로 옮겨 확인
at('2026-11-07T21:00:00');
await stores.overnights.put(req('ov2', D, { from: '2026-11-07', until: '2026-11-09', status: 'approved' }) as Overnight);
const campusD = cur.find((x) => x.stId === D)!.campus;
const gv = (await call('GET', '/guard', null, 'campus=' + campusD)).body as any;
expect('가드 화면(D 의 캠퍼스) 오늘 밤 외박 허용 1명', gv.overnightTonight === 1, gv.overnightTonight);
const otherCampus = gv.campuses.find((c: string) => c !== campusD);
if (otherCampus) {
  const gv2 = (await call('GET', '/guard', null, 'campus=' + otherCampus)).body as any;
  expect('다른 캠퍼스 가드 화면에는 안 셈', gv2.overnightTonight === 0, gv2.overnightTonight);
}
const sm2 = (await call('GET', '/summary')).body as any;
expect('홈 요약: 결석 대기 0, 외박 대기 0, 오늘 밤 외박 1', sm2.pendingAbsences === 0 && sm2.pendingOvernights === 0 && sm2.overnightTonight === 1, sm2);

// ── Student File
const files = (await call('GET', '/students', null, 'sort=score')).body as any;
const fB = files.rows.find((x: any) => x.stId === B);
expect('Student File 목록: 재학생 전원, 학생당 한 줄', files.rows.length === new Set(cur.map((x) => x.stId)).size, files.rows.length);
expect('B 누적 점수 2(승인 1건), 점수순 맨 위', fB.total === 2 && files.rows[0].stId === B, fB);
const fD = files.rows.find((x: any) => x.stId === D);
expect('D 오늘 밤 외박 허용 표시', fD.overnightTonight === true, fD);
const byName = (await call('GET', '/students', null, 'sort=name&q=' + B)).body as any;
expect('학생번호 검색 1명', byName.rows.length === 1 && byName.rows[0].stId === B, byName.rows.length);
const fileB = (await call('GET', '/students/' + B)).body as any;
expect('B 상세: 패널티 이력·외출 기록·누적 점수', fileB.total === 2 && fileB.penalties.length >= 2 && fileB.outingCount === 2 && fileB.student.name, { total: fileB.total, p: fileB.penalties.length, o: fileB.outingCount });
expect('B 상세: 결석 신청 이력(반려 메모 포함)', fileB.absences.length === 1 && fileB.absences[0].comment === '진단서 필요', fileB.absences);
const fileC = (await call('GET', '/students/' + C)).body as any;
expect('C 상세: 외박 이력 1박, 그 밤 외출은 외박 허용', fileC.overnights[0]?.nights === 1 && fileC.outings.some((o: any) => o.overnightUntil === '2026-11-06'), fileC.overnights);
r = await call('GET', '/students/99999999');
expect('없는 학생 404', r.status === 404, r);

// ── 상담 기록·접근 기록
at('2026-11-07T10:00:00');
r = await call('POST', '/counseling', { stId: B, date: '2026-11-07', title: '통금 위반 면담', content: '귀가 늦은 이유: 친구 생일' });
expect('처리자 없으면 작성 불가 400', r.status === 400 && (r.body as any).error === 'actor_required', r);
actor = '김상담';
r = await call('POST', '/counseling', { stId: '99999999', date: '2026-11-07', title: 't', content: 'c' });
expect('없는 학생 400', (r.body as any).error === 'unknown_student', r);
r = await call('POST', '/counseling', { stId: B, date: '2026-11-08', title: 't', content: 'c' });
expect('미래 상담일 400', (r.body as any).error === 'invalid_date', r);
r = await call('POST', '/counseling', { stId: B, date: '2026-11-07', title: 't', content: 'c', followUpDue: '2026-11-01' });
expect('후속 조치 기한이 상담일보다 앞이면 400', (r.body as any).error === 'invalid_followup', r);
r = await call('POST', '/counseling', { stId: B, date: '2026-11-07', title: '통금 위반 면담', content: '귀가 늦은 이유: 친구 생일', followUpDue: '2026-11-09' });
expect('상담 기록 작성 201', r.status === 201, r);
const noteId = (r.body as any).id;
await call('POST', '/counseling', { stId: A, date: '2026-11-06', title: '수업 적응', content: '레벨 조정 희망', followUpDue: '2026-11-06' });
let cl = (await call('GET', '/counseling')).body as any;
expect('목록 2건, 내용은 내보내지 않음', cl.rows.length === 2 && cl.rows.every((x: any) => !('content' in x)), cl.rows);
expect('확인할 일 2건, 기한 지남 1건(11/06)', cl.counts.followup === 2 && cl.counts.overdue === 1, cl.counts);
cl = (await call('GET', '/counseling', null, 'q=생일')).body as any;
expect('내용으로는 검색되지 않음', cl.rows.length === 0, cl.rows.length);
cl = (await call('GET', '/counseling', null, 'q=김상담')).body as any;
expect('작성자로 검색 2건', cl.rows.length === 2, cl.rows.length);
actor = '박매니저';
let det = (await call('GET', '/counseling/' + noteId)).body as any;
expect('상세에 내용, 접근 기록(작성·열람)', det.note.content.includes('친구 생일') && det.trail.length === 2 && det.trail[0].action === 'view' && det.trail[0].actor === '박매니저', det.trail);
det = (await call('GET', '/counseling/' + noteId)).body as any;
expect('같은 직원이 10초 안에 다시 열면 열람 1번', det.trail.filter((l: any) => l.action === 'view').length === 1, det.trail);
at('2026-11-07T10:00:11');
det = (await call('GET', '/counseling/' + noteId)).body as any;
expect('10초가 지나면 다시 남김', det.trail.filter((l: any) => l.action === 'view').length === 2, det.trail.length);
actor = null;
r = await call('GET', '/counseling/' + noteId);
expect('처리자 없으면 열람 불가', r.status === 400, r);
actor = '박매니저';
r = await call('PUT', '/counseling/' + noteId, { date: '2026-11-07', title: '통금 위반 면담(보완)', content: '귀가 늦은 이유: 친구 생일. 보호자 연락함', followUpDue: '2026-11-09' });
expect('수정 200', r.status === 200, r);
r = await call('POST', '/counseling/' + noteId + '/followup', { done: true });
expect('후속 조치 완료', r.status === 200, r);
det = (await call('GET', '/counseling/' + noteId)).body as any;
expect('완료 처리자·시각 기록, 수정자 기록', det.note.followUpDone && det.note.followUpDoneBy === '박매니저' && det.note.updatedBy === '박매니저' && det.note.author === '김상담', det.note);
const au = (await call('GET', '/audit', null, 'q=박매니저')).body as any;
expect('접근 기록: 박매니저 열람 2(10초 안 재열람은 1번)·수정 1·완료 1', au.rows.filter((x: any) => x.action === 'view').length === 2 && au.rows.some((x: any) => x.action === 'update') && au.rows.some((x: any) => x.action === 'followup_done'), au.rows.map((x: any) => x.action));
const auView = (await call('GET', '/audit', null, 'action=view&from=2026-11-07&to=2026-11-07')).body as any;
expect('접근 기록 날짜(필리핀)·종류 검색', auView.total === 2 && auView.rows.every((x: any) => x.title.startsWith('통금 위반 면담')), auView.total);
const fileB2 = (await call('GET', '/students/' + B)).body as any;
expect('Student File 에 상담 기록 제목(내용 없음)', fileB2.counseling.length === 1 && !('content' in fileB2.counseling[0]), fileB2.counseling);
const sm3 = (await call('GET', '/summary')).body as any;
expect('홈: 열린 후속 조치 1(A), 기한 지남·오늘 1', sm3.followUpOpen === 1 && sm3.followUpDue === 1, sm3);
r = await call('POST', '/counseling/' + noteId + '/followup', { done: 'yes' });
expect('완료 값 잘못되면 400', r.status === 400, r);

// ── 내부 공지
at('2026-11-07T09:00:00');
actor = null;
r = await call('POST', '/notices', { title: '이번 주 통금 점검', content: '금요일 밤 통금 점검' });
expect('공지: 처리자 없으면 작성 불가', (r.body as any).error === 'actor_required', r);
actor = '레오';
r = await call('POST', '/notices', { title: '', content: 'x' });
expect('공지: 제목 없으면 400', (r.body as any).error === 'invalid_title', r);
r = await call('POST', '/notices', { title: 't', content: 'x', campus: '없는캠퍼스' });
expect('공지: 없는 캠퍼스 400', (r.body as any).error === 'invalid_campus', r);
r = await call('POST', '/notices', { title: 't', content: 'x', until: '2026-11-06' });
expect('공지: 지난 날짜까지 새 공지 400', (r.body as any).error === 'invalid_until', r);
r = await call('POST', '/notices', { title: '전체 공지', content: '모든 캠퍼스', until: '2026-11-07' });
const nAll = (r.body as any).id;
at('2026-11-07T09:01:00');
r = await call('POST', '/notices', { title: `${campus} 정전 안내`, content: '토요일 오전 정전', campus });
const nCampus = (r.body as any).id;
at('2026-11-07T09:02:00');
r = await call('POST', '/notices', { title: '고정 공지', content: '비상 연락망', pinned: true });
const nPinned = (r.body as any).id;
let nl = (await call('GET', '/notices')).body as any;
expect('공지 3건, 고정 먼저, 그다음 최근 순', nl.rows.map((x: any) => x.id).join() === [nPinned, nCampus, nAll].join(), nl.rows.map((x: any) => x.title));
expect('작성자는 안 읽음으로 시작', nl.rows.every((x: any) => !x.readByMe && x.readCount === 0), nl.rows);
const other = cur.find((x) => x.campus !== campus)?.campus;
if (other) {
  nl = (await call('GET', '/notices', null, 'campus=' + other)).body as any;
  expect('다른 캠퍼스로 보면 전체 공지만(그 캠퍼스 공지 제외)', nl.rows.length === 2 && !nl.rows.some((x: any) => x.id === nCampus), nl.rows.map((x: any) => x.title));
}
let sm4 = (await call('GET', '/summary')).body as any;
expect('홈: 레오 안 읽은 공지 3, 최근 공지 3개', sm4.unreadNotices === 3 && sm4.latestNotices.length === 3, sm4.unreadNotices);
let nd = (await call('GET', '/notices/' + nPinned)).body as any;
expect('공지 열면 읽음 1(레오)', nd.readCount === 1 && nd.reads[0].name === '레오' && nd.content === '비상 연락망', nd);
nd = (await call('GET', '/notices/' + nPinned)).body as any;
expect('같은 직원이 다시 열어도 읽음 1', nd.readCount === 1, nd.readCount);
actor = '김상담';
nd = (await call('GET', '/notices/' + nPinned)).body as any;
expect('다른 직원이 열면 읽음 2', nd.readCount === 2, nd.reads);
actor = null;
nd = (await call('GET', '/notices/' + nAll)).body as any;
expect('이름 없이 열면 읽음 안 남김', nd.readCount === 0, nd.readCount);
actor = '레오';
sm4 = (await call('GET', '/summary')).body as any;
expect('레오 안 읽은 공지 2', sm4.unreadNotices === 2, sm4.unreadNotices);
// 게시 종료일이 지나면 지난 공지
at('2026-11-08T09:00:00');
nl = (await call('GET', '/notices')).body as any;
expect('11/08: 11/07까지 공지는 지난 공지로', nl.counts.current === 2 && nl.counts.past === 1 && !nl.rows.some((x: any) => x.id === nAll), nl.counts);
sm4 = (await call('GET', '/summary')).body as any;
expect('지난 공지는 안 읽은 수에서 빠짐', sm4.unreadNotices === 1, sm4.unreadNotices);
// 수정으로 게시 내리기
r = await call('PUT', '/notices/' + nCampus, { title: `${campus} 정전 안내(종료)`, content: '토요일 오전 정전', campus, until: '2026-11-07' });
expect('수정으로 게시 내리기 200', r.status === 200, r);
nl = (await call('GET', '/notices', null, 'view=past')).body as any;
expect('지난 공지 2건, 수정한 제목', nl.rows.length === 2 && nl.rows.some((x: any) => x.title.endsWith('(종료)')), nl.rows.map((x: any) => x.title));
nl = (await call('GET', '/notices', null, 'q=연락망')).body as any;
expect('내용으로 검색', nl.rows.length === 1 && nl.rows[0].id === nPinned, nl.rows.length);
r = await call('GET', '/notices/nope');
expect('없는 공지 404', r.status === 404, r);

// ── 가드 리포트
await call('PUT', '/settings', { curfew: '23:00', guards: ['RAMOS J.'] });
at('2026-11-08T00:20:00');
r = await call('POST', '/guard/report', { code: A, campus, kind: 'alcohol', note: '음주 후 귀가', guard: '' });
expect('리포트: 근무자 필수', (r.body as any).error === 'guard_required', r);
r = await call('POST', '/guard/report', { code: notCurrent, campus, kind: 'alcohol', note: 'x', guard: 'RAMOS J.' });
expect('리포트: 재학생만', r.status === 404, r);
r = await call('POST', '/guard/report', { code: A, campus, kind: 'drunk', note: 'x', guard: 'RAMOS J.' });
expect('리포트: 종류 확인', (r.body as any).error === 'invalid_kind', r);
r = await call('POST', '/guard/report', { code: A, campus, kind: 'alcohol', note: '', guard: 'RAMOS J.' });
expect('리포트: 내용 필수', (r.body as any).error === 'invalid_note', r);
r = await call('POST', '/guard/report', { code: A, campus, kind: 'alcohol', note: 'x', guard: 'RAMOS J.', time: '25:00' });
expect('리포트: 시각 확인', (r.body as any).error === 'invalid_time', r);
// 00:20 에 '23:50' 으로 쓰면 전날 밤 23:50
r = await call('POST', '/guard/report', { code: A, campus, kind: 'alcohol', note: '정문에서 술 냄새, 비틀거림. 기숙사 사감에게 인계', guard: 'RAMOS J.', time: '23:50' });
expect('리포트 등록 201', r.status === 201 && (r.body as any).report.kindLabel === '음주', r);
const rep1 = (r.body as any).report;
expect('발생 시각이 지금보다 뒤면 전날(11/07 23:50)', rep1.occurredAt === '2026-11-07T15:50:00.000Z', rep1.occurredAt);
r = await call('POST', '/guard/report', { code: D, campus, kind: 'unauthorized', note: '카드키 미반납 외출', guard: 'RAMOS J.' });
const rep2 = (r.body as any).report;
pl = (await call('GET', '/penalties', null, 'q=' + A)).body as any;
const pA = pl.rows.find((x: any) => x.source === 'guard');
expect('음주 리포트 → 패널티 대기(음주), 발생일 11/07 밤, 근거', pA && pA.kind === 'alcohol' && pA.date === '2026-11-07' && pA.basis.startsWith('가드 리포트(23:50): 음주 — 정문에서'), pA);
pl = (await call('GET', '/penalties', null, 'q=' + D)).body as any;
const pD = pl.rows.find((x: any) => x.source === 'guard');
expect('무단외출 리포트 → 패널티 대기(무단외출, 11/10 결정 I7)', pD && pD.kind === 'unauthorized' && pD.kindName === '무단외출', pD);
await call('POST', '/penalties/decide', { ids: [pD.id], approve: false });
const rl = (await call('GET', '/reports')).body as any;
expect('리포트 목록 2건, 최근 순, 패널티 상태(대기·반려)', rl.rows.length === 2 && rl.rows[0].id === rep2.id && rl.rows[0].penaltyStatus === 'rejected' && rl.rows[1].penaltyStatus === 'pending', rl.rows.map((x: any) => [x.kindLabel, x.penaltyStatus]));
const rlK = (await call('GET', '/reports', null, 'kind=alcohol&from=2026-11-07&to=2026-11-07')).body as any;
expect('리포트 종류·날짜(필리핀) 검색', rlK.rows.length === 1 && rlK.rows[0].id === rep1.id, rlK.rows.length);
const synced = (await call('GET', '/penalties', null, 'tab=rejected&q=' + D)).body as any;
expect('통금 후보 정리가 가드 리포트 패널티를 건드리지 않음', synced.rows.some((x: any) => x.source === 'guard'), synced.rows.length);

// ── 귀국 일정 (지금 11/08 00:20 필리핀 → 오늘 11/08, 14일 뒤 11/22)
const curRows = [...new Map(cur.map((x) => [x.stId, x] as const)).values()];
const soonRows = curRows.filter((x) => x.end >= '2026-11-08' && x.end <= '2026-11-22');
const [S1, S2] = soonRows;
const dep = (row: (typeof curRows)[number], date: string, time: string, needsRide: boolean) =>
  ({ id: `dep-${row.trId}`, stId: row.stId, trId: row.trId, date, time, flight: 'PR 468', airport: 'MANILA', needsRide, note: '', createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z' }) as Departure;
await stores.departures.put(dep(S1, '2026-11-15', '09:40', true));
await stores.departures.put(dep(S2, '2026-11-14', '13:05', false));
let dl = (await call('GET', '/departures')).body as any;
expect('귀국 일정: 기본 기간 오늘~14일, 등록 2건, 날짜·시각 순', dl.from === '2026-11-08' && dl.to === '2026-11-22' && dl.registered.length === 2 && dl.registered[0].stId === S2.stId && dl.registered[0].end === S2.end, dl.registered.map((x: any) => [x.stId, x.date]));
expect('졸업 14일 이내 미등록 = 졸업임박 재학생 - 등록 2명', dl.counts.missing === soonRows.length - 2 && !dl.missing.some((x: any) => x.stId === S1.stId), [dl.counts.missing, soonRows.length]);
dl = (await call('GET', '/departures', null, 'ride=1')).body as any;
expect('차량 요청만 1건', dl.registered.length === 1 && dl.registered[0].stId === S1.stId, dl.registered.length);
dl = (await call('GET', '/departures', null, 'from=2026-11-15&to=2026-11-15')).body as any;
expect('기간 검색 1건', dl.registered.length === 1, dl.registered.length);
const sfDep = (await call('GET', '/students/' + S1.stId)).body as any;
expect('Student File 에 귀국 항공편', sfDep.departure?.date === '2026-11-15', sfDep.departure);
const sm5 = (await call('GET', '/summary')).body as any;
expect('홈: 귀국 미등록 수', sm5.departureMissing === soonRows.length - 2, sm5.departureMissing);

// ── 공항 이동 배차 (S1: 11/15 09:40 차량 요청, S2: 차량 요청 없음)
dl = (await call('GET', '/departures', null, 'ride=pending')).body as any;
expect('배차: 처리할 것 1건(S1 요청), 메뉴 숫자 1', dl.registered.length === 1 && dl.registered[0].ride.state === 'requested' && dl.counts.ridePending === 1, dl.registered.map((x: any) => x.ride.state));
actor = null;
r = await call('POST', `/departures/dep-${S1.trId}/ride`, { decision: 'confirmed', pickupDate: '2026-11-15', pickupTime: '06:00' });
expect('배차: 직원 이름 필수', (r.body as any).error === 'actor_required', r);
actor = '오피스 김';
r = await call('POST', `/departures/dep-${S2.trId}/ride`, { decision: 'declined', note: 'x' });
expect('차량 요청 없는 항공편 409', (r.body as any).error === 'no_ride_request', r);
r = await call('POST', `/departures/dep-${S1.trId}/ride`, { decision: 'confirmed', pickupDate: '2026-11-15', pickupTime: '06:00', note: '정문 집합, 밴 1호차' });
expect('배차 확정', r.status === 200 && (r.body as any).state === 'confirmed', r);
dl = (await call('GET', '/departures')).body as any;
const s1Row = dl.registered.find((x: any) => x.stId === S1.stId);
expect('목록에 확정·처리자·기숙사 출발', s1Row.ride.state === 'confirmed' && s1Row.ride.record.decidedBy === '오피스 김' && s1Row.ride.record.pickupTime === '06:00' && dl.counts.ridePending === 0, s1Row.ride);
// 학생이 시각을 바꾸면 재확인
await stores.departures.put({ ...(await stores.departures.get(`dep-${S1.trId}`))!, time: '11:20' });
dl = (await call('GET', '/departures', null, 'ride=pending')).body as any;
expect('항공편 시각 변경 → 재확인, 메뉴 숫자 1', dl.registered.length === 1 && dl.registered[0].ride.state === 'changed' && dl.counts.ridePending === 1, dl.registered.map((x: any) => x.ride.state));
r = await call('POST', `/departures/dep-${S1.trId}/ride`, { decision: 'declined', note: '그 시각에는 차량이 없음. 택시 안내' });
expect('다시 처리(불가)하면 덮어씀', (r.body as any).state === 'declined', r);
const sm6 = (await call('GET', '/summary')).body as any;
expect('홈 요약 배차 미처리 0', sm6.ridePending === 0, sm6.ridePending);

// ── 생활 요청(학생 앱 lifeRequests.ts): 학생이 낸 요청을 직원이 처리
const lifeOf = async (stId: string, category: string, content: string) => {
  const out = newLifeRequest({ db, stId, now: () => new Date(clock), newId: () => 'L' + ++n }, await stores.lifeRequests.listByStudent(stId), { category, content });
  if (!out.ok) throw new Error(out.error);
  await stores.lifeRequests.put(out.value);
  return out.value;
};
const L1 = await lifeOf(S1.stId, 'facility', '302호 샤워기 수압이 약합니다');
clock += 60_000;
const L2 = await lifeOf(S2.stId, 'id_card', 'ID 카드 분실, 재발급 부탁드립니다');
let ll = (await call('GET', '/requests/life')).body as any;
expect('생활 요청 목록: 접수 2건, 오래된 순, 이름·캠퍼스', ll.tab === 'received' && ll.counts.received === 2 && ll.rows[0].id === L1.id && ll.rows[0].name && ll.rows[0].campus && ll.categories.length === 5, ll);
expect('홈 요약 생활 요청 2', ((await call('GET', '/summary')).body as any).lifePending === 2);
ll = (await call('GET', '/requests/life', null, 'category=id_card')).body as any;
expect('종류로 찾기', ll.rows.length === 1 && ll.rows[0].id === L2.id, ll.rows);
ll = (await call('GET', '/requests/life', null, 'q=샤워기')).body as any;
expect('내용으로 찾기', ll.rows.length === 1 && ll.rows[0].id === L1.id, ll.rows);
actor = '오피스 김';
r = await call('POST', `/requests/life/${L1.id}/handle`, { status: 'rejected', reply: '' });
expect('반려는 사유 필수 400', r.status === 400 && (r.body as any).error === 'reply_required', r);
r = await call('POST', `/requests/life/${L1.id}/handle`, { status: 'in_progress', reply: '오늘 오후 시설팀 방문' });
expect('처리 중 + 답변, 처리자', r.status === 200 && (r.body as any).status === 'in_progress' && (r.body as any).handledBy === '오피스 김', r);
r = await call('POST', `/requests/life/${L2.id}/handle`, { status: 'done', reply: '사무실에서 새 카드 받으세요(수수료 200페소)' });
expect('완료', r.status === 200 && (r.body as any).status === 'done', r);
r = await call('POST', `/requests/life/${L2.id}/handle`, { status: 'rejected', reply: 'x' });
expect('끝난 요청 409', r.status === 409 && (r.body as any).error === 'already_closed', r);
r = await call('POST', '/requests/life/nope/handle', { status: 'done' });
expect('없는 요청 404', r.status === 404, r);
ll = (await call('GET', '/requests/life', null, 'tab=in_progress')).body as any;
expect('처리 중 탭', ll.counts.received === 0 && ll.counts.in_progress === 1 && ll.counts.done === 1 && ll.rows[0].reply === '오늘 오후 시설팀 방문', ll);
expect('홈 요약 생활 요청 0', ((await call('GET', '/summary')).body as any).lifePending === 0);
actor = null;
r = await call('POST', `/requests/life/${L1.id}/handle`, { status: 'done' });
expect('로컬은 이름 없이도 처리(처리자 없음), 답변은 그대로', r.status === 200 && (r.body as any).handledBy === null && (r.body as any).reply === '오늘 오후 시설팀 방문', r);
const sfL = (await call('GET', `/students/${S1.stId}`)).body as any;
expect('Student File 에 생활 요청', sfL.lifeRequests.length === 1 && sfL.lifeRequests[0].status === 'done', sfL.lifeRequests);

// ── 외박·여행 신청: 같이 가는 학생과 그 학생의 신청 여부
const S3 = ((await call('GET', '/students', null, 'size=100')).body as any).rows.find((x: any) => x.stId !== S1.stId && x.stId !== S2.stId).stId as string;
const base = { reason: '주말 여행', status: 'pending' as const, submittedAt: '2026-11-05T01:00:00Z', updatedAt: '2026-11-05T01:00:00Z', decidedAt: null, decidedBy: null, comment: null };
await stores.overnights.put({ ...base, id: 'T1', stId: S1.stId, trId: S1.trId, from: '2026-11-14', until: '2026-11-16', destination: 'Boracay', accommodation: 'Sea Breeze Inn', contact: '+63 917 000 0000', companions: [S2.stId, S3] });
await stores.overnights.put({ ...base, id: 'T2', stId: S2.stId, trId: S2.trId, from: '2026-11-15', until: '2026-11-16', destination: 'Boracay', contact: '+63 917 000 0001', companions: [S1.stId] });
const tl = (await call('GET', '/requests/overnights', null, 'tab=pending')).body as any;
const t1 = tl.overnights.find((o: any) => o.id === 'T1');
expect('여행 정보가 목록에', t1.destination === 'Boracay' && t1.accommodation === 'Sea Breeze Inn' && t1.contact === '+63 917 000 0000', t1);
expect('동행: 이름과 신청 여부(같은 기간에 신청한 학생만 표시)', t1.companionInfo.length === 2 && t1.companionInfo[0].requested === true && t1.companionInfo[0].name === S2.name && t1.companionInfo[1].stId === S3 && t1.companionInfo[1].requested === false, t1.companionInfo);
const old = tl.overnights.find((o: any) => !o.destination);
expect('여행 정보가 없는 예전 신청도 목록에(동행 없음)', !old || old.companionInfo.length === 0, old);

// ── 학교 여행·액티비티(학생 앱 trips.ts): 직원이 올리고, 학생이 신청하면 1박 이상은 외박 허용
at('2026-11-08T10:00:00');
actor = '오피스 김';
const tripBody = { campus, title: '보라카이 1박', place: 'Boracay', meeting: '토 07:00 정문', description: '왕복 밴, 숙소 포함', start: '2026-11-14', end: '2026-11-15', deadline: '2026-11-12', capacity: 2, cost: 2500 };
r = await call('POST', '/trips', { ...tripBody, title: ' ' });
expect('여행 등록: 제목 필수 400', r.status === 400 && (r.body as any).error === 'title_required', r);
r = await call('POST', '/trips', { ...tripBody, campus: 'Busan' });
expect('여행 등록: 없는 캠퍼스 400', (r.body as any).error === 'invalid_campus', r);
r = await call('POST', '/trips', tripBody);
const tripId = (r.body as any).id as string;
expect('여행 등록 201: 신청 받는 중, 올린 직원', r.status === 201 && (r.body as any).status === 'open' && (r.body as any).createdBy === '오피스 김' && (r.body as any).taken === 0, r);
let trl = (await call('GET', '/trips')).body as any;
expect('여행 목록: 다가오는 1건, 1박, 신청 받는 중', trl.counts.upcoming === 1 && trl.rows[0].nights === 1 && trl.rows[0].accepting === true && trl.campuses.includes(campus), trl);
const taken = new Set([A, B, C, D, E, S1.stId, S2.stId, S3]);
const fits = [...new Set(cur.filter((x) => x.campus === campus && x.start <= '2026-11-14' && x.end >= '2026-11-15' && !taken.has(x.stId)).map((x) => x.stId))];
const [F, G] = fits;
const signOf = async (stId: string) => {
  const out = signUp({ db, stId, now: () => new Date(clock), newId: () => 'S' + ++n, today: '2026-11-08' }, await stores.trips.getTrip(tripId), await stores.trips.signupsByStudent(stId));
  if (!out.ok) throw new Error(out.error);
  await stores.trips.putSignup(out.value);
  return out.value;
};
const sF = await signOf(F);
await signOf(G);
let td = (await call('GET', `/trips/${tripId}`)).body as any;
expect('여행 상세: 명단 2명(이름·캠퍼스), 신청 2', td.trip.taken === 2 && td.signups.length === 2 && td.signups.every((x: any) => x.name && x.campus === campus && x.status === 'applied'), td);
r = await call('PUT', `/trips/${tripId}`, { ...tripBody, capacity: 1 });
expect('정원을 신청 수보다 줄이면 409', r.status === 409 && (r.body as any).error === 'capacity_below_signups', r);
r = await call('PUT', `/trips/${tripId}`, { ...tripBody, title: '보라카이 1박 (밴)', capacity: 3 });
expect('여행 수정 200', r.status === 200 && (r.body as any).title === '보라카이 1박 (밴)' && (r.body as any).capacity === 3, r);
r = await call('POST', `/trips/${tripId}/status`, { status: 'closed' });
expect('신청 마감', r.status === 200 && (r.body as any).status === 'closed', r);
expect('마감하면 신청 받는 중 아님', ((await call('GET', '/trips')).body as any).rows[0].accepting === false);
r = await call('POST', `/trips/${tripId}/status`, { status: 'closed' });
expect('같은 상태 409', r.status === 409 && (r.body as any).error === 'same_status', r);
await call('POST', `/trips/${tripId}/status`, { status: 'open' });
// F 가 여행 첫날 밤 외출하고 돌아오지 않음 → 여행 참가라 통금 위반 아님
at('2026-11-14T20:00:00'); await call('PUT', '/settings', { curfew: '23:00', guards: [] });
r = await call('POST', '/guard/scan', { code: F, mode: 'out', campus });
expect('여행 참가자 외출 201', r.status === 201, [r, F, G, fits.length]);
at('2026-11-15T01:00:00');
let fRow = ((await call('GET', '/outings', null, 'date=2026-11-14')).body as any).rows.find((x: any) => x.stId === F);
expect('여행 밤: 위반 아님, 외박 허용(복귀일)·여행 이름', fRow.breach === null && fRow.overnightUntil === '2026-11-15' && fRow.overnightTrip === '보라카이 1박 (밴)', fRow);
const gvT = (await call("GET", "/guard", null, "campus=" + campus)).body as any;
expect('가드 화면: 오늘 밤 외박 허용에 여행 참가자 포함', gvT.overnightTonight >= 2, gvT.overnightTonight);
const smT = (await call('GET', '/summary')).body as any;
expect('홈 요약: 다가오는 여행 1, 오늘 밤 외박 허용 2 이상', smT.tripsUpcoming === 1 && smT.overnightTonight >= 2, smT);
r = await call('POST', `/trips/signups/${sF.id}/remove`, { reason: '' });
expect('명단 제외는 사유 필수 400', r.status === 400 && (r.body as any).error === 'reason_required', r);
r = await call('POST', `/trips/signups/${sF.id}/remove`, { reason: '출발 전 연락 없음' });
expect('명단 제외 200, 처리자', r.status === 200 && (r.body as any).status === 'removed' && (r.body as any).handledBy === '오피스 김', r);
r = await call('POST', `/trips/signups/${sF.id}/remove`, { reason: 'x' });
expect('이미 빠진 신청 409', r.status === 409 && (r.body as any).error === 'not_applied', r);
pl = (await call('GET', '/penalties')).body as any;
expect('명단에서 빠지면 그 밤 통금 위반 후보가 생김', pl.rows.some((x: any) => x.stId === F && x.date === '2026-11-14'), pl.rows.map((x: any) => [x.stId, x.date]));
const sfT = (await call('GET', `/students/${F}`)).body as any;
expect('Student File 에 학교 여행(제외 사유)', sfT.trips.length === 1 && sfT.trips[0].status === 'removed' && sfT.trips[0].reason === '출발 전 연락 없음' && sfT.trips[0].trip.title === '보라카이 1박 (밴)', sfT.trips);
const before = ((await call('GET', '/summary')).body as any).overnightTonight;
r = await call('POST', `/trips/${tripId}/status`, { status: 'cancelled' });
expect('여행 취소', r.status === 200 && (r.body as any).status === 'cancelled', r);
expect('취소하면 참가자 외박 허용이 빠짐', ((await call('GET', '/summary')).body as any).overnightTonight === before - 1);
r = await call('PUT', `/trips/${tripId}`, tripBody);
expect('취소한 여행은 수정 409', r.status === 409 && (r.body as any).error === 'trip_cancelled', r);
r = await call('POST', `/trips/${tripId}/status`, { status: 'open' });
expect('취소한 여행은 되돌리지 않음 409', r.status === 409 && (r.body as any).error === 'trip_cancelled', r);
expect('없는 여행 404', (await call('GET', '/trips/nope')).status === 404);
at('2026-11-20T10:00:00');
trl = (await call('GET', '/trips', null, 'tab=past')).body as any;
expect('지난 여행 탭', trl.tab === 'past' && trl.counts.past === 1 && trl.rows.length === 1, trl.counts);

// ── 카드키 QR: 학생 앱이 만든 값을 가드 태블릿이 읽는다
at('2026-11-21T19:00:00');
await call('PUT', '/settings', { curfew: '23:00', guards: [] });
const [Q1, Q2] = [...new Set(cur.filter((x) => x.campus === campus && !taken.has(x.stId) && x.stId !== F && x.stId !== G).map((x) => x.stId))];
const qr1 = (await keycardCode(KSECRET, Q1, clock)).code;
r = await call('POST', '/guard/scan', { code: qr1, mode: 'out', campus });
expect('QR 로 외출 201, 찍은 방법 qr', r.status === 201 && (r.body as any).row.stId === Q1 && (r.body as any).row.outVia === 'qr', r);
clock += 90_000; // 1분 30초 뒤: 직전 창이라 아직 받음
r = await call('POST', '/guard/scan', { code: qr1, mode: 'in', campus });
expect('직전 창 QR 로 귀가 200, inVia qr', r.status === 200 && (r.body as any).row.inVia === 'qr', r);
clock += 60_000; // 2분 넘게 지난 QR
r = await call('POST', '/guard/scan', { code: qr1, mode: 'out', campus });
expect('오래된 QR 400 qr_expired', r.status === 400 && (r.body as any).error === 'qr_expired', r);
r = await call('POST', '/guard/scan', { code: (await keycardCode('x'.repeat(64), Q2, clock)).code, mode: 'out', campus });
expect('다른 비밀 값으로 만든 QR 400 invalid_qr', r.status === 400 && (r.body as any).error === 'invalid_qr', r);
r = await call('POST', '/guard/scan', { code: Q2, mode: 'out', campus });
expect('학생번호 직접 입력 201, 찍은 방법 number', r.status === 201 && (r.body as any).row.outVia === 'number', r);
r = await handleIntranetApi({ ...ctx, keycardSecret: undefined }, 'POST', '/guard/scan', new URLSearchParams(), { code: (await keycardCode(KSECRET, Q2, clock)).code, mode: 'in', campus });
expect('비밀 값이 없는 서버는 QR 503', r.status === 503 && (r.body as any).error === 'qr_unavailable', r);
r = await call('POST', '/guard/report', { code: qr1, campus, kind: 'other', note: 'QR 로 리포트(만료된 QR 도 누구인지는 앎)' });
expect('리포트는 만료된 QR 로도 학생 확인', r.status === 201 && (r.body as any).report.stId === Q1, r);
const og = ((await call('GET', '/outings', null, 'date=2026-11-21')).body as any).rows;
expect('외출 목록에 찍은 방법', og.some((x: any) => x.stId === Q1 && x.outVia === 'qr' && x.inVia === 'qr') && og.some((x: any) => x.stId === Q2 && x.outVia === 'number'), og.map((x: any) => [x.stId, x.outVia, x.inVia]));
void KEYCARD_PERIOD;

// ── 학생 계정 관리: 로컬은 안내만, 배포(AccountAdmin)는 만들기·초기화·접근 기록
r = await call('GET', '/accounts');
expect('로컬: 학생 계정 없음 안내', (r.body as any).available === false && (r.body as any).reason === 'local', r.body);
expect('로컬: 만들기 503', (await call('POST', '/accounts/create', {})).status === 503);
const authU = new Map<string, { id: string; email: string; password: string; lastSignIn: string | null }>();
const linkedA = new Map<string, LinkedAccount>();
let failNext = '';
const admin: AccountAdmin = {
  linked: async () => [...linkedA.values()].map((a) => ({ ...a })),
  authUsers: async () => [...authU.values()].map((u) => ({ id: u.id, email: u.email, lastSignIn: u.lastSignIn })),
  async create(email, password) {
    if (failNext && email.startsWith(failNext)) throw new Error('POST /auth/v1/admin/users 500: boom');
    const id = 'u-' + email;
    authU.set(id, { id, email, password, lastSignIn: null });
    return id;
  },
  async link(userId, stNo) {
    linkedA.set(stNo, { stNo, userId, mustChangePassword: true });
  },
  async resetPassword(userId, stNo, password) {
    authU.get(userId)!.password = password;
    linkedA.get(stNo)!.mustChangePassword = true;
  },
};
const actx = { ...ctx, actor: '오피스 김', accounts: admin, studentEmailDomain: 'students.jic.internal' };
const acall = (m: string, p: string, body: any = null, q = '') => handleIntranetApi(actx, m, p, new URLSearchParams(q), body);
let al = (await acall('GET', '/accounts')).body as any;
const targetN = al.rows.length;
expect('계정 목록: 대상 = 재학·입학 예정 학생, 처음엔 모두 계정 없음', al.available === true && targetN > 0 && al.counts.none + al.counts.no_birthday === targetN && al.batch === 8, al.counts);
// 지난 실행이 계정만 만들고 끊긴 학생 하나: 잇기만 한다
const half = al.rows[1].stId;
authU.set('u-half', { id: 'u-half', email: `${half}@students.jic.internal`, password: 'x', lastSignIn: null });
// 만드는 순서는 학생번호 순: 그 첫 학생이 실패하게
const failId = al.rows.filter((x: any) => x.status === 'none' && x.stId !== half).map((x: any) => x.stId).sort()[0];
failNext = failId + '@';
r = await acall('POST', '/accounts/create', {});
let cr = r.body as any;
expect('한 번에 8명까지(잇기 먼저, 실패는 학생번호와 오류만)', r.status === 200 && cr.linked === 7 && cr.created === 6 && cr.failed.length === 1 && cr.failed[0].stId === failId && cr.remaining === al.counts.none - 8, cr);
expect('계정만 있던 학생은 새로 안 만들고 이음', linkedA.get(half)?.userId === 'u-half', linkedA.get(half));
expect('비밀번호 = 생년월일 8자리', [...authU.values()].some((u) => /^\d{8}$/.test(u.password)));
failNext = '';
for (let i = 0; i < 100 && cr.remaining > 0; i++) cr = (await acall('POST', '/accounts/create', {})).body;
al = (await acall('GET', '/accounts')).body as any;
expect('남은 수가 0이 될 때까지 부르면 모두 생김(실패했던 학생 포함)', al.counts.none === 0 && al.counts.pending === targetN - al.counts.no_birthday, al.counts);
// 학생이 비밀번호를 바꾸고 로그인함 → 사용 중
const one = al.rows[0];
linkedA.get(one.stId)!.mustChangePassword = false;
authU.get(linkedA.get(one.stId)!.userId)!.lastSignIn = '2026-11-20T01:00:00Z';
al = (await acall('GET', '/accounts', null, 'status=active')).body as any;
expect('사용 중 탭: 마지막 로그인', al.rows.length === 1 && al.rows[0].stId === one.stId && al.rows[0].lastSignIn === '2026-11-20T01:00:00Z', al.rows);
r = await acall('POST', `/accounts/${one.stId}/reset`, {});
expect('비밀번호 초기화: 다시 첫 비밀번호 변경 전', r.status === 200 && (r.body as any).status === 'pending' && linkedA.get(one.stId)!.mustChangePassword === true, r);
expect('없는 학생 404', (await acall('POST', '/accounts/99999999/reset', {})).status === 404);
const auditRows = (await stores.audit.all()).filter((x: any) => x.target === 'student_account');
expect('접근 기록: 만들기·초기화(처리자 이름)', auditRows.some((x: any) => x.action === 'password_reset' && x.stId === one.stId && x.actor === '오피스 김') && auditRows.filter((x: any) => x.action === 'account_create').length === targetN - al.counts.no_birthday, auditRows.length);
const auA = (await acall('GET', '/audit')).body as any;
expect('접근 기록 목록에 학생 계정', auA.rows.some((x: any) => x.target === 'student_account' && x.action === 'password_reset'), auA.rows.slice(0, 2));
r = await handleIntranetApi({ ...ctx, accountsUnavailable: 'server_config' }, 'GET', '/accounts', new URLSearchParams(), null);
expect('서비스 키 없는 배포: 안내', (r.body as any).available === false && (r.body as any).reason === 'server_config', r.body);

// ── 가드 계정 관리: 로컬은 안내, 배포(GuardAdmin)는 만들기·비밀번호·지우기·접근 기록
r = await call('GET', '/guard-accounts');
expect('로컬: 가드 계정 없음 안내', (r.body as any).available === false && (r.body as any).reason === 'local', r.body);
const gstore = new Map<string, GuardAccount & { password: string }>();
const gadmin: GuardAdmin = {
  list: async () => [...gstore.values()].map(({ password: _p, ...g }) => g),
  async create({ email, password, campus: c, label }) {
    if ([...gstore.values()].some((g) => g.email === email)) throw new AccountAdminError(422, 'POST /auth/v1/admin/users 422: email_exists');
    const id = 'g-' + gstore.size;
    gstore.set(id, { userId: id, email, campus: c, label, createdAt: null, lastSignIn: null, password });
    return id;
  },
  async setPassword(id, password) {
    gstore.get(id)!.password = password;
  },
  async remove(id) {
    gstore.delete(id);
  },
};
const gctx = { ...ctx, actor: '오피스 김', guardAdmin: gadmin };
const gcall = (m: string, p: string, body: any = null): Promise<any> => handleIntranetApi(gctx, m, p, new URLSearchParams(), body);
const gbody = { label: 'Challenger 정문', campus, email: 'Gate-C@JIC.example', password: 'gate2026', confirm: 'gate2026' };
expect('출입구 이름 필수', (await gcall('POST', '/guard-accounts', { ...gbody, label: ' ' })).body.error === 'invalid_label');
expect('없는 캠퍼스', (await gcall('POST', '/guard-accounts', { ...gbody, campus: 'Busan' })).body.error === 'invalid_campus');
expect('이메일 모양', (await gcall('POST', '/guard-accounts', { ...gbody, email: 'gate' })).body.error === 'invalid_email');
expect('비밀번호 영문+숫자', (await gcall('POST', '/guard-accounts', { ...gbody, password: 'abcdefgh', confirm: 'abcdefgh' })).body.error === 'pw_weak');
expect('비밀번호 확인', (await gcall('POST', '/guard-accounts', { ...gbody, confirm: 'gate2027' })).body.error === 'pw_mismatch');
r = await gcall('POST', '/guard-accounts', gbody);
expect('가드 계정 만들기 201(이메일 소문자)', r.status === 201 && (r.body as any).email === 'gate-c@jic.example', r);
const gid = (r.body as any).userId;
expect('같은 이메일 409', (await gcall('POST', '/guard-accounts', gbody)).body.error === 'email_exists');
let gl = (await gcall('GET', '/guard-accounts')).body as any;
expect('목록: 출입구·캠퍼스·이메일', gl.available && gl.rows.length === 1 && gl.rows[0].label === 'Challenger 정문' && gl.rows[0].campus === campus && gl.campuses.includes(campus), gl);
expect('비밀번호 바꾸기: 규칙 확인', (await gcall('POST', `/guard-accounts/${gid}/password`, { password: 'short1', confirm: 'short1' })).body.error === 'pw_short');
r = await gcall('POST', `/guard-accounts/${gid}/password`, { password: 'newgate2026', confirm: 'newgate2026' });
expect('비밀번호 바꾸기 200', r.status === 200 && gstore.get(gid)!.password === 'newgate2026', r);
expect('가드가 아닌 계정 id 는 404(직원·학생 비밀번호를 못 바꿈)', (await gcall('POST', '/guard-accounts/u-staff/password', { password: 'x1234567', confirm: 'x1234567' })).status === 404);
r = await gcall('POST', `/guard-accounts/${gid}/delete`, {});
expect('지우기 200', r.status === 200 && gstore.size === 0, r);
const gaud = (await stores.audit.all()).filter((x: any) => x.target === 'guard_account');
expect('접근 기록: 만들기·비밀번호·지우기(출입구 이름)', ['guard_create', 'guard_password', 'guard_delete'].every((a) => gaud.some((x: any) => x.action === a && x.targetId === 'Challenger 정문' && x.actor === '오피스 김')), gaud.map((x: any) => x.action));

// ── 무단결석: 강사 포털 출석(마감된 날의 결석)에서 후보를 만든다
at('2026-11-25T10:00:00');
const usedW = new Set([A, B, C, D, E]);
const [W1, W2, W3, W4, W5] = [...new Set(cur.map((x) => x.stId))].filter((x) => !usedW.has(x)).slice(-5);
const mark = (stId: string, day: string, time: string, extra: Partial<AbsenceMark> = {}): AbsenceMark => ({ stId, day, time, campus, subject: '', excused: false, closed: true, ...extra });
let marks: AbsenceMark[] = [
  mark(W1, '2026-11-24', '10:00', { subject: 'Speaking' }),
  mark(W1, '2026-11-24', '08:00', { subject: 'Grammar' }),
  mark(W1, '2026-11-24', '13:00', { excused: true }),
  mark(W2, '2026-11-24', '08:00', { closed: false }),
  mark(W3, '2026-11-24', '08:00'),
  mark(W3, '2026-11-23', '09:00', { subject: 'Writing' }),
  mark(W4, '2026-11-24', '08:00'),
  mark(W5, '2026-11-24', '08:00'),
  mark(W5, '2026-10-01', '08:00'),
];
let asked: string[] = [];
stores.attendance = { absences: async (from, to) => { asked = [from, to]; return marks.filter((m) => m.day >= from && m.day <= to); } };
await stores.absences.put(req('abW3a', W3, { date: '2026-11-24', periods: [], kind: 'sick', status: 'approved' }) as Absence);
await stores.absences.put(req('abW3b', W3, { date: '2026-11-23', periods: [2], kind: 'personal', status: 'rejected' }) as Absence);
await stores.absences.put(req('abW4', W4, { date: '2026-11-24', periods: [1], kind: 'sick' }) as Absence);
await stores.absences.put(req('abW5', W5, { date: '2026-11-24', periods: [], kind: 'sick', status: 'cancelled' }) as Absence);
await stores.trips.putTrip({ id: 'tripW', campus: '', title: '바기오 시티 투어', place: 'Baguio', meeting: '', description: '', start: '2026-11-24', end: '2026-11-24', deadline: '2026-11-20', capacity: 30, cost: 0, status: 'open', createdAt: '', updatedAt: '', createdBy: null, taken: 0 });
await stores.trips.putSignup({ id: 'sgW', tripId: 'tripW', stId: W5, trId: '', status: 'applied', createdAt: '', updatedAt: '', reason: null, handledAt: null, handledBy: null });
const absRows = async () => ((await call('GET', '/penalties')).body as any).rows.filter((x: any) => x.source === 'attendance');
let ar = await absRows();
expect('무단결석: 지난 31일만 묻는다', asked[0] === '2026-10-26' && asked[1] === '2026-11-25', asked);
const w1 = ar.find((x: any) => x.stId === W1);
expect('무단결석 후보: 학생·날짜당 한 건, 사유 인정 수업 빼고 시각 순', w1 && w1.id === `absence-${W1}-2026-11-24` && w1.kind === 'absence' && w1.kindName === '무단결석' && w1.date === '2026-11-24' && w1.campus === campus && w1.basis === '수업 결석 2회(08:00 Grammar, 10:00 Speaking)', ar);
expect('마감 전인 날은 후보 없음', !ar.some((x: any) => x.stId === W2), ar);
expect('승인된 결석 신청이 있는 날은 후보 없음', !ar.some((x: any) => x.stId === W3 && x.date === '2026-11-24'), ar);
const w3 = ar.find((x: any) => x.stId === W3 && x.date === '2026-11-23');
expect('반려된 신청은 후보 + 근거에 반려', w3?.basis === '수업 결석 1회(09:00 Writing), 결석 신청 반려', ar);
expect('처리 전 신청이 있으면 처리될 때까지 후보 없음', !ar.some((x: any) => x.stId === W4), ar);
expect('학교 여행 참가 날은 후보 없음(취소한 신청은 상관없음), 기간 밖 결석도 없음', !ar.some((x: any) => x.stId === W5), ar);
expect('여러 번 불러도 같은 결과', (await absRows()).length === 2 && ar.length === 2);
// 자동 확인(크론, 11/9 결정 I3): 화면을 열지 않아도 같은 후보를 만든다. 업체 원본(db) 없이, 여러 번 돌려도 같은 결과
const penSnap = async () => JSON.stringify((await stores.penalties.all()).map((p) => [p.id, p.basis, p.status, p.campus]).sort());
const snapBefore = await penSnap();
await stores.penalties.remove(`absence-${W1}-2026-11-24`);
const sc = await scheduledChecks({ stores, now: ctx.now, newId: ctx.newId });
const pendingNow = (await stores.penalties.all()).filter((p) => p.status === 'pending');
expect('자동 확인: 지운 후보를 다시 만들고 화면과 같은 결과', (await penSnap()) === snapBefore, sc);
expect('자동 확인: 대기 중 자동 후보 수', sc.absence === 2 && sc.curfew === pendingNow.filter((p) => p.source === 'outing').length, sc);
expect('자동 확인: 여러 번 돌려도 같은 결과', JSON.stringify(await scheduledChecks({ stores, now: ctx.now, newId: ctx.newId })) === JSON.stringify(sc) && (await penSnap()) === snapBefore);
r = await call('POST', '/requests/absences/decide', { ids: ['abW4'], approve: false, comment: '진단서 없음' });
expect('신청을 반려하면 후보가 생김', r.status === 200 && (await absRows()).some((x: any) => x.stId === W4 && x.basis.endsWith('결석 신청 반려')), r);
marks = marks.map((m) => (m.stId === W1 && m.time === '10:00' ? { ...m, excused: true } : m));
expect('사유 인정하면 근거를 다시 계산', (await absRows()).find((x: any) => x.stId === W1)?.basis === '수업 결석 1회(08:00 Grammar)');
r = await call('POST', '/penalties/decide', { ids: [w3.id], approve: true });
expect('무단결석 승인', r.status === 200 && (r.body as any).done === 1, r);
marks = marks.map((m) => (m.stId === W1 || m.stId === W3 ? { ...m, excused: true } : m));
ar = await absRows();
expect('모두 사유 인정되면 대기 후보는 지워짐', !ar.some((x: any) => x.stId === W1), ar);
const apl = ((await call('GET', '/penalties', null, 'tab=approved')).body as any).rows;
expect('처리된 후보는 그대로', apl.some((x: any) => x.id === w3.id && x.status === 'approved'), apl);
const sfW = (await call('GET', `/students/${W4}`)).body as any;
expect('Student File 에 무단결석 후보', sfW.penalties?.some((x: any) => x.kind === 'absence' && x.date === '2026-11-24'), sfW.penalties);
expect('홈 요약 승인 대기에 무단결석 포함', ((await call('GET', '/summary')).body as any).pending >= 1);
stores.attendance = { absences: async () => { throw new Error('rpc/intranet_absence_marks 404'); } };
const warn = console.warn;
console.warn = () => {};
r = await call('GET', '/penalties');
const smX = await call('GET', '/summary');
console.warn = warn;
expect('출석을 못 읽어도 패널티·홈은 열리고 대기 후보는 그대로', r.status === 200 && smX.status === 200 && (r.body as any).rows.some((x: any) => x.stId === W4 && x.source === 'attendance'), r.status);
delete stores.attendance;

// ── 직원 역할(docs/roles.md): 점수표 쓰기·접근 기록은 관리자만, 오피스의 Student File 은 맡은 캠퍼스만
const otherSt = cur.find((x) => x.campus !== campus)!;
const asRole = (staffRole: 'admin' | 'office', campuses: string[] | null) => {
  const rctx = { ...ctx, session: { role: 'staff' as const, staffRole, campuses } };
  return (m: string, p: string, body: any = null, q = ''): Promise<any> => handleIntranetApi(rctx, m, p, new URLSearchParams(q), body);
};
const asOffice = asRole('office', [campus]);
let rr: any;
const asAdmin = asRole('admin', null);
let mo = (await asOffice('GET', '/meta')).body;
expect('meta: 오피스·맡은 캠퍼스', mo.staffRole === 'office' && mo.campuses.join() === campus, mo);
const metaLocal = (await call('GET', '/meta')).body as any;
expect('meta: 로컬(로그인 없음)은 관리자', metaLocal.staffRole === 'admin' && metaLocal.campuses === null, metaLocal);
const rulesNow = (await asOffice('GET', '/penalty-rules')).body;
expect('오피스: 점수표 읽기', Array.isArray(rulesNow.kinds));
rr = await asOffice('PUT', '/penalty-rules', rulesNow);
expect('오피스: 점수표 저장 403 admin_only', rr.status === 403 && rr.body.error === 'admin_only', rr);
expect('관리자: 점수표 저장 200', (await asAdmin('PUT', '/penalty-rules', rulesNow)).status === 200);
rr = await asOffice('GET', '/audit');
expect('오피스: 접근 기록 403', rr.status === 403 && rr.body.error === 'admin_only', rr);
expect('관리자: 접근 기록 200', (await asAdmin('GET', '/audit')).status === 200);
const sfo = (await asOffice('GET', '/students')).body;
expect('오피스: Student File 목록은 맡은 캠퍼스만', sfo.rows.length > 0 && sfo.rows.every((x: any) => x.campus === campus) && sfo.campuses.join() === campus, sfo.campuses);
expect('관리자: 모든 캠퍼스', (await asAdmin('GET', '/students')).body.campuses.length > 1);
rr = await asOffice('GET', `/students/${otherSt.stId}`);
expect('오피스: 다른 캠퍼스 학생 상세 403', rr.status === 403 && rr.body.error === 'campus_forbidden', [rr.status, otherSt.campus]);
expect('오피스: 맡은 캠퍼스 학생 상세 200', (await asOffice('GET', `/students/${sfo.rows[0].stId}`)).status === 200);
expect('오피스(모든 캠퍼스): 다른 캠퍼스도 200', (await asRole('office', null)('GET', `/students/${otherSt.stId}`)).status === 200);
expect('오피스: 패널티 승인·외출 목록은 그대로', (await asOffice('GET', '/penalties')).status === 200 && (await asOffice('GET', '/outings')).status === 200);
for (const [m, p] of [['GET', '/guard-accounts'], ['POST', '/guard-accounts'], ['POST', '/guard-accounts/g-1/password'], ['POST', '/guard-accounts/g-1/delete']]) {
  rr = await asOffice(m, p, {});
  expect(`오피스: 가드 계정 ${m} ${p} 는 관리자만(I4)`, rr.status === 403 && rr.body.error === 'admin_only', rr);
}
expect('오피스: 학생 계정은 그대로(I4)', (await asOffice('GET', '/accounts')).status === 200);
expect('관리자: 가드 계정 열림', (await asAdmin('GET', '/guard-accounts')).status === 200);

// ── 매니저(강사 포털 manager, docs/roles.md): 인트라넷 일부만, 패널티 승인은 무단결석만, Student File 은 맡은 캠퍼스
const mctx = { ...ctx, actor: '매니저 M', session: { role: 'manager' as const, campuses: [campus] } };
const mcall = (m: string, p: string, body: any = null, q = ''): Promise<any> => handleIntranetApi(mctx, m, p, new URLSearchParams(q), body);
const mm = (await mcall('GET', '/meta')).body;
expect('매니저 meta: 역할·캠퍼스, 직원 역할 없음', mm.role === 'manager' && mm.staffRole === null && mm.campuses.join() === campus, mm);
for (const [m, p] of [['GET', '/summary'], ['GET', '/outings'], ['GET', '/reports'], ['GET', '/penalties'], ['GET', '/penalty-rules'], ['GET', '/requests/absences'], ['GET', '/trips'], ['GET', '/notices'], ['GET', '/students'], ['GET', '/counseling']]) {
  const x = await mcall(m, p);
  expect(`매니저 열림: ${m} ${p}`, x.status === 200, [x.status, x.body]);
}
for (const [m, p, b] of [['GET', '/requests/overnights'], ['GET', '/requests/life'], ['GET', '/departures'], ['GET', '/settings'], ['PUT', '/settings', { curfew: '23:00', guards: [] }], ['PUT', '/penalty-rules', rulesNow], ['GET', '/audit'], ['GET', '/accounts'], ['GET', '/guard-accounts'], ['POST', '/trips', {}], ['POST', '/guard/scan', {}], ['POST', '/requests/overnights/decide', {}]] as [string, string, any?][]) {
  const x = await mcall(m, p, b ?? null);
  expect(`매니저 막힘: ${m} ${p}`, x.status === 403 && x.body.error === 'manager_forbidden', [x.status, x.body]);
}
const mpl = (await mcall('GET', '/penalties')).body.rows as any[];
const mAbs = mpl.find((x) => x.kind === 'absence' && x.status === 'pending');
const mOther = mpl.find((x) => x.kind !== 'absence' && x.status === 'pending');
expect('매니저: 무단결석만 승인 가능 표시', !!mAbs && mAbs.canDecide === true && !!mOther && mOther.canDecide === false, mpl.map((x) => [x.kind, x.status, x.canDecide]));
expect('직원은 모든 대기 건 승인 가능 표시', ((await call('GET', '/penalties')).body as any).rows.every((x: any) => x.canDecide));
rr = await mcall('POST', '/penalties/decide', { ids: [mOther.id], approve: true });
expect('매니저: 무단결석 아닌 건 승인 403', rr.status === 403 && rr.body.error === 'manager_absence_only', rr);
rr = await mcall('POST', '/penalties/decide', { ids: [mAbs.id, mOther.id], approve: false });
expect('매니저: 섞어 보내도 403(아무것도 바꾸지 않음)', rr.status === 403 && (await mcall('GET', '/penalties')).body.rows.some((x: any) => x.id === mAbs.id && x.status === 'pending'));
// 다른 캠퍼스 학생의 무단결석 후보(같은 날 같은 결석): 매니저는 보기만 한다(I5)
const mAbsRow = (await stores.penalties.all()).find((x) => x.id === mAbs.id)!;
const attBefore = stores.attendance;
const farMarks = marks.filter((m) => m.stId === mAbsRow.stId && m.day === mAbsRow.date).map((m) => ({ ...m, stId: otherSt.stId, campus: otherSt.campus }));
stores.attendance = { absences: async (from, to) => [...marks, ...farMarks].filter((m) => m.day >= from && m.day <= to) };
const farId = `absence-${otherSt.stId}-${mAbsRow.date}`;
const mFar = ((await mcall('GET', '/penalties')).body.rows as any[]).find((x) => x.id === farId);
expect('매니저: 다른 캠퍼스 무단결석은 승인 불가 표시(I5)', mFar && mFar.campus === otherSt.campus && mFar.canDecide === false, mFar);
rr = await mcall('POST', '/penalties/decide', { ids: [mAbs.id, farId], approve: true });
expect('매니저: 다른 캠퍼스 무단결석 승인 403(아무것도 바꾸지 않음)', rr.status === 403 && rr.body.error === 'campus_forbidden' && (await stores.penalties.all()).filter((x) => [mAbs.id, farId].includes(x.id)).every((x) => x.status === 'pending'), rr);
const mAll = { ...mctx, session: { role: 'manager' as const, campuses: null } };
expect('매니저(모든 캠퍼스): 다른 캠퍼스도 승인 가능 표시', ((await handleIntranetApi(mAll, 'GET', '/penalties', new URLSearchParams(), null)).body as any).rows.find((x: any) => x.id === farId)?.canDecide === true);
farMarks.length = 0;
await call('GET', '/penalties'); // 결석이 사라지면 대기 후보도 지워진다
expect('다른 캠퍼스 후보 정리', !(await stores.penalties.all()).some((x) => x.id === farId));
stores.attendance = attBefore;
rr = await mcall('POST', '/penalties/decide', { ids: [mAbs.id], approve: true });
expect('매니저: 무단결석 승인', rr.status === 200 && rr.body.done === 1, rr);
const msf = (await mcall('GET', '/students')).body;
expect('매니저: Student File 은 맡은 캠퍼스만', msf.rows.length > 0 && msf.rows.every((x: any) => x.campus === campus), msf.campuses);
rr = await mcall('GET', `/students/${otherSt.stId}`);
expect('매니저: 다른 캠퍼스 학생 상세 403', rr.status === 403 && rr.body.error === 'campus_forbidden', rr.status);
rr = await mcall('POST', '/notices', { title: '매니저 공지', content: '수업 시간 변경' });
const mNotice = rr.body.id;
expect('매니저: 공지 쓰기', rr.status === 201 && !!mNotice, rr);
expect('매니저: 자기 공지 고치기', (await mcall('PUT', `/notices/${mNotice}`, { title: '매니저 공지(수정)', content: '수업 시간 변경' })).status === 200);
const others = (await stores.notices.all()).find((n) => n.author !== '매니저 M')!;
rr = await mcall('PUT', `/notices/${others.id}`, { title: 'x', content: 'y' });
expect('매니저: 남의 공지 고치기 403', rr.status === 403 && rr.body.error === 'own_notice_only', rr);
// 공지 대상 역할(11/10 결정 I14): 관리자는 모두, 오피스·매니저는 대상이 비었거나 자기 역할이 든 공지만
rr = (await call('POST', '/notices', { title: '오피스 공지', content: '회계 마감', roles: ['office'] })) as any;
const nOffice = rr.body.id;
expect('관리자: 오피스 대상 공지 쓰기', rr.status === 201 && !!nOffice, rr);
expect('잘못된 역할 400', ((await call('POST', '/notices', { title: 't', content: 'c', roles: ['teacher'] })).body as any).error === 'invalid_roles');
rr = (await call('POST', '/notices', { title: '모두', content: 'c', roles: ['manager', 'admin', 'office'] })) as any;
expect('세 역할을 다 고르면 모든 역할(빈 배열)로 저장', (await stores.notices.all()).find((n) => n.id === rr.body.id)?.roles.length === 0, rr);
const ml = (await mcall('GET', '/notices')).body;
expect('매니저: 오피스 대상 공지는 목록에 없음, 역할 목록은 3개', !ml.rows.some((n: any) => n.id === nOffice) && ml.roles.length === 3, ml.rows.map((n: any) => n.title));
expect('매니저: 오피스 대상 공지 상세 404', (await mcall('GET', `/notices/${nOffice}`)).status === 404);
const ol2 = (await asOffice('GET', '/notices')).body;
expect('오피스: 오피스 대상 공지가 보이고 대상 표시', ol2.rows.find((n: any) => n.id === nOffice)?.roles.join() === 'office', ol2.rows.map((n: any) => [n.title, n.roles]));
expect('관리자: 모든 공지', ((await call('GET', '/notices')).body as any).rows.some((n: any) => n.id === nOffice));
await stores.absences.put(req('abM', A, { date: '2026-11-26', periods: [], kind: 'sick' }) as Absence);
rr = await mcall('POST', '/requests/absences/decide', { ids: ['abM'], approve: true, comment: '진단서 확인' });
expect('매니저: 결석 신청 승인', rr.status === 200 && (await stores.absences.get('abM'))?.status === 'approved', rr);

// ── Student File '수업 출석': 강사 포털 출석(지난 30일) 합계와 결석·지각 목록, 사유는 사유 인정 → 신청 승인 → 처리 전 → 무단
at('2026-11-25T10:00:00');
const SA = cur.find((x) => x.campus === campus)!.stId;
const arow = (day: string, time: string, result: AttendanceRow['result'], extra: Partial<AttendanceRow> = {}): AttendanceRow => ({ day, time, campus, subject: 'Grammar', teacher: 'Ben', room: '201', result, lateMin: null, excused: false, ...extra });
let askedRows: string[] = [];
stores.attendance = {
  absences: async () => [],
  studentRows: async (st, from, to) => {
    askedRows = [st, from, to];
    return [
      arow('2026-11-24', '08:00', 'AT'),
      arow('2026-11-24', '10:00', 'TA', { lateMin: 7 }),
      arow('2026-11-23', '08:00', 'AB', { excused: true }),
      arow('2026-11-20', '08:00', 'AB'),
      arow('2026-11-21', '08:00', 'AB'),
      arow('2026-11-22', '13:00', 'AB', { subject: 'Speaking', teacher: 'Ann' }),
      arow('2026-11-25', '13:00', null),
    ];
  },
};
await stores.absences.put(req('abSA1', SA, { date: '2026-11-20', periods: [], kind: 'sick', status: 'approved' }) as Absence);
await stores.absences.put(req('abSA2', SA, { date: '2026-11-21', periods: [1], kind: 'official' }) as Absence);
await stores.absences.put(req('abSA3', SA, { date: '2026-11-22', periods: [], kind: 'personal', status: 'rejected' }) as Absence);
let sfa = ((await call('GET', `/students/${SA}`)).body as any).attendance;
expect('Student File 출석: 지난 30일을 그 학생으로 묻는다', askedRows.join() === `${SA},2026-10-27,2026-11-25`, askedRows);
expect('Student File 출석: 합계', JSON.stringify(sfa.counts) === JSON.stringify({ sessions: 7, present: 1, late: 1, absent: 4, unchecked: 1, excused: 1, requested: 1, pendingRequest: 1, unexcused: 1, lateMin: 7 }), sfa.counts);
expect('Student File 출석: 결석·지각만 최근순, 사유(인정·승인·처리 전·무단, 반려는 무단)', sfa.rows.map((r: any) => `${r.day}/${r.result}/${r.reason}/${r.requestKind ?? ''}`).join(' ') === '2026-11-24/TA/null/ 2026-11-23/AB/excused/ 2026-11-22/AB/unexcused/ 2026-11-21/AB/pending/official 2026-11-20/AB/requested/sick', sfa.rows);
stores.attendance = { absences: async () => [], studentRows: async () => { throw new Error('rpc 404'); } };
const warn2 = console.warn;
console.warn = () => {};
rr = await call('GET', `/students/${SA}`);
console.warn = warn2;
expect('Student File 출석: 못 읽으면 출석만 비우고 나머지는 그대로', rr.status === 200 && rr.body.attendance === null && Array.isArray(rr.body.penalties), rr.status);
delete stores.attendance;
expect('Student File 출석: 출석 자료가 없으면 null', ((await call('GET', `/students/${SA}`)).body as any).attendance === null);

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
