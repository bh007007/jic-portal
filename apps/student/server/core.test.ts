/**
 * 학생 앱 core 시험: 가짜 시계와 메모리 저장소로 결석·외박 신청 규칙을 확인한다.
 * 실행: npm --workspace apps/student run test (빌드할 때도 함께 돈다). 샘플 데이터(data-sample)만 쓴다.
 */
import path from 'node:path';
import { loadDir } from '../../admin/server/localData';
import { checkNewPassword, initialPassword, planAccounts, studentEmail } from './accounts';
import { handleStudentApi } from './core';
import { studentFromToken, tokenCache, tokenSubject } from './supabaseAuth';
import { decideRide, rideState, type Departure, type Ride } from './departures';
import { handleLifeRequest, LIFE_OPEN_MAX, type LifeRequest } from './lifeRequests';
import { ageOn, decideRequest, newOvernight, nightsBetween, overnightFor, type Absence, type Overnight, type RequestStore } from './requests';
import { memoryTripStore, removeSignup, saveTrip, tripPermits, type Trip } from './trips';
import { KEYCARD_PERIOD, keycardCode, readKeycard } from './keycard';
import { mondayOf, type ClassMark, type TimetableSource, type TimetableView } from './timetable';

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
const departures = memStore<Departure>();
const rides = memStore<Ride>();
const life = memStore<LifeRequest>();
const trips = memoryTripStore();
const SECRET = 'a'.repeat(64);
let n = 0;
const now = new Date('2026-11-08T02:00:00Z');
const stId = '30095'; // 샘플: 재학 2026-07-26 ~ 2026-11-13
const ctx = (who: string | null = stId) => ({ db, store, overnights, departures, rides, life, trips, keycardSecret: async () => SECRET, stId: who, localLogin: true, now: () => now, newId: () => 'r' + ++n });
const call = (m: string, p: string, body: unknown = null, who: string | null = stId) => handleStudentApi(ctx(who), m, p, body);
const TRIP = { destination: 'Manila', contact: '+63 917 123 4567' };
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
r = await call('POST', '/absences', { date: '2026-11-04', kind: 'sick', periods: [], reason: '4일 전' });
expect('지난 날짜 4일 전은 400 too_old(11/10 결정 I10)', err(r) === 'too_old', r);
r = await call('POST', '/absences', { date: '2026-11-05', kind: 'sick', periods: [], reason: '3일 전' });
expect('지난 날짜 3일 전은 됨', r.status === 201, r);
expect('결석 화면 정보: 날짜는 3일 전부터', ((await call('GET', '/absences')).body as any).minDate === '2026-11-05');
r = await call('GET', '/absences', null, null);
expect('로그인 없이 401', r.status === 401, r);

// 외박
r = await call('POST', '/overnights', { from: '2026-11-08', until: '2026-11-10', reason: '오늘 출발', ...TRIP });
expect('외박: 오늘 출발은 400(하루 전까지, 11/10 결정 I11)', err(r) === 'too_late', r);
r = await call('POST', '/overnights', { from: '2026-11-09', until: '2026-11-11', reason: '마닐라 친척 집', ...TRIP, accommodation: ' 친척 집 ', companions: '30140, 30140 30095' });
expect('외박 신청 201(성년: 보호자 동의 표시 없이, 표시는 false)', r.status === 201 && (r.body as any).guardianConsent === false, r);
expect('여행 정보 저장: 행선지·숙소·연락처, 동행은 중복·본인 제외', (r.body as any).destination === 'Manila' && (r.body as any).accommodation === '친척 집' && (r.body as any).contact === '+63 917 123 4567' && JSON.stringify((r.body as any).companions) === '["30140"]', r.body);
const ovId = (r.body as Overnight).id;
r = await call('POST', '/overnights', { from: '2026-11-09', until: '2026-11-11', reason: 'x', ...TRIP });
expect('밤이 겹치는 외박 409', r.status === 409 && err(r) === 'duplicate', r);
r = await call('POST', '/overnights', { from: '2026-11-11', until: '2026-11-12', reason: '복귀일 밤부터는 안 겹침', ...TRIP });
expect('복귀일 밤부터는 겹치지 않음 201', r.status === 201, r);
r = await call('POST', '/overnights', { from: '2026-11-12', until: '2026-11-12', reason: 'x', ...TRIP });
expect('복귀일이 출발일과 같으면 400', err(r) === 'invalid_range', r);
r = await call('POST', '/overnights', { from: '2026-11-13', until: '2026-11-15', reason: 'x', ...TRIP });
expect('마지막 밤(11/14)이 연수 종료(11/13) 뒤면 400', err(r) === 'date_out_of_range', r);
r = await call('POST', '/overnights', { from: '2026-11-12', until: '2026-11-14', reason: '마지막 밤 11/13', ...TRIP });
expect('마지막 밤이 연수 종료일이면 201', r.status === 201, r);
r = await call('POST', '/overnights', { from: '2026-11-11', until: '2026-11-12', reason: '', ...TRIP });
expect('사유 없음 400', err(r) === 'reason_required', r);
// 여행 정보(업체 'Outing > Travel')
const bad = (body: object) => call('POST', '/overnights', { from: '2026-11-11', until: '2026-11-12', reason: '주말 여행', ...TRIP, ...body });
expect('행선지 필수', err(await bad({ destination: '  ' })) === 'destination_required');
expect('행선지 100자', err(await bad({ destination: 'x'.repeat(101) })) === 'destination_too_long');
expect('숙소 100자', err(await bad({ accommodation: 'x'.repeat(101) })) === 'accommodation_too_long');
expect('연락처 필수', err(await bad({ contact: '' })) === 'contact_required');
expect('연락처 형식', err(await bad({ contact: 'call me' })) === 'invalid_contact' && err(await bad({ contact: '12345' })) === 'invalid_contact');
expect('없는 동행 학생', err(await bad({ companions: '99999999' })) === 'invalid_companion');
expect('동행 10명까지', err(await bad({ companions: Array.from({ length: 11 }, (_, i) => String(30001 + i)).join(',') })) === 'too_many_companions');
r = await call('GET', '/overnights');
const ol = r.body as { rows: (Overnight & { nights: number })[]; minDate: string; maxNights: number; minor: boolean };
expect('외박 화면 정보: 출발일은 내일부터, 최대 14박, 성년', ol.minDate === '2026-11-09' && ol.maxNights === 14 && ol.minor === false, [ol.minDate, ol.maxNights, ol.minor]);
expect('외박 목록 3건, 2박 계산', ol.rows.length === 3 && ol.rows.find((o) => o.id === ovId)?.nights === 2, ol.rows);

