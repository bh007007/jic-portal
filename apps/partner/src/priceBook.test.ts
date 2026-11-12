// 학비표·상담 ④ 단계 가격 시험(CL-038·044·057·063). 가격은 견적 계산 모듈 정정본과 운영 첫 버전(마이그레이션 seed)을 둘 다 본다.
// 실행: npm --workspace apps/partner run test (partner:build 에 포함)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRICE_BOOK_2026, quote, type PriceBook } from '../../../packages/quote/src';
import { basisLabel, bookOf, coursePrice, currencyOf, levelPrice, localFeeRows, manilaToday, money, noticeFor, peso } from './priceBook';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const mig = (f: string) => readFileSync(resolve(process.cwd(), '../../supabase/migrations', f), 'utf8').split('\r\n').join('\n');

// 1) 통화: 지점 국가의 가격 체계(CL-063)
ok('한국 → 원', currencyOf('한국') === 'KRW');
ok('일본 → 엔', currencyOf('일본') === 'JPY');
ok('대만 → 달러', currencyOf('대만') === 'USD');
ok('베트남(그 밖) → 달러', currencyOf('베트남') === 'USD');
ok('국가 없음(JIC 직원) → 달러', currencyOf(null) === 'USD');
ok('금액 표시', money('KRW', 1030000) === '₩1,030,000' && money('USD', 800) === '$800' && money('JPY', 116000) === '¥116,000' && peso(7800) === '₱7,800');
ok('현지비용 문구는 통화의 체계', noticeFor('KRW').includes('필리핀 이민국') && noticeFor('JPY').includes('移民局') && noticeFor('USD').startsWith('※ Local fees'));

// 2) 필리핀 날짜: UTC 17시 = 마닐라 다음 날 01시
ok('마닐라 날짜', manilaToday(Date.UTC(2026, 10, 12, 17, 0)) === '2026-11-13' && manilaToday(Date.UTC(2026, 10, 12, 15, 59)) === '2026-11-12');

// 3) 가격 기준 이름
ok('기본값 표시', basisLabel(null).includes('(기본값)') && bookOf(null) === PRICE_BOOK_2026);
const active = { version: 2, label: '2027 가격', effective_from: '2027-01-01', data: PRICE_BOOK_2026 };
ok('승인 버전 표시', basisLabel(active) === 'v2 · 2027 가격 (2027-01-01부터)' && bookOf(active) === PRICE_BOOK_2026);

// 4) 상담 ④ 단계 가격(CL-044 2단계): 포털 코스·단계 → 견적 코스 4주 단가
const B = PRICE_BOOK_2026;
const lp = (id: string, level: string | null, cur: 'KRW' | 'USD' | 'JPY' = 'KRW') => levelPrice(B, id, level, cur)?.price ?? null;
ok('TEP 8 원', lp('p-tep', 'TEP 8') === 1030000);
ok('TEP 10 엔', lp('p-tep', 'TEP 10', 'JPY') === 145000);
ok('Speaking PRO 달러', lp('p-speaking', 'PRO', 'USD') === 975);
ok('Senior 3 → Active Senior 5', levelPrice(B, 'p-senior', 'Senior 3', 'KRW')?.id === 'Active Senior 5' && lp('p-senior', 'Senior 3') === 830000);
ok('Working Holiday·TOEIC·Business', lp('p-wh', null) === 1130000 && lp('p-toeic', null) === 1130000 && lp('p-business', null) === 1400000);
ok('IELTS Guarantee', lp('c-ielts-g', null, 'USD') === 1060);
ok('짝 없는 단계는 가격 없음(견적에서 선택)', lp('p-esl', 'ESL') === null && lp('c-esl', '세미 스파르타') === null && lp('c-ielts', '스파르타') === null);
ok('코스 없음', levelPrice(B, null, 'TEP 8', 'KRW') === null && coursePrice(B, 'Nope', 'KRW') === null);

