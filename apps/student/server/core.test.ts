/**
 * 학생 앱 core 시험: 가짜 시계와 메모리 저장소로 결석·외박 신청 규칙을 확인한다.
 * 실행: npm --workspace apps/student run test (빌드할 때도 함께 돈다). 샘플 데이터(data-sample)만 쓴다.
 */
import path from 'node:path';
import { loadDir } from '../../admin/server/localData';
import { handleStudentApi } from './core';
import { decideRequest, overnightFor, type Absence, type Overnight, type RequestStore } from './requests';

function memStore<T extends { id: string; stId: string }>(): RequestStore<T> {
  const m = new Map<string, T>();
  return {
    async listAll() {
      return [...m.values()];
    },
    async listByStudent(stId) {
      return [...m.values()].filter((x) => x.stId === stId);
    },
    async get(id) {
      return m.get(id) ?? null;
    },
    async put(x) {
      m.set(x.id, { ...x });
    },
  };
}

const db = loadDir(path.resolve(process.cwd(), '../../data-sample/tables'));
const store = memStore<Absence>();
const overnights = memStore<Overnight>();
let n = 0;
const now = new Date('2026-11-08T02:00:00Z');
const stId = '30095'; // 샘플: 재학 2026-07-26 ~ 2026-11-13
const ctx = (who: string | null = stId) => ({ db, store, overnights, stId: who, localLogin: true, now: () => now, newId: () => 'r' + ++n });
const call = (m: string, p: string, body: unknown = null, who: string | null = stId) => handleStudentApi(ctx(who), m, p, body);
let fails = 0;
const expect = (label: string, cond: boolean, extra?: unknown) => {
  if (!cond) fails++;
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label + (cond ? '' : ' ' + JSON.stringify(extra)));
};
const err = (r: { body: unknown }) => (r.body as { error?: string }).error;

// 결석
let r = await call('POST', '/absences', { date: '2026-11-10', kind: 'sick', periods: [], reason: '감기' });
expect('결석 신청 201', r.status === 201, r);
const absId = (r.body as Absence).id;
r = await call('POST', '/absences', { date: '2026-11-10', kind: 'official', periods: [3], reason: 'x' });
expect('같은 날 종일과 겹침 409', r.status === 409 && err(r) === 'duplicate', r);
r = await call('POST', '/absences', { date: '2026-11-20', kind: 'sick', reason: 'x' });
expect('연수 기간 밖 400', err(r) === 'date_out_of_range', r);
r = await call('POST', '/absences', { date: '2026-02-30', kind: 'sick', reason: 'x' });
expect('없는 날짜 400', err(r) === 'invalid_date', r);
r = await call('GET', '/absences', null, null);
expect('로그인 없이 401', r.status === 401, r);

// 외박
r = await call('POST', '/overnights', { from: '2026-11-08', until: '2026-11-10', reason: '마닐라 친척 집' });
expect('외박 신청 201', r.status === 201, r);
const ovId = (r.body as Overnight).id;
r = await call('POST', '/overnights', { from: '2026-11-09', until: '2026-11-11', reason: 'x' });
expect('밤이 겹치는 외박 409', r.status === 409 && err(r) === 'duplicate', r);
r = await call('POST', '/overnights', { from: '2026-11-10', until: '2026-11-11', reason: '복귀일 밤부터는 안 겹침' });
expect('복귀일 밤부터는 겹치지 않음 201', r.status === 201, r);
r = await call('POST', '/overnights', { from: '2026-11-12', until: '2026-11-12', reason: 'x' });
expect('복귀일이 출발일과 같으면 400', err(r) === 'invalid_range', r);
r = await call('POST', '/overnights', { from: '2026-11-13', until: '2026-11-15', reason: 'x' });
expect('마지막 밤(11/14)이 연수 종료(11/13) 뒤면 400', err(r) === 'date_out_of_range', r);
r = await call('POST', '/overnights', { from: '2026-11-12', until: '2026-11-14', reason: '마지막 밤 11/13' });
expect('마지막 밤이 연수 종료일이면 201', r.status === 201, r);
r = await call('POST', '/overnights', { from: '2026-11-11', until: '2026-11-12', reason: '' });
expect('사유 없음 400', err(r) === 'reason_required', r);
r = await call('GET', '/overnights');
const ol = r.body as { rows: (Overnight & { nights: number })[] };
expect('외박 목록 3건, 2박 계산', ol.rows.length === 3 && ol.rows.find((o) => o.id === ovId)?.nights === 2, ol.rows);

// 취소
r = await call('POST', `/overnights/${ovId}/cancel`, {}, '30001');
expect('다른 학생은 취소 못 함 404', r.status === 404, r);
r = await call('POST', `/absences/${absId}/cancel`, {});
expect('본인 결석 취소 200', r.status === 200 && (r.body as Absence).status === 'cancelled', r);

// 담당자 처리(인트라넷이 쓰는 함수)
const ov = (await overnights.get(ovId))!;
const d1 = decideRequest(ov, true, '보호자 확인', null, now);
expect('대기 → 승인', d1.ok && d1.value.status === 'approved' && d1.value.comment === '보호자 확인', d1);
if (d1.ok) await overnights.put(d1.value);
const d2 = decideRequest((await overnights.get(ovId))!, false, null, null, now);
expect('처리된 건 다시 처리 409', !d2.ok && d2.status === 409, d2);
r = await call('POST', `/overnights/${ovId}/cancel`, {});
expect('승인된 외박은 학생이 취소 못 함 409', err(r) === 'not_pending', r);
const all = await overnights.listAll();
expect('11/08 밤 외박 허용', overnightFor(all, stId, '2026-11-08')?.id === ovId);
expect('11/09 밤 외박 허용', overnightFor(all, stId, '2026-11-09')?.id === ovId);
expect('복귀일(11/10) 밤은 허용 아님', overnightFor(all, stId, '2026-11-10') === null);
expect('대기 중 외박은 허용 아님', overnightFor(all, stId, '2026-11-12') === null);

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