// 외박 규칙 함수(가짜 학생, 샘플에 미성년 재학생이 없어서): 최대 14박, 미성년은 보호자 동의 표시
{
  const fakeDb = (birthday: string) =>
    ({ studentDetail: (id: string) => (id === 'K1' || id === 'K2' ? { student: { birthday }, enrollments: [{ trId: 'T1', status: 'current', start: '2026-10-01', end: '2026-12-31' }] } : null) }) as unknown as Parameters<typeof newOvernight>[0]['db'];
  const nctx = (birthday: string) => ({ db: fakeDb(birthday), stId: 'K1', now: () => now, newId: () => 'k' + ++n });
  const body = { reason: '여행', destination: 'Manila', contact: '+63 917 555 0000' };
  let o = newOvernight(nctx('1990-01-01'), [], { from: '2026-11-10', until: '2026-11-25', ...body });
  expect('15박은 400 too_many_nights', !o.ok && o.error === 'too_many_nights', o);
  o = newOvernight(nctx('1990-01-01'), [], { from: '2026-11-10', until: '2026-11-24', ...body });
  expect('14박은 됨', o.ok && nightsBetween(o.value.from, o.value.until) === 14, o);
  o = newOvernight(nctx('2010-03-01'), [], { from: '2026-11-10', until: '2026-11-12', ...body });
  expect('미성년(16세)은 보호자 동의 표시 없으면 400', !o.ok && o.error === 'guardian_consent_required', o);
  o = newOvernight(nctx('2010-03-01'), [], { from: '2026-11-10', until: '2026-11-12', ...body, guardianConsent: true });
  expect('미성년 + 보호자 동의 표시 → 됨, 표시가 남음', o.ok && o.value.guardianConsent === true, o);
  o = newOvernight(nctx('2008-11-10'), [], { from: '2026-11-10', until: '2026-11-12', ...body });
  expect('출발일에 만 18세가 되면 성년(동의 표시 없이 됨)', o.ok && o.value.guardianConsent === false, o);
  o = newOvernight(nctx('2008-11-11'), [], { from: '2026-11-10', until: '2026-11-12', ...body });
  expect('출발일 다음 날 18세면 아직 미성년', !o.ok && o.error === 'guardian_consent_required', o);
  expect('나이 계산', ageOn('2008-11-11', '2026-11-10') === 17 && ageOn('2008-11-10', '2026-11-10') === 18 && ageOn('', '2026-11-10') === null);
}

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
expect('11/09 밤 외박 허용', overnightFor(all, stId, '2026-11-09')?.id === ovId);
expect('11/10 밤 외박 허용', overnightFor(all, stId, '2026-11-10')?.id === ovId);
expect('복귀일(11/11) 밤은 허용 아님', overnightFor(all, stId, '2026-11-11')?.id !== ovId);
expect('출발 전날(11/08) 밤은 허용 아님', overnightFor(all, stId, '2026-11-08') === null);
expect('대기 중 외박은 허용 아님', overnightFor(all, stId, '2026-11-12') === null);

