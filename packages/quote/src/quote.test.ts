/**
 * 견적 계산 시험(R-014). 기준: 기획 '견적 정정 목록 1112' 3장 검증 예시 11건(CL-068) — 포털 견적은 이 금액과 같아야 한다.
 * 실행: npm run quote:test (CI에서도 돈다)
 */
import {
  BESA_FIRST, LOCAL_FEE_NOTICE, PRICE_BOOK_2026 as B, besaDays, diffBooks, isBesaDay, isBesaPickup, pickupAllowed, pickupText, presentQuote, quote, systemForCountry, validate, validateBook, withPromoDisplay,
  type PriceBook, type QuoteInput, type QuoteOk,
} from './index';

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

// 8) 가격 버전 검사·비교(T-21)
ok('정정본 가격 버전은 문제 없음', validateBook(B).length === 0, validateBook(B));
const broken = JSON.parse(JSON.stringify(B));
broken.courses[0].price.USD = 0;
broken.dorms.push({ ...broken.dorms[0] });
broken.promotions[0].periods = [['2026-08-22', '2026-06-28']];
const be = validateBook(broken);
ok('빈 가격·겹치는 이름·뒤집힌 기간을 잡음', be.some((m) => m.includes('USD 4주 가격')) && be.some((m) => m.includes('겹칩니다')) && be.some((m) => m.includes('기간')), be);
const next = JSON.parse(JSON.stringify(B));
next.registration.KRW = 120000;
next.courses.find((c: { id: string }) => c.id === 'ESL Core').price.KRW = 1150000;
next.pickups = next.pickups.filter((p: { id: string }) => p.id !== 'clark_solo');
const dif = diffBooks(B, next);
ok('달라진 칸만: 등록금·코스 1칸·픽업 삭제', dif.length === 3 && dif.some((d) => d.key === 'registration.KRW' && d.before === '100000' && d.after === '120000') && dif.some((d) => d.key === 'course' ? false : d.key.includes('ESL Core:KRW')) && dif.some((d) => d.label.startsWith('공항 픽업 삭제')), dif);
ok('같은 버전은 바뀐 칸 없음', diffBooks(B, JSON.parse(JSON.stringify(B))).length === 0);

