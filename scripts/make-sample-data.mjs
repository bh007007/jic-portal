// 개발용 가짜 데이터 생성기.
// 실제 추출본(data/tables)과 같은 열 이름으로 data-sample/tables/*.ndjson 을 만든다.
// 이름·번호·금액은 모두 무작위이며 실제 학생과 관계없다.
//   node scripts/make-sample-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'data-sample', 'tables');
fs.mkdirSync(outDir, { recursive: true });

let seed = 20261107;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[0][0];
};
const day = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

const NATIONS = [
  ['일본', 36, 'JPY', ['SATO', 'TANAKA', 'SUZUKI', 'ITO', 'KATO', 'MORI'], ['HARUKA', 'REN', 'YUI', 'SORA', 'MIO', 'KENTA']],
  ['대만', 25, 'USD', ['LIN', 'CHEN', 'HUANG', 'TSAI', 'WANG', 'HSU'], ['YU-TING', 'WEI-LUN', 'PEI-SHAN', 'CHIA-HAO']],
  ['한국', 19, 'KRW', ['KIM', 'LEE', 'PARK', 'CHOI', 'JUNG', 'KANG'], ['JIWOO', 'SEOYEON', 'MINJUN', 'HAYOON', 'DOYUN']],
  ['중국', 8, 'USD', ['LIU', 'ZHANG', 'WU', 'ZHOU'], ['HAO', 'JING', 'YANG', 'MEI']],
  ['베트남', 5, 'USD', ['NGUYEN', 'TRAN', 'LE', 'PHAM'], ['MINH', 'THANH', 'HOANG', 'LINH']],
  ['사우디아라비아', 4, 'USD', ['AL-HARBI', 'AL-QAHTANI', 'AL-OTAIBI'], ['FAISAL', 'OMAR', 'SALEH']],
  ['예멘', 3, 'USD', ['AL-HADDAD', 'BIN SALEM'], ['KHALED', 'AHMED']],
];
const CAMPUS = {
  PREMIUM: {
    name: 'Premium',
    courses: ['Speaking Starter', 'Speaking Pro', 'ESL TEP 8', 'ESL TEP 9', 'ESL-Core', 'TOEIC'],
    dorms: ['R4 (Bal)(P)', 'R4(P)', 'R2 (Bal)(P)', 'R2(P)'],
  },
  CHALLENGER: {
    name: 'Challenger',
    courses: ['ESL-Lite', 'ESL-Standard', 'ESL-Core', 'IELTS-Core'],
    dorms: ['R4 Studio(C)', 'R2 Studio(C)', 'R4 Loft(C)', 'Stay Out(C)'],
  },
};

// 배치: 2026-11-15 = 288_A, 2주마다 A/B 교대
const batchOf = (date) => {
  const k = diffDays(date, '2026-11-15') / 14;
  return `${288 + Math.floor(k / 2)}_${k % 2 === 0 ? 'A' : 'B'}`;
};
const batchDates = [];
for (let d = '2026-03-22'; d <= '2027-01-24'; d = day(d, 14)) batchDates.push(d);

const agencies = [];
const agents = [];
const AG_CITIES = { 일본: ['도쿄', '오사카'], 대만: ['타이베이', '타이중'], 한국: ['서울', '부산'], 중국: ['상하이'], 베트남: ['호찌민'], 사우디아라비아: ['리야드'], 예멘: ['사나'] };
let agId = 9000, amId = 7000;
for (const [nation] of NATIONS) {
  for (const city of AG_CITIES[nation]) {
    for (let i = 1; i <= 2; i++) {
      agId++;
      agencies.push({ ag_id: String(agId), ag_name: `샘플유학${i} ${city}`, ag_name_en: `Sample Agency ${agId}`, ag_state: 'APPROVE', ag_country: nation });
      const n = 1 + Math.floor(rand() * 2);
      for (let j = 0; j < n; j++) agents.push({ am_id: String(++amId), am_ag_id: String(agId), am_name: `담당자${amId}`, am_branch: city, am_use_yn: 'Y' });
    }
  }
}

const students = [];
const enrollments = [];
const invoices = [];
const dorms = [];
let stNo = 30000, trNo = 800000;