// 귀국 항공편 (지금 2026-11-08 10:00 필리핀, 연수 종료 11/13, 출발일은 종료 30일 뒤 12/13까지)
r = await call('GET', '/departure');
const dv = r.body as any;
expect('귀국 항공편: 등록 전, 연수 종료 11/13, 마지막 12/13, 오늘 11/08', dv.departure === null && dv.enrollment.end === '2026-11-13' && dv.enrollment.latest === '2026-12-13' && dv.today === '2026-11-08', dv);
const good = { date: '2026-11-14', time: '10:30', flight: 'pr 468', airport: 'MANILA', needsRide: true, note: '' };
r = await call('PUT', '/departure', { ...good, date: '2026-11-07' });
expect('지난 날짜 400', err(r) === 'date_out_of_range', r);
r = await call('PUT', '/departure', { ...good, date: '2026-12-14' });
expect('연수 종료 30일 뒤를 넘으면 400', err(r) === 'date_out_of_range', r);
r = await call('PUT', '/departure', { ...good, time: '24:00' });
expect('시각 확인', err(r) === 'invalid_time', r);
r = await call('PUT', '/departure', { ...good, flight: '!' });
expect('항공편명 확인', err(r) === 'invalid_flight', r);
r = await call('PUT', '/departure', { ...good, airport: 'OTHER' });
expect('기타 공항이면 메모 필수', err(r) === 'note_required', r);
r = await call('PUT', '/departure', good);
expect('등록 201, 편명 대문자', r.status === 201 && (r.body as Departure).flight === 'PR 468' && (r.body as Departure).id === 'dep-800095', r);
r = await call('PUT', '/departure', { ...good, time: '11:15', needsRide: false });
expect('수정 200, 같은 건', r.status === 200 && (r.body as Departure).time === '11:15' && !(r.body as Departure).needsRide && (await departures.listAll()).length === 1, r);
r = await call('GET', '/me');
expect('내 정보에 귀국 항공편', (r.body as any).departure?.flight === 'PR 468', (r.body as any).departure);
const passed = { ...(await departures.get('dep-800095'))!, date: '2026-11-07' };
await departures.put(passed);
r = await call('PUT', '/departure', good);
expect('출발일이 지난 항공편은 수정 불가 409', err(r) === 'departure_passed', r);
r = await call('PUT', '/departure', good, null);
expect('로그인 없이 401', r.status === 401, r);

// 공항 이동 배차(직원 처리 함수 + 학생에게 보이는 상태)
const depNow = { ...(await departures.get('dep-800095'))!, date: '2026-11-14', time: '06:10', needsRide: true };
await departures.put(depNow);
r = await call('GET', '/departure');
expect('배차: 요청, 처리 전', (r.body as any).ride.state === 'requested', (r.body as any).ride);
let dr = decideRide(depNow, { decision: 'confirmed', pickupDate: '2026-11-14', pickupTime: '06:30' }, '오피스 김', now);
expect('비행기보다 늦은 기숙사 출발 400', !dr.ok && dr.error === 'pickup_after_flight', dr);
dr = decideRide(depNow, { decision: 'confirmed', pickupDate: '2026-11-12', pickupTime: '23:00' }, '오피스 김', now);
expect('출발일 이틀 전 기숙사 출발 400', !dr.ok && dr.error === 'invalid_pickup_date', dr);
dr = decideRide(depNow, { decision: 'declined', note: '' }, '오피스 김', now);
expect('불가는 사유 필수', !dr.ok && dr.error === 'reason_required', dr);
dr = decideRide(depNow, { decision: 'confirmed', pickupDate: '2026-11-13', pickupTime: '23:30', note: '정문, 밴 2호차' }, '오피스 김', now);
expect('전날 밤 기숙사 출발로 확정', dr.ok && dr.value.forTime === '06:10', dr);
if (dr.ok) await rides.put(dr.value);
r = await call('GET', '/departure');
const rv = (r.body as any).ride;
expect('학생에게 확정·기숙사 출발 일시·메모, 처리자는 안 보임', rv.state === 'confirmed' && rv.pickupDate === '2026-11-13' && rv.pickupTime === '23:30' && rv.note === '정문, 밴 2호차' && !('decidedBy' in rv), rv);
const changed = { ...depNow, time: '08:00' };
expect('학생이 시각을 바꾸면 재확인', rideState(changed, (await rides.get('dep-800095'))!) === 'changed');
expect('학생이 차량 요청을 빼면 요청 취소', rideState({ ...depNow, needsRide: false }, (await rides.get('dep-800095'))!) === 'withdrawn');
expect('차량 요청 없는 항공편은 처리 불가', (() => { const x = decideRide({ ...depNow, needsRide: false }, { decision: 'declined', note: 'x' }, 'a', now); return !x.ok && x.error === 'no_ride_request'; })());

