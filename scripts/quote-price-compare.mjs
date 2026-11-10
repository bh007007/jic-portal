// 견적 프로그램(공개 화면 /kr·/jp·/usd)의 코스·기숙사 4주 가격과 관리자 가격표(업체 가격표 추출본)를 비교한다(R-009, docs/price-quote-link.md).
// 가격표에는 개인정보가 없다. 결과는 건수와 이름만 출력한다.
//
// 실행(저장소 루트): node scripts/quote-price-compare.mjs
//   데이터 폴더: JIC_DATA_DIR → data/tables → data-sample/tables 순(샘플은 가짜 가격이라 '다름'이 많이 나온다)
//   견적 화면 주소: QUOTE_BASE(기본 https://quote.baguiojic.workers.dev)
import { existsSync, readFileSync } from 'node:fs';

const dir = [process.env.JIC_DATA_DIR, 'data/tables', 'data-sample/tables'].find((d) => d && existsSync(`${d}/price_course.ndjson`));
const base = process.env.QUOTE_BASE || 'https://quote.baguiojic.workers.dev';
const rd = (f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// 견적 화면 스크립트의 `const DATA = { 캠퍼스: { t: {코스: 4주 가격}, d: {기숙사: 4주 가격} } }`만 글자로 잘라 JSON으로 읽는다(코드는 실행하지 않는다)
function parseData(html) {
  const at = html.indexOf('const DATA = {');
  if (at < 0) throw new Error('견적 화면에서 DATA를 찾지 못했습니다');
  const s = at + 'const DATA = '.length;
  let depth = 0;
  let i = s;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return JSON.parse(html.slice(s, i + 1).replace(/^(\s*)([a-zA-Z_]\w*)\s*:/gm, '$1"$2":').replace(/,(\s*[}\]])/g, '$1'));
}

// 견적 이름 → 가격표 이름(11/10 확인). 적지 않은 이름은 같은 글자로 찾는다.
const MAP = {
  premium: {
    t: { 'Active Senior 5': 'ESL Active Senior (AS 5)', 'Active Senior 6': 'ESL Active Senior (AS 6)', 'Working Holiday 8': 'WH ESL', TOEIC: 'TOEIC 8' },
    d: {
      'Room for 1 Balcony': 'R1 (Bal)', 'Room for 1 No Balcony': 'R1', 'Semi-Single': 'Semi Single_2nd floor (F)', 'Couple Room Balcony': 'Couple Room (Bal)',
      'Room for 2 Balcony': 'R2 (Bal)', 'Room for 2 No Balcony': 'R2', 'Room for 4 Balcony': 'R4 (Bal)', 'Room for 4 No Balcony': 'R4',
    },
  },
  challenger: {
    t: { 'ESL Flex': 'ESL-Flex', 'ESL Lite': 'ESL-Lite', 'ESL Standard': 'ESL-Standard', 'IELTS Lite': 'IELTS-Lite', 'IELTS Standard': 'IELTS-Standard', 'IELTS Guarantee': 'IELTS-G (8W)' },
    d: { 'Room for 1 (studio)': 'R1 Studio', 'Room for 2 (studio)': 'R2 Studio', 'Room for 4 (loft)': 'R4 Loft', 'Room for 4 (studio)': 'R4 Studio' },
  },
};
const CAMPUS = { premium: 'PREMIUM', challenger: 'CHALLENGER' };
const CUR = { kr: 'won', jp: 'yen', usd: 'usd' };

const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜
const active = (r, s, f, u) => (!r[s] || r[s].slice(0, 10) <= today) && (!r[f] || r[f].slice(0, 10) >= today) && String(r[u] ?? 'Y').toUpperCase() !== 'N';
const courseCode = Object.fromEntries(rd('course_code.ndjson').map((c) => [c.co_id, c]));
const dormCode = Object.fromEntries(rd('dorm_code.ndjson').map((d) => [d.do_id, d]));
const courses = rd('price_course.ndjson').filter((r) => active(r, 'cc_start_date', 'cc_finish_date', 'cc_use_yn'));
const dorms = rd('price_dorm.ndjson').filter((r) => active(r, 'dc_start_date', 'dc_finish_date', 'dc_use_yn'));

let same = 0;
const diff = [];
const missing = [];
for (const page of Object.keys(CUR)) {
  const res = await fetch(`${base}/${page}`);
  if (!res.ok) throw new Error(`${page}: ${res.status}`);
  const data = parseData(await res.text());
  for (const campus of Object.keys(CAMPUS)) {
    for (const kind of ['t', 'd']) {
      const rows =
        kind === 't'
          ? courses
              .filter((r) => String(courseCode[r.cc_co_id]?.ca_code).toUpperCase() === CAMPUS[campus])
              .map((r) => ({ name: String(courseCode[r.cc_co_id].co_name).trim(), v: (Number(r[`cc_${CUR[page]}`] || 0) / Number(r.cc_week || 4)) * 4 }))
          : dorms
              .filter((r) => String(dormCode[r.dc_do_id]?.ca_code).toUpperCase() === CAMPUS[campus])
              .map((r) => ({ name: String(dormCode[r.dc_do_id].do_name).trim(), v: Number(r[`dc_${CUR[page]}`] || 0) }));
      for (const [name, v] of Object.entries(data[campus]?.[kind] ?? {})) {
        const hit = rows.filter((r) => r.name === (MAP[campus][kind][name] ?? name));
        if (!hit.length) missing.push(`${page}/${campus}/${name}`);
        else if (hit.some((h) => Math.round(h.v) === Math.round(v))) same++;
        else diff.push(`${page}/${campus}/${name}`);
      }
    }
  }
}
console.log(`데이터 ${dir}, 기준일 ${today}`);
console.log(`같음 ${same}, 다름 ${diff.length}, 가격표에 없음 ${missing.length}`);
if (diff.length) console.log(`다름: ${diff.join(' | ')}`);
if (missing.length) console.log(`가격표에 없음: ${missing.join(' | ')}`);