const makeStudent = () => {
  const nat = weighted(NATIONS.map((n) => [n, n[1]]));
  const last = pick(nat[3]), first = pick(nat[4]);
  const gender = rand() < 0.55 ? 'F' : 'M';
  const year = 1975 + Math.floor(rand() * 33);
  const st = {
    st_id: String(++stNo),
    st_name: `${last} ${first}`,
    st_last_name: last,
    st_first_name: first,
    st_birthday: `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
    st_gender: gender,
    st_country_cd_name: nat[0],
    st_email: `sample${stNo}@example.com`,
    st_cell: `000-0000-${String(stNo).slice(-4)}`,
    st_lang_name: nat[0] === '한국' ? 'Korean' : nat[0] === '일본' ? 'Japanese' : 'English',
    st_vip_level: 'Regular',
  };
  students.push(st);
  return { st, nat };
};

const addEnrollment = ({ st, nat }, startDate) => {
  const campusKey = rand() < 0.52 ? 'PREMIUM' : 'CHALLENGER';
  const c = CAMPUS[campusKey];
  const weeks = weighted([[4, 3], [8, 4], [12, 5], [16, 2], [24, 1]]);
  const finish = day(startDate, weeks * 7 - 2);
  const course = pick(c.courses), dorm = pick(c.dorms);
  const ag = pick(agencies.filter((a) => a.ag_country === nat[0]));
  const am = agents.find((a) => a.am_ag_id === ag.ag_id);
  const state = weighted([['인보이스승인', 90], ['캔슬', 8], ['연수중 취소', 2]]);
  const pay = weighted([['미납', 60], ['완납', 30], ['부분납', 10]]);
  const tr = String(++trNo);
  const upcoming = startDate > '2026-11-07';
  enrollments.push({
    tr_id: tr,
    tr_st_id: st.st_id,
    st_name: st.st_name,
    st_last_name: st.st_last_name,
    st_first_name: st.st_first_name,
    st_country_name: nat[0],
    st_gender_name: st.st_gender === 'F' ? '여' : '남',
    first_co_ca_code: campusKey,
    first_do_ca_code: campusKey,
    courses: `${course}(${weeks}w)`,
    dorms: `${dorm}(${weeks}w)`,
    tr_start_date: startDate,
    tr_finish_date: finish,
    tr_total_week: String(weeks),
    ag_name: ag.ag_name,
    am_branch: am?.am_branch ?? '',
    tr_deposit_name: pay,
    sd_name: batchOf(startDate),
    sd_departure_date: startDate,
    sd_start_date: day(startDate, 1),
    tr_state_name: state,
    tr_pick_type: upcoming ? weighted([['BESA', 50], ['', 30], ['NO_PICKUP', 15], ['INDIVIDUAL', 5]]) : 'BESA',
    tr_pick_place: '마닐라',
    tr_room_clear_yn: 'N',
    tr_point_clear_yn: 'N',
    tr_ag_memo: rand() < 0.3 ? '샘플 메모: 공항 도착 시간 확인 요청' : null,
    tr_br_memo: rand() < 0.15 ? '샘플 메모: 레벨 테스트 후 반 조정' : null,
  });
  const paid = pay === '미납' ? 0 : Math.round((pay === '완납' ? 1 : 0.4) * weeks * (nat[2] === 'KRW' ? 350000 : nat[2] === 'JPY' ? 38000 : 280));
  const pIn = Math.round(rand() * 6) * 1000;
  invoices.push({ tr_id: tr, tr_currency: nat[2], tr_deposit_name: pay, sum_id_amount: String(paid), sum_pd_point: String(pIn), sum_pu_point: String(Math.round(pIn * rand())) });
  if (!dorm.startsWith('Stay Out')) {
    dorms.push({ tr_id: tr, tr_st_id: st.st_id, do_name: dorm, ca_name: c.name, ca_code: campusKey, ic_departure_date: startDate, ic_return_date: day(finish, 1), ic_week: String(weeks), ic_cancel_yn: 'N' });
  }
};

for (const d of batchDates) {
  const n = d > '2026-11-07' ? 5 + Math.floor(rand() * 6) : 6 + Math.floor(rand() * 8);
  for (let i = 0; i < n; i++) addEnrollment(makeStudent(), d);
}
// 연장·복귀 학생 일부: 같은 학생에게 연수 1건 더
for (const s of students.slice(0, 15)) {
  const first = enrollments.find((e) => e.tr_st_id === s.st_id);
  const nat = NATIONS.find((n) => n[0] === s.st_country_cd_name);
  const next = batchDates.find((d) => d > first.tr_finish_date);
  if (next) addEnrollment({ st: s, nat }, next);
}

// ── 보조 필드: 에이전시·담당자 계정 정보, 연수의 에이전시·담당자 연결, 입학 예정자 항공편.
// 위의 무작위 순서를 건드리지 않도록 별도 시드를 쓴다(학생·연수 구성은 이전과 같다).
let seed2 = 7;
const rand2 = () => ((seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick2 = (arr) => arr[Math.floor(rand2() * arr.length)];
const two = (n) => String(n).padStart(2, '0');
const COUNTRY_EN = { 일본: 'Japan', 대만: 'Taiwan', 한국: 'Korea', 중국: 'China', 베트남: 'Vietnam', 사우디아라비아: 'Saudi Arabia', 예멘: 'Other' };
const LANG = { 일본: '일어', 대만: '대만어', 한국: '한국어', 중국: '중국어', 베트남: '베트남어', 사우디아라비아: '영어', 예멘: '영어' };

// 학생을 보낸 적 없는 에이전시 2곳(실적 없음 필터용)
for (const [nation, city] of [['일본', '나고야'], ['한국', '대구']]) {
  agId++;
  agencies.push({ ag_id: String(agId), ag_name: `샘플유학 ${city}`, ag_name_en: `Sample Agency ${agId}`, ag_state: 'APPROVE', ag_country: nation });
  agents.push({ am_id: String(++amId), am_ag_id: String(agId), am_name: `담당자${amId}`, am_branch: city, am_use_yn: rand2() < 0.5 ? 'Y' : 'N' });
}
for (const a of agencies) {
  const city = a.ag_name.split(' ').pop();
  Object.assign(a, {
    ag_country_cd_name: COUNTRY_EN[a.ag_country],
    ag_demo_yn: 'N',
    ag_ceo_name: `대표${a.ag_id.slice(-2)}`,
    ag_tel: `000-0000-${a.ag_id}`,
    ag_email: `agency${a.ag_id}@example.com`,
    ag_homepage: `https://example.com/agency/${a.ag_id}`,
    ag_addr: `${city} 샘플로 ${1 + Math.floor(rand2() * 200)}`,
    ag_insert_dt: `20${18 + Math.floor(rand2() * 8)}-${two(1 + Math.floor(rand2() * 12))}-${two(1 + Math.floor(rand2() * 28))} 10:00:00`,
  });
}
const agencyOf = new Map(agencies.map((a) => [a.ag_id, a]));
for (const m of agents) {
  const a = agencyOf.get(m.am_ag_id);
  Object.assign(m, {
    am_loginid: `sample_${m.am_id}`,
    am_main_yn: agents.find((x) => x.am_ag_id === m.am_ag_id) === m ? 'Y' : 'N',
    am_invoice_yn: 'Y',
    am_lang_name: LANG[a.ag_country],
    am_email: `agent${m.am_id}@example.com`,
    am_cell: `000-0000-${m.am_id}`,
  });
}