// ── 학생 계정 (accounts.ts)
expect('가짜 이메일', studentEmail('30095') === '30095@students.jic.internal' && studentEmail('1', 'X.Example') === '1@x.example');
expect('첫 비밀번호 = 생년월일 8자리', initialPassword('1995-03-25') === '19950325' && initialPassword('19950325') === '19950325');
expect('날짜가 아니면 없음', initialPassword('1995-02-30') === null && initialPassword('') === null && initialPassword('950325') === null);
expect('비밀번호 규칙', checkNewPassword('abc12', 'abc12', 'x') === 'pw_short' && checkNewPassword('abcdefgh', 'abcdefgh', 'x') === 'pw_weak'
  && checkNewPassword('12345678', '12345678', 'x') === 'pw_weak' && checkNewPassword('abcd1234', 'abcd1234', 'abcd1234') === 'pw_same'
  && checkNewPassword('abcd1234', 'abcd1235', 'x') === 'pw_mismatch' && checkNewPassword('a1'.repeat(37), 'a1'.repeat(37), 'x') === 'pw_long'
  && checkNewPassword('abcd1234', 'abcd1234', '19950325') === null);
const ens = (tab: string) => db.listEnrollments(new URLSearchParams({ tab, all: '1' })).rows;
const active = new Set([...ens('current'), ...ens('upcoming')].map((x) => x.stId));
let plan = planAccounts(db, { linked: new Set(), authUsers: new Map() });
expect('계정 대상 = 재학·입학 예정 학생', plan.counts.targets === active.size && plan.create.length + plan.counts.noBirthday === active.size, plan.counts);
expect('졸업생은 대상 아님', !plan.create.some((c) => !active.has(c.stNo)));
const me = plan.create.find((c) => c.stNo === stId)!;
expect('비밀번호 = 생년월일', !!me && me.password === initialPassword(db.studentDetail(stId)!.student.birthday) && me.email === `${stId}@students.jic.internal`);
plan = planAccounts(db, { linked: new Set([stId]), authUsers: new Map([[studentEmail(plan.create[1].stNo), 'u-1']]) });
expect('연결된 학생은 건너뜀, Auth 사용자만 있으면 연결', plan.counts.linked === 1 && plan.link.length === 1 && plan.link[0].userId === 'u-1'
  && !plan.create.some((c) => c.stNo === stId) && plan.create.length === active.size - 2 - plan.counts.noBirthday, plan.counts);

// ── Supabase 토큰 → 학생 (supabaseAuth.ts)
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const uid = '0f9a1c2e-1111-4222-8333-444455556666';
const tok = `${b64({ alg: 'HS256' })}.${b64({ sub: uid, role: 'authenticated' })}.sig`;
expect('토큰 sub', tokenSubject(tok) === uid && tokenSubject('x.y.z') === null && tokenSubject(`a.${b64({ sub: "1' or 1=1" })}.c`) === null);
const seen: string[] = [];
const fakeFetch = (rows: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
  seen.push(`${url} ${(init?.headers as Record<string, string>).Authorization}`);
  return new Response(JSON.stringify(rows), { status });
}) as typeof fetch;
const conf = { url: 'https://x.supabase.co/', key: 'anon' };
let ss = await studentFromToken(conf, tok, fakeFetch([{ student_no: '30095', must_change_password: true }]));
expect('토큰 사용자 한 명만 조회', ss?.stId === '30095' && ss.mustChangePassword && seen[0] === `https://x.supabase.co/rest/v1/student_users?select=student_no,must_change_password&user_id=eq.${uid} Bearer ${tok}`, seen);
expect('학생이 아닌 계정', (await studentFromToken(conf, tok, fakeFetch([]))) === null);
expect('만료된 토큰', (await studentFromToken(conf, tok, fakeFetch({ message: 'JWT expired' }, 401))) === null);
let calls = 0;
const counting = (async () => (calls++, new Response(JSON.stringify([{ student_no: '30095', must_change_password: calls === 1 }])))) as typeof fetch;
const cache = tokenCache(conf, 30_000, counting);
await cache.resolve(tok, 0);
await cache.resolve(tok, 1000); // 비밀번호 변경 필요 상태는 기억하지 않음
await cache.resolve(tok, 2000);
await cache.resolve(tok, 3000);
expect('토큰 결과 30초 기억(변경 필요 상태 제외)', calls === 2, calls);
r = await handleStudentApi({ ...ctx(), localLogin: false, mustChangePassword: true }, 'GET', '/api/me', null);
expect('비밀번호를 바꾸기 전에는 403', r.status === 403 && err(r) === 'password_change_required', r);
r = await handleStudentApi({ ...ctx(null), localLogin: false, mustChangePassword: true }, 'GET', '/api/meta', null);
expect('meta 는 열림, Supabase 모드에서는 로컬 로그인 없음', r.status === 200 && (r.body as any).localLogin === false && (r.body as any).sampleLogin === null, r);
r = await handleStudentApi({ ...ctx(null), localLogin: false }, 'POST', '/api/login', { stId, birthday: me.password });
expect('Supabase 모드에서는 /login 없음', r.status === 404, r);