// 9) 결과 블록 내용(기획 '견적 수정 목록 1113' 견적-1·2, 8장 확인 방법)
const v1 = presentQuote(q({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)] }), B);
ok('8장 1번: 코스 줄 기간·날짜', v1.courses.length === 1 && v1.courses[0].name === 'ESL Flex' && v1.courses[0].weeks === 12 && v1.courses[0].from === '2026-12-13' && v1.courses[0].to === '2027-03-06' && v1.courses[0].amount === 2400000, v1.courses);
ok('8장 1번: 숙소 줄·코스+숙소·등록금', v1.dorms[0]?.name === 'Room for 4 (studio)' && v1.dorms[0].amount === 2250000 && v1.itemsTotal === 4650000 && v1.registration === 100000, v1);
ok('8장 1번: 파란 할인 4줄(이름)', v1.adjustments.map((a) => `${a.kind}:${a.name}`).join('|') === 'discount:린시즌 기숙사 할인|discount:린시즌 기숙사 할인|discount:홀리데이 프로모션|discount:장기등록 할인', v1.adjustments);
ok('8장 1번: 할인 금액', v1.adjustments.map((a) => a.amount).join() === '150000,50000,200000,300000', v1.adjustments);
ok('8장 1번: 계산 근거(작은 글씨)', v1.adjustments.map((a) => a.basis).join('|') === "Lean '26 · Room for 4 (studio) · 4주 → 1회 × ₩150,000|Lean '27 · Room for 4 (studio) · 2주 → 0.5회 × ₩100,000|Holiday '26 · 시작 2026-12-13 · 대상 방 12주|12주 이상", v1.adjustments.map((a) => a.basis));
ok('8장 1번: 총 학비·현지비용', v1.total === 4050000 && v1.localTotal === 45550 && v1.start === '2026-12-13' && v1.end === '2027-03-06' && v1.campuses.join() === 'challenger', v1);
const v2 = presentQuote(q(cases[2][1]), B);
ok('8장 2번: 주황 추가요금 1줄, 할인 없음', v2.adjustments.length === 1 && v2.adjustments[0].kind === 'surcharge' && v2.adjustments[0].name === '피크시즌 추가요금' && v2.adjustments[0].amount === 350000, v2.adjustments);
ok('8장 2번: 계산 근거', v2.adjustments[0]?.basis === "Peak '26 · Room for 4 (loft) · 7주 × ₩50,000", v2.adjustments[0]?.basis);
ok('8장 2번: 코스+숙소·총 학비·현지비용', v2.itemsTotal === 4020000 && v2.total === 4470000 && v2.localTotal === 34040, v2);
const v4 = presentQuote(q(cases[3][1]), B);
ok('8장 4번: 혼합은 줄마다 캠퍼스·기간', v4.mixed && v4.campuses.join() === 'challenger,premium' && v4.courses.map((c) => `${c.campus}:${c.from}~${c.to}`).join('|') === 'challenger:2026-07-05~2026-08-29|premium:2026-08-30~2026-09-26' && v4.dorms.map((d) => d.campus).join() === 'challenger,premium', v4.courses);
ok('8장 4번: 혼합 줄 이름에 [CC]·[PC] 없음(칩으로 표시)', [...v4.courses, ...v4.dorms].every((x) => !x.name.startsWith('[')), v4.courses);
ok('성수기 근거는 성수기 주에 든 숙소만(#4는 앞 숙소만)', v4.adjustments.find((a) => a.kind === 'surcharge')?.basis === "Peak '26 · Room for 1 (studio) · 7주 × ₩50,000", v4.adjustments);
const vTwo = presentQuote(q({ system: 'kr', start: '2026-07-05', courses: [C('ESL Core', 8)], dorms: [C('Room for 4 (loft)', 4), C('Room for 2 (studio)', 4)] }), B);
ok('성수기가 두 숙소에 걸치면 둘 다', vTwo.adjustments.find((a) => a.kind === 'surcharge')?.basis === "Peak '26 · Room for 4 (loft), Room for 2 (studio) · 7주 × ₩50,000", vTwo.adjustments);
const vUsd = presentQuote(q(cases[7][1]), B);
ok('달러 체계는 영어 이름, Global Scholar 근거', vUsd.adjustments.some((a) => a.name === 'Peak Season Surcharge') && vUsd.adjustments.some((a) => a.name === 'Global Scholar Promotion' && a.basis.startsWith("Peak '26 · ")), vUsd.adjustments);
const vJp = presentQuote(q(cases[9][1]), B);
ok('일본 체계는 일본어 이름이 없으면 영어', vJp.adjustments.some((a) => a.name === 'Holiday Promotion') && vJp.adjustments.some((a) => a.name === 'Long-term Discount'), vJp.adjustments);
const vLong = presentQuote(q({ system: 'kr', start: '2026-09-13', courses: [C('ESL Core', 16)], dorms: [C('Room for 4 (loft)', 16)] }), B);
ok('장기등록 12주 넘으면 총 주수도', vLong.adjustments.find((a) => a.promoId === 'long')?.basis === '12주 이상 · 16주', vLong.adjustments);
// 11/12 운영 v1(표시 이름 없음)도 같은 이름: 모듈 기본값
const plain: PriceBook = JSON.parse(JSON.stringify(B));
for (const p of plain.promotions) { delete p.display; delete p.tag; }
const vPlain = presentQuote(quote({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)] }, plain) as QuoteOk, plain);
ok('표시 이름 없는 가격 버전도 기본값으로', JSON.stringify(vPlain.adjustments) === JSON.stringify(v1.adjustments), vPlain.adjustments);
ok('새 가격 버전에 기본값 채움', withPromoDisplay(plain).promotions.every((p) => !!p.display?.ko && !!p.display?.en) && withPromoDisplay(plain).promotions.find((p) => p.id === 'lean27_quad')?.tag === "Lean '27");
const renamed: PriceBook = JSON.parse(JSON.stringify(B));
renamed.promotions.find((p) => p.id === 'long')!.display = { ko: '롱텀 할인', en: 'Long Stay' };
ok('가격 버전의 표시 이름이 먼저', presentQuote(q({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)] }), renamed).adjustments.some((a) => a.name === '롱텀 할인'));
ok('표시 이름은 계산에 영향 없음', quote({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)] }, renamed).ok && (quote({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)] }, renamed) as QuoteOk).total === 4050000);
ok('모든 프로모션에 한국어·영어 표시 이름', B.promotions.every((p) => !!p.display?.ko && !!p.display?.en), B.promotions.filter((p) => !p.display).map((p) => p.id));
const blank: PriceBook = JSON.parse(JSON.stringify(B));
blank.promotions[0].display = { ko: ' ', en: 'Peak' };
ok('빈 표시 이름은 승인 요청 전에 막음', validateBook(blank).some((m) => m.includes('표시 이름')) && validateBook(plain).length === 0, validateBook(blank));
ok('표시 이름 바꾸면 승인 화면에 그 칸만 보임', diffBooks(B, renamed).length === 1 && diffBooks(B, renamed)[0].key === '프로모션:long:표시 이름' && diffBooks(B, renamed)[0].after === '롱텀 할인 / Long Stay', diffBooks(B, renamed));
ok('기본값만 채운 새 버전은 바뀐 칸 없음(v1 → v2)', diffBooks(plain, withPromoDisplay(plain)).length === 0, diffBooks(plain, withPromoDisplay(plain)));
const amt2: PriceBook = JSON.parse(JSON.stringify(B));
amt2.promotions.find((p) => p.id === 'long')!.amount.KRW = 350000;
ok('프로모션 금액 바꾸면 내용 칸으로', diffBooks(B, amt2).map((d) => d.key).join() === '프로모션:long:내용', diffBooks(B, amt2));