const AIRLINES = [['아시아나', 'OZ'], ['진에어', 'LJ'], ['Cebu Pacific', '5J'], ['Philippine Airlines', 'PR'], ['EVA AIR', 'BR'], ['Japan Airlines', 'JL']];
const TERMINAL = { CLARK: 'Bay 3', MANILA: 'Terminal 3 - Bay 7' };
const agencyByName = new Map(agencies.map((a) => [a.ag_name, a]));
for (const e of enrollments) {
  const a = agencyByName.get(e.ag_name);
  const m = agents.find((x) => x.am_ag_id === a.ag_id);
  Object.assign(e, { ag_id: a.ag_id, am_ag_id: a.ag_id, tr_am_id: m.am_id, am_name: m.am_name });
  const place = pick2(['CLARK', 'MANILA']);
  if (e.tr_start_date <= '2026-11-07') {
    e.tr_pick_place = place;
    continue;
  }
  e.tr_pick_place = e.tr_pick_type === 'BESA' || e.tr_pick_type === 'INDIVIDUAL' ? place : '';
  if (e.tr_pick_type !== 'BESA' || rand2() < 0.2) continue; // BESA 중 일부는 항공편 미입력
  const [airline, code] = pick2(AIRLINES);
  const arriveDay = rand2() < 0.7 ? e.tr_start_date : day(e.tr_start_date, -1);
  Object.assign(e, {
    tr_pick_flight: airline,
    tr_pick_flight_num: `${code}${100 + Math.floor(rand2() * 800)}`,
    tr_pick_flight_arrival: `${arriveDay} ${two(Math.floor(rand2() * 24))}:${two(Math.floor(rand2() * 12) * 5)}:00`,
    tr_pick_terminal: TERMINAL[place],
    tr_pick_remark: rand2() < 0.25 ? '샘플: 도착 후 연락 요망' : '',
  });
}