// ── 생활 요청 (lifeRequests.ts)
r = await call('GET', '/life-requests');
expect('생활 요청 목록: 종류 5, 요청 가능', r.status === 200 && (r.body as any).categories.length === 5 && (r.body as any).canRequest === true && (r.body as any).rows.length === 0, r.body);
r = await call('POST', '/life-requests', { category: 'facility', content: '  방 에어컨에서 물이 샙니다  ' });
const lifeId = (r.body as any).id;
expect('생활 요청 등록 201: 접수, 연수 연결, 내용 다듬음', r.status === 201 && (r.body as any).status === 'received' && (r.body as any).trId === '800095' && (r.body as any).content === '방 에어컨에서 물이 샙니다', r.body);
expect('학생 응답에 처리자 없음', !('handledBy' in (r.body as object)) || (r.body as any).handledBy === undefined);
expect('종류 확인', err(await call('POST', '/life-requests', { category: 'laundry', content: 'x' })) === 'invalid_category');
expect('내용 필수', err(await call('POST', '/life-requests', { category: 'other', content: '   ' })) === 'content_required');
expect('내용 500자', err(await call('POST', '/life-requests', { category: 'other', content: 'x'.repeat(501) })) === 'content_too_long');
r = await call('POST', '/life-requests', { category: 'id_card', content: '카드 분실' }, '99999999');
expect('없는 학생은 연수 없음', err(r) === 'no_enrollment', r);
for (let i = 1; i < LIFE_OPEN_MAX; i++) await call('POST', '/life-requests', { category: 'other', content: `요청 ${i}` });
r = await call('POST', '/life-requests', { category: 'other', content: '하나 더' });
expect(`열린 요청 ${LIFE_OPEN_MAX}건이면 409`, r.status === 409 && err(r) === 'too_many_open', r);
// 직원 처리
const cur = (await life.get(lifeId))!;
let lh = handleLifeRequest(cur, { status: 'rejected', reply: '' }, '오피스 김', now);
expect('반려는 사유 필수', !lh.ok && lh.error === 'reply_required');
lh = handleLifeRequest(cur, { status: 'bogus' }, '오피스 김', now);
expect('처리 상태 확인', !lh.ok && lh.error === 'invalid_status');
lh = handleLifeRequest(cur, { status: 'done', reply: 'x'.repeat(501) }, '오피스 김', now);
expect('답변 500자', !lh.ok && lh.error === 'reply_too_long');
lh = handleLifeRequest(cur, { status: 'in_progress', reply: '내일 오전 수리 기사 방문' }, '오피스 김', now);
expect('처리 중으로', lh.ok && lh.value.status === 'in_progress' && lh.value.handledBy === '오피스 김' && lh.value.reply === '내일 오전 수리 기사 방문', lh);
if (lh.ok) await life.put(lh.value);
r = await call('POST', `/life-requests/${lifeId}/cancel`, {});
expect('처리 중이면 학생 취소 불가', r.status === 409 && err(r) === 'not_pending', r);
lh = handleLifeRequest((await life.get(lifeId))!, { status: 'in_progress' }, '오피스 김', now);
expect('이미 처리 중', !lh.ok && lh.error === 'already_in_progress');
lh = handleLifeRequest((await life.get(lifeId))!, { status: 'done' }, '오피스 박', now);
expect('완료(답변 그대로 유지)', lh.ok && lh.value.status === 'done' && lh.value.reply === '내일 오전 수리 기사 방문' && lh.value.handledBy === '오피스 박', lh);
if (lh.ok) await life.put(lh.value);
lh = handleLifeRequest((await life.get(lifeId))!, { status: 'rejected', reply: 'x' }, '오피스 김', now);
expect('끝난 요청은 못 바꿈', !lh.ok && lh.error === 'already_closed');
r = await call('GET', '/life-requests');
const lr = (r.body as any).rows.find((x: any) => x.id === lifeId);
expect('학생이 완료·답변을 봄, 처리자는 안 보임', lr.status === 'done' && lr.reply === '내일 오전 수리 기사 방문' && lr.handledBy === undefined, lr);
const open = (r.body as any).rows.find((x: any) => x.status === 'received');
r = await call('POST', `/life-requests/${open.id}/cancel`, {});
expect('접수 상태는 학생 취소', r.status === 200 && (r.body as any).status === 'cancelled', r);
r = await call('POST', `/life-requests/${open.id}/cancel`, {}, '30140');
expect('남의 요청 취소 404', r.status === 404, r);
r = await call('POST', '/life-requests', { category: 'document', content: '재학증명서 1부' });
expect('취소하면 다시 요청 가능', r.status === 201, r);

