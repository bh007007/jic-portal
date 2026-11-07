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

const write = (name, rows) => fs.writeFileSync(path.join(outDir, name + '.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
write('students', students);
write('enrollments', enrollments);
write('invoices', invoices);
write('dorm_assignments', dorms);
write('agencies', agencies);
write('agents', agents);
const counts = { students: students.length, enrollments: enrollments.length, invoices: invoices.length, dorm_assignments: dorms.length, agencies: agencies.length, agents: agents.length };
fs.writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify({ source: 'sample', note: '개발용 가짜 데이터 (scripts/make-sample-data.mjs)', extracted_at: '2026-11-07T02:19:28.663Z', counts }, null, 2),
);
console.log('샘플 데이터 생성:', counts);