// ── 회계 보조: 납부 기한, 입금 원장(deposits). 위 순서를 건드리지 않도록 또 다른 시드를 쓴다.
// 입금 원장은 실제 추출본과 같은 열 이름(dp_*, sum_id_amount, balance …)만 쓰고 받는 계좌(bk_*)는 넣지 않는다.
let seed3 = 11;
const rand3 = () => ((seed3 = (seed3 * 1103515245 + 12345) % 2147483648) / 2147483648);
const deposits = [];
let dpNo = 50000;
const enrollmentByTr = new Map(enrollments.map((e) => [e.tr_id, e]));
for (const e of enrollments) e.tr_deposit_due_date = day(e.sd_departure_date, -(14 + Math.floor(rand3() * 3) * 7));
const addDeposit = (o) => {
  const fee = o.currency === 'USD' ? Math.round(rand3() * 3) * 10 : 0;
  deposits.push({
    dp_id: String(++dpNo),
    dp_ag_id: o.agId ?? '0',
    dp_st_id: '0',
    dp_type: '1',
    dp_deposit_dt: o.date,
    dp_name: o.name,
    dp_memo: o.memo ?? null,
    dp_currency: o.currency,
    dp_amount: String(o.amount),
    dp_fee: String(fee),
    dp_amount_total: String(o.amount + fee),
    dp_confirm_yn: rand3() < 0.2 ? 'Y' : 'N',
    dp_use_yn: 'Y',
    sum_id_amount: String(o.matched),
    id_currency: o.matched ? o.currency : null,
    balance: String(o.amount + fee - o.matched),
    match_ag_name: o.agName ?? null,
    cnt: String(o.cnt),
  });
};
for (const inv of invoices) {
  const paid = Number(inv.sum_id_amount);
  if (!paid || rand3() < 0.25) continue;
  const e = enrollmentByTr.get(inv.tr_id);
  const extra = rand3() < 0.15 ? Math.round(paid * 0.1) : 0; // 일부는 인보이스보다 많이 들어와 잔액이 남는다
  const date = day(e.tr_start_date, -(7 + Math.floor(rand3() * 40)));
  addDeposit({
    date: date <= '2026-11-07' ? date : day('2026-11-07', -Math.floor(rand3() * 14)), // 추출일 이후 입금은 없다
    name: rand3() < 0.7 ? e.ag_name : e.st_name,
    agId: e.ag_id,
    agName: e.ag_name,
    currency: inv.tr_currency,
    amount: paid + extra,
    matched: paid,
    cnt: 1,
  });
}
// 아직 연수에 매칭되지 않은 입금
for (let i = 0; i < 8; i++) {
  const a = agencies[Math.floor(rand3() * agencies.length)];
  const currency = ['USD', 'JPY', 'KRW'][Math.floor(rand3() * 3)];
  const amount = currency === 'KRW' ? 350000 * (2 + Math.floor(rand3() * 8)) : currency === 'JPY' ? 38000 * (2 + Math.floor(rand3() * 8)) : 280 * (2 + Math.floor(rand3() * 8));
  addDeposit({ date: day('2026-11-07', -Math.floor(rand3() * 30)), name: a.ag_name_en, currency, amount, matched: 0, cnt: 0, memo: rand3() < 0.5 ? '샘플: 송금인 확인 필요' : null });
}