// ── 학교 여행·액티비티 (trips.ts): 오늘(필리핀) 2026-11-08, 30095·30140 은 Challenger 재학 ~11/13
const staff = { now: () => now, newId: () => 't' + ++n, today: '2026-11-08', actor: '오피스 김', campuses: ['Challenger', 'Premium'] };
const mkTrip = async (input: Record<string, unknown>, status?: Trip['status']) => {
  const out = saveTrip(staff, null, { campus: 'Challenger', title: '여행', place: 'Island', start: '2026-11-11', end: '2026-11-12', deadline: '2026-11-09', capacity: 20, cost: 0, ...input });
  if (!out.ok) throw new Error(out.error);
  await trips.putTrip(status ? { ...out.value, status } : out.value);
  return out.value;
};
let st = saveTrip(staff, null, { campus: 'Busan', title: 'x', place: 'y', start: '2026-11-11', end: '2026-11-11', deadline: '2026-11-10', capacity: 5 });
expect('여행 등록: 없는 캠퍼스', !st.ok && st.error === 'invalid_campus');
st = saveTrip(staff, null, { title: 'x', place: 'y', start: '2026-11-11', end: '2026-11-11', deadline: '2026-11-12', capacity: 5 });
expect('여행 등록: 마감일은 출발일 이전', !st.ok && st.error === 'deadline_after_start');
st = saveTrip(staff, null, { title: 'x', place: 'y', start: '2026-11-07', end: '2026-11-07', deadline: '2026-11-06', capacity: 5 });
expect('여행 등록: 지난 날짜', !st.ok && st.error === 'start_in_past');
st = saveTrip(staff, null, { title: 'x', place: 'y', start: '2026-11-11', end: '2026-11-30', deadline: '2026-11-10', capacity: 5 });
expect('여행 등록: 14박까지', !st.ok && st.error === 'trip_too_long');
st = saveTrip(staff, null, { title: 'x', place: 'y', start: '2026-11-11', end: '2026-11-11', deadline: '2026-11-10', capacity: 0 });
expect('여행 등록: 정원 1 이상', !st.ok && st.error === 'invalid_capacity');
st = saveTrip(staff, null, { title: ' 아일랜드 호핑 ', place: 'Boracay', start: '2026-11-11', end: '2026-11-11', deadline: '2026-11-10', capacity: '30', cost: '1500' });
expect('여행 등록: 다듬기·숫자 문자열·전체 캠퍼스', st.ok && st.value.title === '아일랜드 호핑' && st.value.capacity === 30 && st.value.cost === 1500 && st.value.campus === '' && st.value.status === 'open', st);

