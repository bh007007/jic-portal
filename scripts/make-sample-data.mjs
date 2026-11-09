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

// ── 인보이스 총액과 현지 인보이스: 실제 추출본과 같은 열. 별도 시드(seed7)라 위 값은 그대로다.
// sum_ic_price = 해외 인보이스 총액. 입금 매칭 합계(sum_id_amount)를 만든 같은 단가(주당 금액 × 주)라
// 완납은 입금 = 총액, 부분납은 총액의 40%, 미납은 0이 된다(실제 추출본도 완납 91%가 입금 = 총액).
// sum_tc_price / sum_td_amount = 현지 인보이스 청구 / 현지 납부(페소로 보임). 입학한 연수 일부, 거의 다 낸다.
let seed7 = 19;
const rand7 = () => ((seed7 = (seed7 * 1103515245 + 12345) % 2147483648) / 2147483648);
const WEEK_RATE = { KRW: 350000, JPY: 38000, USD: 280 };
for (const inv of invoices) {
  const e = enrollmentByTr.get(inv.tr_id);
  inv.sum_ic_price = String(Number(e.tr_total_week) * (WEEK_RATE[inv.tr_currency] ?? 280));
  const local = e.tr_start_date <= '2026-11-07' && rand7() < 0.35 ? 6500 + Math.round(rand7() * 4) * 1000 : 0;
  inv.sum_tc_price = String(local);
  inv.sum_td_amount = String(local && rand7() < 0.1 ? Math.round(local / 2) : local);
}