// ── 포인트 내역(point_history): 실제 추출본과 같은 열(type D=충전, U=현지 비용 사용, point=페소, ec_name=비용 항목).
// 또 다른 시드를 써서 위 데이터는 그대로 둔다. 입학한 Premium 연수만(실제 추출본도 Premium만 있음).
let seed4 = 13;
const rand4 = () => ((seed4 = (seed4 * 1103515245 + 12345) % 2147483648) / 2147483648);
const pointHistory = [];
const LOCAL_FEES = [
  ['SSP (Valid for 6 mon)', 6500], ['Student ID Card', 500], ['Class Materials', 1000], ['Visa', 3800],
  ['Maintenance (4w basis)', 800], ['Laundry Fee (4w basis)', 1000], ['Utility Bill (4w basis)', 2400], ['Deposit', 3000],
];
const STAFF = ['Mia', 'Joy', 'Ken'];
for (const e of enrollments) {
  if (e.first_co_ca_code !== 'PREMIUM' || e.tr_start_date > '2026-11-07' || /캔슬|취소/.test(e.tr_state_name)) continue;
  const at = (n, h) => `${day(e.tr_start_date, n)} ${String(h).padStart(2, '0')}:${String(Math.floor(rand4() * 60)).padStart(2, '0')}:00`;
  const blocks = Math.max(1, Math.round(Number(e.tr_total_week) / 4));
  const used = LOCAL_FEES.map(([name, fee]) => [name, /4w basis/.test(name) ? fee * blocks : fee]);
  const total = used.reduce((s, [, fee]) => s + fee, 0);
  const charge = Math.ceil((total + Math.round(rand4() * 4) * 1000) / 1000) * 1000; // 쓸 돈보다 조금 넉넉히 충전
  const base = { tr_id: e.tr_id, tr_st_id: e.tr_st_id, campus: 'Premium' };
  pointHistory.push({ ...base, staff_id: '1', type: 'D', dt: at(1, 9), point: String(charge), php: String(charge), ec_name: null, nickname: STAFF[0], memo: null });
  for (const [name, fee] of used) {
    if (name === 'Visa' && Number(e.tr_total_week) < 4) continue;
    pointHistory.push({ ...base, staff_id: '2', type: 'U', dt: at(1, 10), point: String(fee), php: String(fee), ec_name: name, nickname: STAFF[1 + Math.floor(rand4() * 2)], memo: null });
  }
}

const write = (name, rows) => fs.writeFileSync(path.join(outDir, name + '.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
write('point_history', pointHistory);
write('students', students);
write('enrollments', enrollments);
write('invoices', invoices);
write('dorm_assignments', dorms);
write('agencies', agencies);
write('agents', agents);
write('deposits', deposits);

// ── 방·침대(rooms): 실제 추출본과 같은 열(roo_*, do_name, beds[bed_*]). Premium만(실제도 Premium만 등록). 별도 시드.
let seed5 = 17;
const rand5 = () => ((seed5 = (seed5 * 1103515245 + 12345) % 2147483648) / 2147483648);
const rooms = [];
let rooId = 2000, bedId = 9000;
const ROOM_TYPES = [['R4 (Bal)(P)', 4, 10], ['R4(P)', 4, 6], ['R2 (Bal)(P)', 2, 8], ['R2(P)', 2, 6], ['R1 (Bal)(P)', 1, 4]];
let roomNo = 0;
for (const [type, beds, count] of ROOM_TYPES) {
  for (let i = 0; i < count; i++) {
    const floor = 1 + (roomNo % 4);
    const building = roomNo % 3 === 2 ? 'Student Center' : 'Dormitory Building';
    roomNo++;
    const id = String(++rooId);
    rooms.push({
      roo_id: id, roo_do_id: '1', roo_num: `${floor}${String(roomNo).padStart(2, '0')}`, roo_building: building, roo_floor: String(floor),
      roo_rating: null, roo_gender: ['M', 'F', 'N'][Math.floor(rand5() * 3)], roo_max: String(beds),
      roo_start_date: '2024-07-28', roo_finish_date: '2099-12-31', roo_use_yn: 'Y', roo_memo: rand5() < 0.1 ? '샘플: 에어컨 점검 예정' : null,
      do_name: type, do_name_short: type, ca_id: '12', ca_code: 'PREMIUM', roo_status: 'ACTIVE', rst_type: null,
      beds: Array.from({ length: beds }, (_, k) => ({ bed_id: String(++bedId), bed_roo_id: id, bed_num: String.fromCharCode(65 + k), bed_use_yn: 'Y', bed_gender: null })),
    });
  }
}
write('rooms', rooms);
const counts = { students: students.length, enrollments: enrollments.length, invoices: invoices.length, dorm_assignments: dorms.length, agencies: agencies.length, agents: agents.length, deposits: deposits.length, point_history: pointHistory.length, rooms: rooms.length };
fs.writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify({ source: 'sample', note: '개발용 가짜 데이터 (scripts/make-sample-data.mjs)', extracted_at: '2026-11-07T02:19:28.663Z', counts }, null, 2),
);
console.log('샘플 데이터 생성:', counts);