// 10) 시작일 달력의 BESA 픽업일과 공항 픽업(견적-5, 수정 목록 5-1장·8장 5·6번)
const y26 = besaDays(2026);
ok('BESA 2026년 26개(1/11 … 12/27)', y26.length === 26 && y26[0] === '2026-01-11' && y26[25] === '2026-12-27', y26);
ok('8장 5번: 2026년 11월은 1·15·29일', y26.filter((d) => d.startsWith('2026-11')).map((d) => d.slice(8)).join() === '01,15,29');
ok('8장 5번: 2027년 1월은 10·24일', besaDays(2027).filter((d) => d.startsWith('2027-01')).map((d) => d.slice(8)).join() === '10,24');
ok('BESA 날 판단', isBesaDay('2026-12-13') && !isBesaDay('2026-11-22') && !isBesaDay('2026-12-14') && !isBesaDay('2025-12-28') && isBesaDay(BESA_FIRST) && !isBesaDay('2026-13-01'));
const PK = (id: string) => B.pickups.find((p) => p.id === id)!;
ok('BESA 단체 픽업은 BESA 날만', pickupAllowed(PK('manila_besa'), '2026-12-13') && !pickupAllowed(PK('manila_besa'), '2026-11-22') && !pickupAllowed(PK('clark_besa'), '2026-11-22'));
ok('1인 픽업은 아무 날이나', pickupAllowed(PK('manila_solo'), '2026-11-22') && pickupAllowed(PK('clark_solo'), '2026-11-22') && !pickupAllowed(undefined, '2026-12-13'));
const v1p = presentQuote(q({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)], pickup: 'manila_besa' }), B);
ok('8장 1번(픽업): 현지비용 맨 위 공항 픽업 ₱3,000', v1p.local[0]?.label === '공항 픽업' && v1p.local[0]?.sub === 'Manila NAIA · 일요일 (BESA 단체)' && v1p.local[0]?.amount === 3000, v1p.local[0]);
ok('8장 1번(픽업): 현지비용 합계 ₱48,550, 학비 그대로', v1p.localTotal === 48550 && v1p.total === 4050000 && v1p.local.filter((l) => l.key.startsWith('pickup:')).length === 1);
ok('픽업 안 하면 픽업 줄 없음', v1.local.every((l) => !l.key.startsWith('pickup:')) && v1.local[0]?.label === 'SSP');
// 11/12 운영 v1(픽업 이름 옛 표기, besa 칸 없음)도 같은 표기·판단
const oldPick: PriceBook = JSON.parse(JSON.stringify(B));
for (const p of oldPick.pickups) { p.label = p.label.replace(' · ', ' ').replace(' (', '('); delete p.besa; }
ok('옛 가격 버전도 같은 픽업 표기·BESA 판단', pickupText(oldPick.pickups[0]) === 'Manila NAIA · 일요일 (BESA 단체)' && isBesaPickup(oldPick.pickups[0]) && !isBesaPickup(oldPick.pickups[1]) && presentQuote(quote({ system: 'kr', start: '2026-12-13', courses: [C('ESL Flex', 12)], dorms: [C('Room for 4 (studio)', 12)], pickup: 'clark_besa' }, oldPick) as QuoteOk, oldPick).local[0]?.sub === 'Clark CRK · 월요일 (BESA 단체)');

console.log(`견적 계산 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