// ── 인보이스 항목(portal-extract-invoice-items.js 와 같은 표·열). 별도 시드(seed8)라 위 값은 그대로다.
// inv_invoice_cost_st = 학생 가격 항목, inv_invoice_cost_ag = 에이전시 공제, inv_etc = 현지 비용(tc_*)·납부(td_*), PHP.
// 실제 추출본처럼 학생 가격 합계 − 에이전시 공제 합계 = sum_ic_price 가 되게 만들고, 일부 연수에는 예전 버전(ic_ver 1) 항목을 남긴다.
let seed8 = 23;
const rand8 = () => ((seed8 = (seed8 * 1103515245 + 12345) % 2147483648) / 2147483648);
const costSt = [], costAg = [], localEtc = [];
const REGIST_FEE = { KRW: 150000, JPY: 15000, USD: 150 };
const IC_NAME = { COURSE: 'Course', REGIST: 'Registration Fee', DORM: 'Dormitory', PROMO: 'Promotion', AGENCY_COMM: 'Agency Commission', AGENCY_REGIST: 'Agency Registration' };
const stripW = (s) => String(s || '').replace(/\(\d+w\)$/, '');
let icNo = 600000, tcNo = 700000, tdNo = 800000;
for (const inv of invoices) {
  const e = enrollmentByTr.get(inv.tr_id);
  const cur = inv.tr_currency, total = Number(inv.sum_ic_price), weeks = Number(e.tr_total_week);
  const reg = REGIST_FEE[cur] ?? 150;
  const comm = Math.round(total * 0.15);
  const agReg = rand8() < 0.5 ? Math.round(reg / 2) : 0;
  const promo = rand8() < 0.3 ? -Math.round(total * 0.05) : 0;
  const stay = !/^Stay Out/.test(e.dorms);
  const dorm = stay ? Math.round((total + comm + agReg - reg) * 0.35) : 0;
  const course = total + comm + agReg - reg - dorm - promo;
  const twoVersions = rand8() < 0.1;
  const ver = twoVersions ? 2 : 1;
  const base = (type, price, extra = {}) => ({
    _tr_id: inv.tr_id, ic_id: String(++icNo), ic_tr_id: inv.tr_id, ic_ver: String(ver), ic_type: type, ic_type_name: IC_NAME[type],
    ic_currency: cur, ic_price: String(price), ic_week: String(weeks), ic_use_yn: 'Y', ic_cancel_yn: 'N', ...extra,
  });
  if (twoVersions) costSt.push({ ...base('COURSE', Math.round(course * 0.9), { co_name: stripW(e.courses) }), ic_ver: '1' }); // 예전 버전: 최신만 쓰는지 확인용
  costSt.push(base('REGIST', reg, { ic_week: '0' }));
  costSt.push(base('COURSE', course, { co_name: stripW(e.courses), ic_departure_date: e.tr_start_date, ic_return_date: e.tr_finish_date }));
  if (stay) costSt.push(base('DORM', dorm, { do_name: stripW(e.dorms), ic_departure_date: e.sd_departure_date, ic_return_date: day(e.tr_finish_date, 1) }));
  if (promo) costSt.push(base('PROMO', promo, { ic_week: '0' }));
  costAg.push(base('AGENCY_COMM', comm, { ic_week: '0' }));
  if (agReg) costAg.push(base('AGENCY_REGIST', agReg, { ic_week: '0' }));
  // 현지 비용: seed7 의 sum_tc_price(6,500 + 1,000 × n) 를 SSP 와 교재로 나눈다. 납부는 SSP 부터 채운다.
  const tc = Number(inv.sum_tc_price), td = Number(inv.sum_td_amount);
  if (tc > 0) {
    const charges = [['SSP', 'SSP (Valid for 6 mon)', 6500], ...(tc > 6500 ? [['BOOK', 'Class Materials', tc - 6500]] : [])];
    let left = td;
    for (const [type, name, price] of charges) {
      const paidPart = Math.min(price, Math.max(0, left));
      left -= paidPart;
      localEtc.push({ _tr_id: inv.tr_id, tc_id: String(++tcNo), ec_type: type, tc_type_name: name, tc_currency: 'PHP', tc_price: String(price), rest_amount: String(price - paidPart), td_id: null, td_currency: null, td_amount: null, td_deposit_dt: null });
    }
    if (td > 0) localEtc.push({ _tr_id: inv.tr_id, tc_id: String(tcNo), ec_type: '', tc_type_name: null, tc_currency: null, tc_price: null, rest_amount: null, td_id: String(++tdNo), td_currency: 'PHP', td_amount: String(td), td_deposit_dt: `${day(e.tr_start_date, 1)} 10:00:00` });
  }
}
for (const [name, rows] of [['inv_invoice_cost_st', costSt], ['inv_invoice_cost_ag', costAg], ['inv_etc', localEtc]]) {
  fs.writeFileSync(path.join(outDir, name + '.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
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

// ── 통계·중단·메모 보조(11/8): 상태 코드, 입국·귀국일, 첫 인보이스 발행일, 인보이스 국적, 취소 날짜·사유, 아카데미 메모.
// 실제 추출본과 같은 열 이름(tr_state, tr_departure_date, tr_return_date, tr_invoice_dt, tr_st_country …). 별도 시드라 위 값은 그대로다.
let seed6 = 19;
const rand6 = () => ((seed6 = (seed6 * 1103515245 + 12345) % 2147483648) / 2147483648);
const STATE_CODE = { 인보이스승인: 'INVOICE', 캔슬: 'CANCEL', '연수중 취소': 'CANCEL_TRAIN' };
const COUNTRY_CODE = { 일본: ['JPN', 'Japan'], 대만: ['TWN', 'Taiwan'], 한국: ['KOR', 'Korea'], 중국: ['CHN', 'China'], 베트남: ['VIE', 'Vietnam'], 사우디아라비아: ['SAU', 'Saudi Arabia'], 예멘: ['YEM', 'Yemen'] };
const CANCEL_REASONS = ['샘플: 개인 사정으로 입학 취소', '샘플: 비자 일정 문제', '샘플: 다른 일정으로 변경 요청'];
const STOP_REASONS = ['샘플: 가족 사정으로 조기 귀국', '샘플: 건강 문제로 귀국', '샘플: 취업 일정으로 조기 종료'];
const SAMPLE_REF = '2026-11-07';
const notAfter = (d) => (d <= SAMPLE_REF ? d : SAMPLE_REF);
for (const e of enrollments) {
  const [code, nameEn] = COUNTRY_CODE[e.st_country_name];
  const planned = day(e.sd_departure_date, -(10 + Math.floor(rand6() * 70)));
  const invoiceDay = planned <= SAMPLE_REF ? planned : day(SAMPLE_REF, -Math.floor(rand6() * 50)); // 추출일 이후 발행은 없다
  Object.assign(e, {
    tr_state: STATE_CODE[e.tr_state_name] ?? 'INVOICE',
    tr_departure_date: e.sd_departure_date,
    tr_return_date: day(e.tr_finish_date, 1),
    tr_invoice_dt: `${invoiceDay} ${two(9 + Math.floor(rand6() * 9))}:${two(Math.floor(rand6() * 60))}:00`,
    tr_st_country: code,
    tr_st_country_name: nameEn,
    st_country: code,
  });
  if (e.tr_state === 'CANCEL') {
    e.tr_cancel_dt = `${notAfter(day(e.sd_departure_date, -(3 + Math.floor(rand6() * 30))))} 11:00:00`;
    e.tr_cancel_memo = CANCEL_REASONS[Math.floor(rand6() * CANCEL_REASONS.length)];
  }
  if (e.tr_state === 'CANCEL_TRAIN') {
    const stop = notAfter(day(e.tr_start_date, 7 * (1 + Math.floor(rand6() * Math.max(1, Number(e.tr_total_week) - 1))) - 2));
    e.tr_cancel_train_dt = `${stop} 15:00:00`;
    e.tr_cancel_train_memo = STOP_REASONS[Math.floor(rand6() * STOP_REASONS.length)];
    if (stop > e.tr_start_date) e.tr_return_date = day(stop, 1); // 업체 포털도 연수 중 취소는 귀국일을 당긴다
  }
  if (rand6() < 0.08) e.tr_br_memo_en = '샘플 메모: 첫 주 레벨 재평가 예정';
}

const write = (name, rows) => fs.writeFileSync(path.join(outDir, name + '.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// ── 연장·변경(portal-extract-extend.js 와 같은 표·열). 별도 시드(seed9)라 위 값은 그대로다.
// 실제 추출본처럼 연장 기간(tt_*)은 원래 종료일(tr_finish_date) 뒤에 붙는다. 연수 열(tr_total_week·tr_return_date)은 바꾸지 않는다.
// 학생 앱·인트라넷 시험이 쓰는 학생(30001·30095·30140)은 넣지 않는다.
let seed9 = 29;
const rand9 = () => ((seed9 = (seed9 * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick9 = (arr) => arr[Math.floor(rand9() * arr.length)];
const TESTED = new Set(['30001', '30095', '30140']);
const extend = [], changeCourse = [], changeDorm = [], changeComeback = [];
let ttNo = 50000, chgNo = 650000;
for (const e of enrollments) {
  if (e.tr_state !== 'INVOICE' || TESTED.has(e.tr_st_id) || e.tr_start_date > SAMPLE_REF) continue;
  const inv = invoices.find((i) => i.tr_id === e.tr_id);
  const campus = CAMPUS[e.first_co_ca_code];
  const course = stripW(e.courses), dorm = stripW(e.dorms);
  const r = rand9();
  if (r < 0.14) {
    let start = day(e.tr_finish_date, 2); // 원래 종료(금) 다음 일요일부터
    const times = rand9() < 0.2 ? 2 : 1;
    for (let k = 0; k < times; k++) {
      const w = pick9([2, 4, 4, 4, 8]);
      const finish = day(start, w * 7 - 2);
      const price = w * (WEEK_RATE[inv.tr_currency] ?? 280);
      extend.push({
        tr_id: e.tr_id, tt_id: String(++ttNo), tt_tr_id: e.tr_id, tt_ini_ver: '1', tt_start_date: start, tt_finish_date: finish, tt_week: String(w),
        tt_memo: rand9() < 0.3 ? '샘플: 레벨 테스트 후 연장 희망' : null, tt_insert_dt: `${notAfter(day(start, -(7 + Math.floor(rand9() * 30))))} 14:00:00`,
        sum_price: String(price), sum_amount: String(rand9() < 0.4 ? price : 0), tr_currency: inv.tr_currency,
      });
      start = day(finish, 2);
    }
  } else if (r < 0.24 && Number(e.tr_total_week) >= 8) {
    const next = pick9(campus.courses.filter((c) => c !== course));
    const date = day(e.tr_start_date, 28);
    changeCourse.push({ tr_id: e.tr_id, ic_id: String(++chgNo), prev_chg_course: course, chg_course: next, chg_course_date: date, prev_chg_dorm: dorm, chg_dorm: dorm, chg_dorm_date: date, rqp_cnt: rand9() < 0.3 ? '1' : '0' });
  } else if (r < 0.32 && !/^Stay Out/.test(dorm)) {
    const next = pick9(campus.dorms.filter((d) => d !== dorm && !/^Stay Out/.test(d)));
    const date = day(e.tr_start_date, 7 * (1 + Math.floor(rand9() * Math.max(1, Number(e.tr_total_week) - 1))));
    changeDorm.push({ tr_id: e.tr_id, ic_id: String(++chgNo), prev_chg_course: course, chg_course: course, chg_course_date: date, prev_chg_dorm: dorm, chg_dorm: next, chg_dorm_date: date, rqp_cnt: rand9() < 0.4 ? '1' : '0' });
  } else if (r < 0.36) {
    changeComeback.push({ tr_id: e.tr_id, ic_id: String(++chgNo), prev_chg_course: null, chg_course: course, chg_course_date: e.tr_start_date, prev_chg_dorm: null, chg_dorm: dorm, chg_dorm_date: e.tr_start_date, rqp_cnt: '0' });
  }
}
write('extend', extend);
write('change_course', changeCourse);
write('change_dorm', changeDorm);
write('change_comeback', changeComeback);

// ── 인보이스별 합계(inv_summary)와 업체 Check Balance(balance). 무작위 없이 위 값에서 만든다(seed10 자리, 기존 값은 그대로).
// 실제 추출본처럼 기본 인보이스 1줄(tt_insert_dt 비어 있음) + 연장 인보이스 줄(연장현황의 sum_price·sum_amount),
// Check Balance 의 cost·payment = 그 합이다.
const invSummary = [], balance = [];
const DEPOSIT_STATE = { 미납: 'NONE', 부분납: 'PART', 완납: 'FULL' };
for (const inv of invoices) {
  const e = enrollmentByTr.get(inv.tr_id);
  const exts = extend.filter((t) => t.tr_id === inv.tr_id);
  invSummary.push({
    _tr_id: inv.tr_id, tt_id: '0', tt_tr_id: inv.tr_id, tt_insert_dt: null, week: e.tr_total_week, start_date: e.tr_start_date, finish_date: e.tr_finish_date,
    tr_currency: inv.tr_currency, sum_ic_price: inv.sum_ic_price, sum_id_amount: inv.sum_id_amount, sum_tc_price: inv.sum_tc_price, sum_td_amount: inv.sum_td_amount,
  });
  for (const t of exts) {
    invSummary.push({
      _tr_id: inv.tr_id, tt_id: t.tt_id, tt_tr_id: inv.tr_id, tt_insert_dt: t.tt_insert_dt, week: t.tt_week, start_date: t.tt_start_date, finish_date: t.tt_finish_date,
      tr_currency: inv.tr_currency, sum_ic_price: t.sum_price, sum_id_amount: t.sum_amount, sum_tc_price: '0', sum_td_amount: '0',
    });
  }
  const cost = Number(inv.sum_ic_price) + exts.reduce((s, t) => s + Number(t.sum_price), 0);
  const payment = Number(inv.sum_id_amount) + exts.reduce((s, t) => s + Number(t.sum_amount), 0);
  balance.push({ tr_id: inv.tr_id, tr_currency: inv.tr_currency, tr_deposit_state: DEPOSIT_STATE[e.tr_deposit_name] ?? 'NONE', tr_state: e.tr_state, extend_count: String(exts.length), cost: String(cost), payment: String(payment) });
}
write('inv_summary', invSummary);
write('balance', balance);

// ── 가격표(portal-extract-prices.js 와 같은 표·열). 무작위 없이 정한 값이라 다른 표는 그대로다.
// 코스 가격은 4주 기준, 기간별 값은 4주 = 100. 시험용으로 지난 가격 1줄, 가격 없는 코스(TOEIC) 1개, 끝난 기타비용·프로모션 1줄씩.
const courseCode = [], dormCode = [], priceCourse = [], priceDorm = [];
let coNo = 100, doNo = 200;
for (const [code, c] of Object.entries(CAMPUS)) {
  c.courses.forEach((name, i) => {
    const id = String(++coNo);
    courseCode.push({ co_id: id, co_ca_id: code === 'PREMIUM' ? '12' : '11', co_name: name, co_name_short: name, co_type: 'REG', co_week_only: '', co_country_only: '', co_order: String(i + 1), co_use_yn: 'Y', co_start_date: '2010-01-01', co_finish_date: '2099-12-31', ca_code: code });
    if (name === 'TOEIC') return;
    const usd = 1000 + i * 80 + (code === 'PREMIUM' ? 120 : 0);
    priceCourse.push({ cc_co_id: id, cc_week: '4', cc_won: String(usd * 1350), cc_usd: String(usd), cc_yen: String(usd * 150), cc_peso: '0', cc_start_date: '2024-01-01', cc_finish_date: '2099-12-31' });
    if (i === 0) priceCourse.push({ cc_co_id: id, cc_week: '4', cc_won: String((usd - 60) * 1350), cc_usd: String(usd - 60), cc_yen: String((usd - 60) * 150), cc_peso: '0', cc_start_date: '2023-01-01', cc_finish_date: '2023-12-31' });
  });
  c.dorms.forEach((name, i) => {
    const id = String(++doNo);
    const out = /^Stay Out/.test(name);
    dormCode.push({ do_id: id, do_ca_id: code === 'PREMIUM' ? '12' : '11', do_name: name, do_name_short: name, do_type: out ? 'NONROOM' : '', do_gender: '', do_max: out ? '0' : String(name.startsWith('R4') ? 4 : 2), do_include: '', do_order: String(i + 1), do_use_yn: 'Y', do_start_date: '2010-01-01', do_finish_date: '2099-12-31', ca_code: code });
    const usd = out ? 0 : name.startsWith('R2') ? 760 : 560;
    priceDorm.push({ dc_do_id: id, dc_won: String(usd * 1350), dc_usd: String(usd), dc_yen: String(usd * 150), dc_peso: '0', dc_start_date: '2024-01-01', dc_finish_date: '2099-12-31' });
  });
}
const priceSetting = [{ cs_id: '3', cs_br_id: '3', cs_1w: '40', cs_2w: '65', cs_3w: '85', cs_4w: '100', cs_5w: '125', cs_6w: '150', cs_7w: '175', cs_8w: '200', cs_1w_more: '25', cs_start_date: '2020-01-01', cs_finish_date: '2099-12-31', cs_use_yn: 'Y' }];
const ETC = [
  ['SSP', 'SSP (Valid for 6 mon)', 0, 0, 0, 6500, 'P'], ['VISA', 'Visa Extension (4w)', 0, 0, 0, 3800, 'P'], ['BOOK', 'Class Materials', 0, 0, 0, 1000, 'P'],
  ['PICKUP', 'Airport Pick-up', 65000, 50, 7000, 0, ''], ['LAUNDRY', 'Laundry Fee (4w basis)', 0, 0, 0, 1000, 'PI'], ['REGIST', 'Registration Fee', 150000, 150, 15000, 0, ''],
];
const priceEtc = ETC.map(([type, name, won, usd, yen, peso, point], i) => ({ ec_id: String(300 + i), ec_br_id: '3', ec_name: name, ec_type: type, ec_won: String(won), ec_usd: String(usd), ec_yen: String(yen), ec_peso: String(peso), ec_start_date: '2024-01-01', ec_finish_date: '2099-12-31', ec_use_yn: 'Y', ec_point_flag: point, ec_order: String(i + 1), ec_memo: null }));
priceEtc.push({ ec_id: '399', ec_br_id: '3', ec_name: 'Old Book Set', ec_type: 'BOOK', ec_won: '0', ec_usd: '0', ec_yen: '0', ec_peso: '800', ec_start_date: '2023-01-01', ec_finish_date: '2024-12-31', ec_use_yn: 'Y', ec_point_flag: 'P', ec_order: '99', ec_memo: '샘플: 끝난 항목' });
const promoRows = [
  { prm_id: '1', prm_kind: 'DC', prm_type: '', prm_name: '샘플: 겨울 기숙사 할인', prm_name_en: 'Winter Dorm DC', prm_note: '샘플: 12주 이상 등록 시 기숙사 5% 할인', prm_country: '', prm_currency: 'KRW', prm_campus: '', prm_target: 'DORM', prm_target_id: '', prm_target_weeks_yn: 'Y', prm_show_start_date: '2026-10-01', prm_show_finish_date: '2026-12-31', prm_reg_start_date: '2026-10-01', prm_reg_finish_date: '2026-12-31', prm_allow_stacking_yn: 'N', prm_priority: '1', prm_use_yn: 'Y', campus_code: 'PREMIUM', conditions: '[]' },
  { prm_id: '2', prm_kind: 'DC', prm_type: '', prm_name: '샘플: 여름 조기 등록', prm_name_en: 'Summer Early Bird', prm_note: null, prm_country: '', prm_currency: 'USD', prm_campus: '', prm_target: '', prm_target_id: '', prm_target_weeks_yn: 'N', prm_show_start_date: '2026-03-01', prm_show_finish_date: '2026-05-31', prm_reg_start_date: '2026-03-01', prm_reg_finish_date: '2026-05-31', prm_allow_stacking_yn: 'Y', prm_priority: '2', prm_use_yn: 'Y', campus_code: '', conditions: '[]' },
];
const commRule = [
  { acr_id: '1', acr_level: 'ACADEMY', acr_type: 'BASE', acr_ag_id: '0', ag_name: null, acr_country: '', country_name: '', acr_min_week: '0', acr_max_week: '0', acr_start_date: '2020-01-01', acr_finish_date: '2099-12-31', acr_rate: '0.2800', acr_memo: null, is_now: '1' },
  { acr_id: '2', acr_level: 'ACADEMY', acr_type: 'EXTEND', acr_ag_id: '0', ag_name: null, acr_country: '', country_name: '', acr_min_week: '0', acr_max_week: '0', acr_start_date: '2020-01-01', acr_finish_date: '2099-12-31', acr_rate: '0.2000', acr_memo: null, is_now: '1' },
  { acr_id: '3', acr_level: 'AGENCY', acr_type: 'BASE', acr_ag_id: agencies[0].ag_id, ag_name: agencies[0].ag_name, acr_country: '', country_name: '', acr_min_week: '0', acr_max_week: '0', acr_start_date: '2024-01-01', acr_finish_date: '2099-12-31', acr_rate: '0.2500', acr_memo: '샘플: 협력 에이전시', is_now: '1' },
];
write('course_code', courseCode);
write('dorm_code', dormCode);
write('price_course', priceCourse);
write('price_dorm', priceDorm);
write('price_setting', priceSetting);
write('price_etc', priceEtc);
write('promo', promoRows);
write('comm_rule', commRule);

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