const T1 = await mkTrip({ title: '보라카이 1박', place: 'Boracay', cost: 2500 });
const T2 = await mkTrip({ title: '당일 하이킹', campus: '', start: '2026-11-10', end: '2026-11-10', capacity: 1 });
const T3 = await mkTrip({ title: 'Premium 여행', campus: 'Premium' });
const T4 = await mkTrip({ title: '취소된 여행' }, 'cancelled');
const T5 = await mkTrip({ title: '마감 지남', start: '2026-11-09', end: '2026-11-09', deadline: '2026-11-08' });
await trips.putTrip({ ...T5, deadline: '2026-11-07' }); // 마감일을 어제로(수정은 지난 날짜도 된다)
const T6 = await mkTrip({ title: '연수 뒤 여행', start: '2026-11-14', end: '2026-11-15', deadline: '2026-11-12' });
r = await call('GET', '/trips');
let tl = r.body as any;
const titles = tl.rows.map((x: any) => x.title);
expect('여행 목록: 내 캠퍼스·전체, 다른 캠퍼스·취소 안 보임', r.status === 200 && titles.includes('보라카이 1박') && titles.includes('당일 하이킹') && !titles.includes('Premium 여행') && !titles.includes('취소된 여행'), titles);
const row1 = tl.rows.find((x: any) => x.id === T1.id);
expect('여행 행: 1박, 남은 자리, 신청 가능, 올린 직원 안 보임', row1.nights === 1 && row1.left === 20 && row1.canApply === true && row1.why === null && row1.mine === null && !('createdBy' in row1), row1);
expect('신청 못 하는 이유: 마감·연수 기간', tl.rows.find((x: any) => x.id === T5.id).why === 'trip_closed' && tl.rows.find((x: any) => x.id === T6.id).why === 'outside_enrollment', tl.rows.map((x: any) => [x.title, x.why]));
r = await call('POST', `/trips/${T1.id}/signup`, {});
expect('참가 신청 201: 신청함, 자리 1 줄어듦, 취소 가능', r.status === 201 && (r.body as any).mine.status === 'applied' && (r.body as any).left === 19 && (r.body as any).canCancel === true && (r.body as any).why === 'already_applied', r.body);
r = await call('POST', `/trips/${T1.id}/signup`, {});
expect('같은 여행 두 번 409', r.status === 409 && err(r) === 'already_applied', r);
r = await call('POST', `/trips/${T2.id}/signup`, {}, '30140');
expect('다른 학생이 정원 1 여행 신청', r.status === 201, r);
r = await call('POST', `/trips/${T2.id}/signup`, {});
expect('자리 없음 409', r.status === 409 && err(r) === 'trip_full', r);
expect('취소된 여행 409', err(await call('POST', `/trips/${T4.id}/signup`, {})) === 'trip_cancelled');
expect('마감 지난 여행 409', err(await call('POST', `/trips/${T5.id}/signup`, {})) === 'trip_closed');
expect('연수 기간 밖 400', err(await call('POST', `/trips/${T6.id}/signup`, {})) === 'outside_enrollment');
expect('다른 캠퍼스 여행 404', (await call('POST', `/trips/${T3.id}/signup`, {})).status === 404);
expect('없는 여행 404', (await call('GET', '/trips/nope')).status === 404);
r = await call('POST', `/trips/${T1.id}/cancel`, {});
expect('신청 취소: 취소, 자리 돌아옴', r.status === 200 && (r.body as any).mine.status === 'cancelled' && (r.body as any).left === 20 && (r.body as any).canApply === true, r.body);
expect('취소할 신청 없음 404', (await call('POST', `/trips/${T1.id}/cancel`, {})).status === 404);
r = await call('POST', `/trips/${T1.id}/signup`, {});
expect('취소 뒤 다시 신청 201', r.status === 201, r);
// 직원이 명단에서 뺌: 사유는 학생에게 보이고 처리자는 안 보인다
const mine1 = (await trips.signupsByStudent(stId)).find((s) => s.tripId === T1.id && s.status === 'applied')!;
let rm = removeSignup(mine1, { reason: '' }, '오피스 김', now);
expect('명단 제외는 사유 필수', !rm.ok && rm.error === 'reason_required');
rm = removeSignup(mine1, { reason: '보호자 동의서 미제출' }, '오피스 김', now);
expect('명단 제외', rm.ok && rm.value.status === 'removed' && rm.value.handledBy === '오피스 김', rm);
if (rm.ok) await trips.putSignup(rm.value);
r = await call('GET', `/trips/${T1.id}`);
expect('학생이 제외 사유를 봄(처리자 없음), 다시 신청 가능', (r.body as any).mine.status === 'removed' && (r.body as any).mine.reason === '보호자 동의서 미제출' && !('handledBy' in (r.body as any).mine) && (r.body as any).canApply === true, r.body);
// 마감이 지나면 학생이 취소하지 못한다
await call('POST', `/trips/${T1.id}/signup`, {});
await trips.putTrip({ ...(await trips.getTrip(T1.id))!, deadline: '2026-11-07' });
r = await call('POST', `/trips/${T1.id}/cancel`, {});
expect('마감 뒤 취소 409', r.status === 409 && err(r) === 'deadline_passed', r);
expect('마감 뒤에는 취소 버튼 없음', ((await call('GET', `/trips/${T1.id}`)).body as any).canCancel === false);
// 취소된 여행도 내가 신청했으면 목록에 남는다
await trips.putTrip({ ...(await trips.getTrip(T2.id))!, status: 'cancelled' });
tl = (await call('GET', '/trips', null, '30140')).body as any;
expect('신청한 여행이 취소되면 목록에 취소로', tl.rows.find((x: any) => x.id === T2.id)?.status === 'cancelled', tl.rows.map((x: any) => [x.title, x.status]));
// 외박 허용: 1박 이상, 참가 신청, 취소되지 않은 여행만
const permits = tripPermits(await trips.listTrips(), await trips.listSignups());
expect('1박 여행 참가 → 출발일 밤 외박 허용(여행 이름)', !!overnightFor(permits, stId, '2026-11-11') && !overnightFor(permits, stId, '2026-11-12') && overnightFor(permits, stId, '2026-11-11')?.reason === '보라카이 1박', permits);
expect('당일 여행·취소된 여행은 외박 허용 아님', !overnightFor(permits, '30140', '2026-11-10') && permits.every((p) => p.tripId === T1.id), permits.map((p) => p.tripId));

// ── 출입 QR (keycard.ts): 1분마다 바뀌는 서명 값
r = await call('GET', '/keycard');
const kc = r.body as any;
expect('출입 QR: 값·끝나는 시각·서버 시각', r.status === 200 && /^JIC1\.30095\.\d+\.[0-9a-f]{20}$/.test(kc.code) && kc.period === KEYCARD_PERIOD && Date.parse(kc.expiresAt) > now.getTime() && kc.now === now.toISOString(), kc);
const secretFn = async () => SECRET;
let kr = await readKeycard(secretFn, kc.code, now.getTime());
expect('QR 확인: 학생번호, qr', kr.ok && kr.stId === stId && kr.via === 'qr', kr);
kr = await readKeycard(secretFn, kc.code, now.getTime() + KEYCARD_PERIOD * 1000);
expect('다음 1분까지는 받음(직전 창)', kr.ok, kr);
kr = await readKeycard(secretFn, kc.code, now.getTime() + 2 * KEYCARD_PERIOD * 1000);
expect('2분 지나면 만료', !kr.ok && kr.error === 'qr_expired', kr);
kr = await readKeycard(secretFn, kc.code.replace('JIC1.30095.', 'JIC1.30140.'), now.getTime());
expect('학생번호를 바꾸면 서명이 안 맞음', !kr.ok && kr.error === 'invalid_qr', kr);
kr = await readKeycard(async () => 'b'.repeat(64), kc.code, now.getTime());
expect('다른 비밀 값으로는 안 맞음', !kr.ok && kr.error === 'invalid_qr', kr);
const future = await keycardCode(SECRET, stId, now.getTime() + 3 * KEYCARD_PERIOD * 1000);
kr = await readKeycard(secretFn, future.code, now.getTime());
expect('너무 앞선 시각의 QR 거절', !kr.ok && kr.error === 'invalid_qr', kr);
kr = await readKeycard(secretFn, 'JIC1.30095.abc', now.getTime());
expect('모양이 틀린 QR', !kr.ok && kr.error === 'invalid_qr', kr);
kr = await readKeycard(undefined, kc.code, now.getTime());
expect('비밀 값이 없으면 QR 못 받음', !kr.ok && kr.error === 'qr_unavailable', kr);
kr = await readKeycard(undefined, ' 30095 ', now.getTime());
expect('숫자는 직접 입력한 학생번호', kr.ok && kr.stId === stId && kr.via === 'number', kr);
expect('빈 값', (await readKeycard(secretFn, '  ', now.getTime())).ok === false);
r = await handleStudentApi({ ...ctx(), keycardSecret: undefined }, 'GET', '/api/keycard', null);
expect('비밀 값이 없는 서버는 404', r.status === 404 && err(r) === 'keycard_unavailable', r);
r = await call('GET', '/keycard', null, '99999999');
expect('연수가 없는 학생은 403', r.status === 403 && err(r) === 'no_enrollment', r);

