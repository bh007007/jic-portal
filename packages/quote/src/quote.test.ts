/**
 * 견적 계산 시험(R-014). 기준: 기획 '견적 정정 목록 1112' 3장 검증 예시 11건(CL-068) — 포털 견적은 이 금액과 같아야 한다.
 * 실행: npm run quote:test (CI에서도 돈다)
 */
import { LOCAL_FEE_NOTICE, PRICE_BOOK_2026 as B, quote, systemForCountry, validate, type QuoteInput, type QuoteOk } from './index';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail: unknown = '') => (cond ? pass++ : fails.push(`${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
const q = (i: QuoteInput) => {
  const r = quote(i, B);
  if (!r.ok) throw new Error(`${JSON.stringify(i)} → ${r.errors.join(' / ')}`);
  return r;
};
const line = (r: QuoteOk, key: string) => [...r.charges, ...r.discounts].filter((l) => l.key.startsWith(key)).reduce((a, l) => a + l.amount, 0);

// 1) 검증 예시 11건: 총 학비와 현지비용(₱)
const C = (id: string, weeks: number) => ({ id, weeks });
const cases: [string, QuoteInput, number, number][] = [
  ['#1 /kr Challenger 2주', { system: 'kr', start: '2026-09-13', courses: [C('ESL Flex', 2)], dorms: [C('Room for 4 (studio)', 2)] }, 1107500, 18650],
  ['#2 /kr Premium 12주', { system: 'kr', start: '2026-09-13', courses: [C('Speaking Starter', 12)], dorms: [C('Room for 2 Balcony', 12)] }, 6310000, 46750],
  ['#3 /kr Challenger 성수기 8주', { system: 'kr', start: '2026-07-05', courses: [C('ESL Core', 8)], dorms: [C('Room for 4 (loft)', 8)] }, 4470000, 34040],
  ['#4 /kr 혼합 12주', { system: 'kr', start: '2026-07-05', courses: [C('ESL Flex', 8), C('Working Holiday 8', 4)], dorms: [C('Room for 1 (studio)', 8), C('Room for 1 Balcony', 4)] }, 7800000, 46050],
  ['#5 /usd Challenger + Guarantee', { system: 'usd', start: '2026-09-13', courses: [C('ESL Core', 4), C('IELTS Guarantee', 8)], dorms: [C('Room for 1 (studio)', 12)] }, 6530, 65650],
  ['#6 /usd Premium 24주', { system: 'usd', start: '2026-03-01', courses: [C('ESL TEP 8', 24)], dorms: [C('Room for 4 No Balcony', 24)] }, 7880, 79570],
  ['#7 /usd-new Challenger 8주', { system: 'usd-new', start: '2026-09-13', courses: [C('ESL Standard', 8)], dorms: [C('Room for 2 (studio)', 8)] }, 2820, 34240],
  ['#8 /usd-new Premium 성수기 4주', { system: 'usd-new', start: '2026-07-05', courses: [C('Speaking Pro', 4)], dorms: [C('Room for 1 Balcony', 4)] }, 2485, 22400],
  ['#9 /jp Challenger 1주', { system: 'jp', start: '2026-10-04', courses: [C('ESL Lite', 1)], dorms: [C('Room for 4 (studio)', 1)] }, 93380, 18850],
  ['#10 /jp Premium 홀리데이 12주', { system: 'jp', start: '2026-11-29', courses: [C('Speaking Master', 12)], dorms: [C('Room for 2 No Balcony', 12)] }, 844500, 47950],
  ['#11 /usd-new Premium 24주', { system: 'usd-new', start: '2026-03-01', courses: [C('ESL TEP 8', 24)], dorms: [C('Room for 4 No Balcony', 24)] }, 7180, 79570],
];
for (const [name, input, total, php] of cases) {
  const r = q(input);
  ok(`${name} 총 학비`, r.total === total, `${r.total} ≠ ${total}`);
  ok(`${name} 현지비용`, r.localTotal === php, `${r.localTotal} ≠ ${php}`);
}

// 2) 항목별 금액(정정본 '검증 예시' 시트)
const r3 = q(cases[2][1]);
ok('#3 성수기 7주 × ₩50,000', line(r3, 'peak26') === 350000 && r3.charges.some((l) => l.label.includes('7주')), r3.charges);
ok('#3 비수기 8/23 1주는 할인 없음', r3.discounts.length === 0, r3.discounts);
const r2 = q(cases[1][1]);
ok('#2 비수기 12주 → 3회 × ₩50,000', line(r2, 'lean26_sd') === 150000 && line(r2, 'long') === 300000, r2.discounts);
const r4 = q(cases[3][1]);
ok('#4 혼합: 코스 ₩2,730,000 · 숙소 ₩4,970,000', line(r4, 'course:') === 2730000 && line(r4, 'dorm:') === 4970000, r4.charges);
ok('#4 혼합: 프리미엄 숙소 4주만 비수기 1회', line(r4, 'lean26_sd') === 50000 && r4.mixed && r4.charges.some((l) => l.label.startsWith('[PC]')), r4.discounts);
const r5 = q(cases[4][1]);
ok('#5 Guarantee ₱18,000 1회', r5.local.filter((l) => l.key === 'guarantee').length === 1 && line(r5, 'course:') === 2980, r5.local);
const r6 = q(cases[5][1]);
ok('#6 비수기 4인 17주 → 4회 × $150, 장기 $600, 성수기 $280', line(r6, 'lean26_quad') === 600 && line(r6, 'long') === 600 && line(r6, 'peak26') === 280, [r6.charges, r6.discounts]);
const r11 = q(cases[10][1]);
ok('#11 GS Lean 17주 → 8회 × $200, Peak 7주 → 3회 × $100, 장기 없음', line(r11, 'gs26_lean') === 1600 && line(r11, 'gs26_peak') === 300 && line(r11, 'long') === 0, r11.discounts);
const r8 = q(cases[7][1]);
ok('#8 /usd-new 성수기 4주 × $40', line(r8, 'peak26') === 160 && line(r8, 'gs26_peak') === 200, [r8.charges, r8.discounts]);
const r10 = q(cases[9][1]);
ok('#10 일본은 비수기 없음, 홀리데이 ¥30,000 + 장기 ¥10,000', line(r10, 'lean') === 0 && line(r10, 'holiday26') === 30000 && line(r10, 'long') === 10000, r10.discounts);
const r1 = q(cases[0][1]);
ok('#1 4주 미만: 2주 = 65%, 할인 없음', line(r1, 'course:') === 520000 && line(r1, 'dorm:') === 487500 && r1.discounts.length === 0, r1);
ok('#1 종료일 = 시작 + 2주 − 1일', r1.end === '2026-09-26', r1.end);

// 3) 정정 목록 2장: v88과 다르게 할 것
const gs27 = q({ system: 'usd-new', start: '2027-07-04', courses: [C('ESL Core', 4)], dorms: [C('Room for 4 (loft)', 4)] });
ok("/usd-new 2027 성수기 $60(v88은 $40)", line(gs27, 'peak27') === 240, gs27.charges);
ok("/usd-new 2027 Peak GS 4주 → 1회 × $200", line(gs27, 'gs27_peak') === 200, gs27.discounts);
const lean27single = q({ system: 'kr', start: '2027-09-05', courses: [C('Speaking Starter', 8)], dorms: [C('Room for 1 No Balcony', 8)] });
ok('2027 비수기: 1인실(No Balcony 포함) 할인 없음', line(lean27single, 'lean27') === 0, lean27single.discounts);
const lean27semi = q({ system: 'kr', start: '2027-09-05', courses: [C('Speaking Starter', 8)], dorms: [C('Semi-Single', 8)] });
ok('2027 비수기: Semi 8주 → 2회 × ₩50,000', line(lean27semi, 'lean27_sd') === 100000, lean27semi.discounts);
const lean26single = q({ system: 'kr', start: '2026-09-06', courses: [C('Speaking Starter', 4)], dorms: [C('Room for 1 Balcony', 4)] });
ok('2026 비수기: Room for 1 Balcony 적용', line(lean26single, 'lean26_sd') === 50000, lean26single.discounts);
const lean6 = q({ system: 'usd', start: '2026-09-06', courses: [C('ESL Core', 6)], dorms: [C('Room for 4 (loft)', 6)] });
ok('비수기 2주 단위: 6주 → 1.5회 × $150', line(lean6, 'lean26_quad') === 225, lean6.discounts);
const lean5 = q({ system: 'usd', start: '2026-09-06', courses: [C('ESL Core', 5)], dorms: [C('Room for 4 (loft)', 5)] });
ok('비수기 2주 단위: 5주 → 2주 단위 2번 = 1회', line(lean5, 'lean26_quad') === 150, lean5.discounts);
const jpLean = q({ system: 'jp', start: '2026-09-06', courses: [C('ESL Core', 8)], dorms: [C('Room for 4 (loft)', 8)] });
ok('일본: 비수기 할인 없음', line(jpLean, 'lean') === 0, jpLean.discounts);
const short = q({ system: 'kr', start: '2026-07-05', courses: [C('ESL Core', 3)], dorms: [C('Room for 4 (loft)', 3)] });
ok('4주 미만: 할인 없음, 성수기 추가요금은 적용', short.discounts.length === 0 && line(short, 'peak26') === 150000, short);

// 4) 홀리데이 2027 커플룸(정해지지 않음): 결과를 바꾸면 할인하지 않고 확인 필요로 남긴다
const hol27couple = q({ system: 'kr', start: '2027-11-28', courses: [C('Speaking Starter', 4)], dorms: [C('Couple Room Balcony', 4)] });
ok('홀리데이 27 커플룸만: 할인 없음 + 확인 필요', line(hol27couple, 'holiday27') === 0 && hol27couple.pending.length === 1, hol27couple);
const hol27double = q({ system: 'kr', start: '2027-11-28', courses: [C('Speaking Starter', 4)], dorms: [C('Room for 2 Balcony', 4)] });
ok('홀리데이 27 2인실: ₩150,000', line(hol27double, 'holiday27') === 150000 && hol27double.pending.length === 0, hol27double.discounts);
const hol26semi = q({ system: 'usd', start: '2026-12-13', courses: [C('Speaking Starter', 4)], dorms: [C('Semi-Single', 4)] });
ok('홀리데이 26: Semi는 대상 아님', line(hol26semi, 'holiday26') === 0, hol26semi.discounts);
const jpHol27 = q({ system: 'jp', start: '2027-11-28', courses: [C('Speaking Starter', 4)], dorms: [C('Room for 2 Balcony', 4)] });
ok('일본 홀리데이 27 삭제', line(jpHol27, 'holiday') === 0, jpHol27.discounts);

// 5) 장기등록·현지비용 단계
const long30 = q({ system: 'kr', start: '2026-01-04', courses: [C('ESL Core', 30)], dorms: [C('Room for 4 (loft)', 30)] });
ok('장기 30주: ₩300,000 + 9 × ₩50,000', line(long30, 'long') === 750000, long30.discounts);
ok('25주 이상 SSP 2회, 비자 24주 단계', long30.local.find((l) => l.key === 'ssp')?.amount === 15600 && long30.local.find((l) => l.key === 'visa')?.amount === 23870, long30.local);
const pick = q({ system: 'kr', start: '2026-09-13', courses: [C('ESL Flex', 2)], dorms: [C('Room for 4 (studio)', 2)], pickup: 'manila_solo' });
ok('공항 픽업은 현지비용에 1회', pick.localTotal === 18650 + 13000, pick.localTotal);
const jpRound = q({ system: 'jp', start: '2026-10-04', courses: [C('Speaking Pro', 5)], dorms: [C('Room for 4 Balcony', 5)] });
ok('반올림: ¥141,375 ÷ 4 × 5 = ¥176,718.75 → ¥176,719', line(jpRound, 'course:') === 176719, jpRound.charges);

// 6) 입력 검사(CL-060·062): 정정 목록 4장의 '막혀야 정상' 예
const bad = validate({ system: 'kr', start: '2026-07-05', courses: [C('ESL Flex', 8), C('Working Holiday 8', 4)], dorms: [C('Room for 1 (studio)', 12), C('Couple Room Balcony', 1)] }, B);
ok('혼합 위반 예: 주수 합·캠퍼스 일치·최소 4주 모두 걸림', bad.some((m) => m.includes('주수 합')) && bad.some((m) => m.includes('같은 캠퍼스')) && bad.some((m) => m.includes('최소 4주')), bad);
ok('막힌 입력은 계산하지 않음', !quote({ system: 'kr', start: '2026-07-05', courses: [C('ESL Flex', 8), C('Working Holiday 8', 4)], dorms: [C('Room for 1 (studio)', 12), C('Couple Room Balcony', 1)] }, B).ok);
ok('Guarantee 12주는 막음', validate({ system: 'usd', start: '2026-09-13', courses: [C('IELTS Guarantee', 12)], dorms: [C('Room for 1 (studio)', 12)] }, B).some((m) => m.includes('8주 고정')));
ok('Guarantee 뒤 코스는 막음', validate({ system: 'usd', start: '2026-09-13', courses: [C('IELTS Guarantee', 8), C('ESL Core', 4)], dorms: [C('Room for 1 (studio)', 12)] }, B).some((m) => m.includes('마지막')));
ok('Premium 코스 뒤 Guarantee는 됨(혼합)', quote({ system: 'kr', start: '2026-09-13', courses: [C('Speaking Starter', 4), C('IELTS Guarantee', 8)], dorms: [C('Room for 2 Balcony', 4), C('Room for 1 (studio)', 8)] }, B).ok);
ok('캠퍼스 기간 나뉨은 막음', validate({ system: 'kr', start: '2026-09-13', courses: [C('ESL Core', 4), C('Speaking Starter', 4), C('ESL Lite', 4)], dorms: [C('Room for 4 (loft)', 4), C('Room for 2 Balcony', 4), C('Room for 4 (loft)', 4)] }, B).some((m) => m.includes('이어 붙여야')));
ok('같은 캠퍼스 안에서 코스를 나눠도 됨', quote({ system: 'kr', start: '2026-09-13', courses: [C('ESL Core', 4), C('IELTS Core', 8)], dorms: [C('Room for 4 (loft)', 12)] }, B).ok);
ok('시작일이 일요일이 아니면 막음', validate({ system: 'kr', start: '2026-09-14', courses: [C('ESL Core', 4)], dorms: [C('Room for 4 (loft)', 4)] }, B).some((m) => m.includes('일요일')));
ok('없는 코스는 막음', validate({ system: 'kr', start: '2026-09-13', courses: [C('Premium ESL', 4)], dorms: [C('Room for 4 (loft)', 4)] }, B).some((m) => m.includes('없는 코스')));

// 7) 가격 체계 자동 선택(CL-063)과 고정 문구(CL-059)
ok('국가 → 가격 체계', [systemForCountry('한국'), systemForCountry('일본'), systemForCountry('대만'), systemForCountry('중국'), systemForCountry('사우디아라비아'), systemForCountry('베트남'), systemForCountry('몽골'), systemForCountry(null)].join() === 'kr,jp,usd,usd,usd,usd-new,usd-new,usd-new');
ok('현지비용 고정 문구 3개 언어', LOCAL_FEE_NOTICE.kr.includes('필리핀 이민국') && LOCAL_FEE_NOTICE['usd-new'].startsWith('※ Local fees') && LOCAL_FEE_NOTICE.jp.includes('現地費用'));
ok('대만 Fair promotion은 자동 적용 안 함', q({ system: 'usd', start: '2026-09-13', courses: [C('ESL Core', 4)], dorms: [C('Room for 4 (loft)', 4)] }).discounts.every((l) => l.key !== 'fair_tw'));
const fair = q({ system: 'usd', start: '2026-09-13', courses: [C('ESL Core', 4)], dorms: [C('Room for 4 (loft)', 4)], confirmed: [{ id: 'fair_tw', amount: 100, by: '담당자', on: '2026-11-12' }] });
ok('Fair promotion은 확인한 금액만(2차)', line(fair, 'fair_tw') === 100, fair.discounts);

console.log(`견적 계산 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