// 운영 조건표(v2.1)의 모든 단계: 짝이 있는 코스는 모두 가격이 나온다
const reco = mig('20261109153000_partner_reco_v21.sql');
const levels = Object.fromEntries([...reco.matchAll(/levels = \$lv\$(\[.*?\])\$lv\$::jsonb, updated_at = now\(\)\n {2}where id = '([^']+)'/g)].map((m) => [m[2], JSON.parse(m[1]) as { name: string }[]]));
const NO_PAIR = ['p-esl', 'c-esl', 'c-ielts'];
for (const [id, ls] of Object.entries(levels)) {
  for (const l of ls) {
    const p = levelPrice(B, id, l.name, 'KRW');
    if (NO_PAIR.includes(id)) ok(`짝 없음 ${id} ${l.name}`, p === null);
    else ok(`단계 가격 ${id} ${l.name}`, p !== null && p.price > 0, JSON.stringify(p));
  }
}
ok('조건표 단계를 읽음', Object.keys(levels).length >= 6);

// 5) 현지 비용 줄: 견적 계산과 같은 값
const fees = localFeeRows(B);
const fee = (k: string) => fees.find((f) => f.key === k)?.php;
ok('SSP·I-Card·학생증·보증금', fee('ssp') === 7800 && fee('icard') === 4500 && fee('student_id') === 200 && fee('deposit') === 3000);
ok('4주 금액 3가지', fee('utilities') === 3000 && fee('laundry') === 1200 && fee('facility') === 1000);
const visa = fees.filter((f) => f.key.startsWith('visa:'));
ok('비자 연장 5단계 구간', visa.length === 5 && visa[0].basis === '연수 8~11주 · 1회' && visa[4].basis === '연수 24주 이상 · 1회' && visa[0].php === 4940 && visa[4].php === 23870, JSON.stringify(visa.map((v) => v.basis)));
ok('픽업 4가지', fees.filter((f) => f.key.startsWith('pickup:')).length === 4);
ok('IELTS Guarantee: 전체·챌린저에는 있고 프리미엄에는 없음', fee('guarantee') === 18000 && localFeeRows(B, 'challenger').some((f) => f.key === 'guarantee') && !localFeeRows(B, 'premium').some((f) => f.key === 'guarantee'));

// 학비표 값과 견적 결과가 같은지: 4주 Challenger ESL Core + Room for 4 (studio), 비수기 밖 시작
const q = quote({ system: 'kr', start: '2026-07-05', courses: [{ id: 'ESL Core', weeks: 4 }], dorms: [{ id: 'Room for 4 (studio)', weeks: 4 }] }, B);
if (q.ok) {
  const line = (k: string) => q.charges.find((c) => c.key === k)?.amount;
  ok('견적 코스 줄 = 학비표 4주', line('course:ESL Core') === coursePrice(B, 'ESL Core', 'KRW'));
  ok('견적 등록금 = 학비표 등록금', line('registration') === B.registration.KRW);
  const loc = (k: string) => q.local.find((c) => c.key === k)?.amount;
  ok('견적 현지비용 4주 = 학비표', loc('utilities') === fee('utilities') && loc('ssp') === fee('ssp') && loc('student_id') === fee('student_id'));
} else ok('견적 계산', false, q.errors.join(', '));

// 6) 운영 첫 버전(seed)도 같은 값으로 보인다
const seed = JSON.parse(mig('20261112170000_price_books.sql').split('$book$')[1]) as PriceBook;
ok('seed 단계 가격 같음', levelPrice(seed, 'p-tep', 'TEP 8', 'KRW')?.price === 1030000 && levelPrice(seed, 'c-ielts-g', null, 'JPY')?.price === lp('c-ielts-g', null, 'JPY'));
ok('seed 현지 비용 줄 같음', JSON.stringify(localFeeRows(seed)) === JSON.stringify(fees));

console.log(`학비표·단계 가격 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