// ── 시간표: 강사 포털 수업·출석(읽기만). 오늘(11/08 일요일)이 든 주 = 11/02(월) ~ 11/08(일)
expect('월요일 계산: 일요일은 그 주 월요일', mondayOf('2026-11-08') === '2026-11-02' && mondayOf('2026-11-02') === '2026-11-02' && mondayOf('2026-11-04') === '2026-11-02');
const cls = (id: string, day: string, time: string, extra: Partial<ClassMark> = {}): ClassMark & { stId: string } => ({ stId, id, day, time, minutes: 50, kind: '1', subject: 'Grammar', teacher: '', room: '', result: null, lateMin: null, excused: false, ...extra });
const allClasses = [
  cls('c1', '2026-11-03', '10:00', { subject: 'Speaking', teacher: 'Ann', room: '201', kind: 'G', result: 'AB' }),
  cls('c2', '2026-11-03', '08:00', { teacher: 'Ben', result: 'AT' }),
  cls('c3', '2026-11-05', '09:00', { subject: '', result: 'TA', lateMin: 10 }),
  cls('c4', '2026-11-06', '09:00', { subject: 'Reading', result: 'AB', excused: true }),
  cls('c5', '2026-11-08', '13:00', { subject: 'Writing' }),
  cls('c6', '2026-11-10', '08:00'),
  { ...cls('x1', '2026-11-03', '08:00', { result: 'AB' }), stId: '99999' },
];
let asked: string[] = [];
const ttSource: TimetableSource = {
  classes: async (who, from, to) => {
    asked = [who, from, to];
    return allClasses.filter((c) => c.stId === who && c.day >= from && c.day <= to).map(({ stId: _s, ...c }) => c);
  },
};
const tcall = async (p: string, who: string | null = stId) => handleStudentApi({ ...ctx(who), timetable: ttSource }, 'GET', p, null);
let tv = (await tcall('/timetable')).body as TimetableView;
expect('시간표: 이번 주(월~일), 이전·다음 주', tv.available && tv.from === '2026-11-02' && tv.to === '2026-11-08' && tv.prev === '2026-10-26' && tv.next === '2026-11-09' && tv.today === '2026-11-08' && tv.days.length === 7, tv);
expect('시간표: 로그인한 학생 것만 그 주로 묻는다', asked.join() === `${stId},2026-11-02,2026-11-08`, asked);
const d3 = tv.days.find((d) => d.day === '2026-11-03')!;
expect('시간표: 날짜별, 시작 시각 순, 다른 학생 수업은 없음', d3.classes.map((c) => c.id).join() === 'c2,c1', d3.classes);
expect('시간표: 합계(출석 1·결석 1·지각 1·사유 인정 1·체크 전 1)', JSON.stringify(tv.counts) === JSON.stringify({ classes: 5, attended: 1, absent: 1, late: 1, excused: 1, unchecked: 1 }), tv.counts);
tv = (await tcall('/timetable/2026-11-11')).body as TimetableView;
expect('시간표: 다른 주(그 날짜가 든 월~일)', tv.from === '2026-11-09' && tv.days.flatMap((d) => d.classes).map((c) => c.id).join() === 'c6', tv);
tv = (await tcall('/timetable/2026-13-40')).body as TimetableView;
expect('시간표: 날짜가 아니면 이번 주', tv.from === '2026-11-02', tv.from);
tv = (await call('GET', '/timetable')).body as TimetableView;
expect('시간표: 출석 자료가 없으면 아직 없음', tv.available === false && tv.days.every((d) => d.classes.length === 0), tv);
expect('시간표: 로그인 전 401', (await tcall('/timetable', null)).status === 401);

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
