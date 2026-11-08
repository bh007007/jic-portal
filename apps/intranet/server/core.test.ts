/**
 * 인트라넷 core 시험: 가짜 시계와 메모리 저장소로 통금 판정·패널티 흐름을 확인한다.
 * 실행: npm --workspace apps/intranet run test (빌드할 때도 함께 돈다). 샘플 데이터(data-sample)만 쓴다.
 */
import path from 'node:path';
import { loadDir } from '../../admin/server/localData';
import type { Absence, Overnight, RequestStore } from '../../student/server/requests';
import { handleIntranetApi, type Stores } from './core';

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
const stores: Stores = { outings: memRepo(), penalties: memRepo(), settings: memDoc(), rules: memDoc(), absences: memReq<Absence>(), overnights: memReq<Overnight>() };
let clock = Date.parse('2026-11-05T19:02:00+08:00');
let n = 0;
const ctx = { db, stores, now: () => new Date(clock), newId: () => 'o' + ++n };
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

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
