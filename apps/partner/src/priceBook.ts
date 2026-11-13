import {
  LOCAL_FEE_NOTICE, PRICE_BOOK_2026, SYSTEM_CURRENCY, pickupText, systemForCountry,
  type Campus, type Currency, type PriceBook, type PriceSystem,
} from '../../../packages/quote/src';
import { quoteCourse } from './consult/quoteLink';

/**
 * 견적·학비표·상담 ④⑤가 같이 쓰는 가격 기준(화면·DB에 기대지 않는 부분). 가격은 관리자 포털 '가격표 › 견적 가격'의
 * 승인 버전 중 적용 시작일이 지난 가장 최근 것(price_books, T-21·CL-066). 못 읽으면 모듈의 기획 정정본(CL-065).
 * 통화는 지점 국가의 가격 체계(CL-063)로 정한다: 한국 원, 일본 엔, 그 밖은 달러. JIC 직원 화면만 통화를 바꿔 볼 수 있다.
 */

export interface ActiveBook { version: number; label: string; effective_from: string; data: PriceBook }

/** 필리핀 날짜(가격 적용 시작일 비교용) */
export const manilaToday = (now = Date.now()) => new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
export const bookOf = (a: ActiveBook | null): PriceBook => a?.data ?? PRICE_BOOK_2026;
export const basisLabel = (a: ActiveBook | null) => (a ? `v${a.version} · ${a.label} (${a.effective_from}부터)` : `${PRICE_BOOK_2026.version} (기본값)`);

export const CURRENCIES: Currency[] = ['KRW', 'JPY', 'USD'];
export const CURRENCY_LABEL: Record<Currency, string> = { KRW: '원(KRW)', JPY: '엔(JPY)', USD: '달러(USD)' };
const SYMBOL: Record<Currency, string> = { KRW: '₩', USD: '$', JPY: '¥' };
export const money = (cur: Currency, n: number) => `${SYMBOL[cur]}${n.toLocaleString('en-US')}`;
export const peso = (n: number) => `₱${n.toLocaleString('en-US')}`;
export const CAMPUS_LABEL: Record<Campus, string> = { premium: 'Premium', challenger: 'Challenger' };

/** 지점 국가 → 가격 체계·통화(CL-063). 국가가 없으면(JIC 직원 미리보기) /usd-new 와 같다 */
export const systemOf = (country?: string | null): PriceSystem => systemForCountry(country);
export const currencyOf = (country?: string | null): Currency => SYSTEM_CURRENCY[systemOf(country)];
/** 통화 → 현지비용 문구를 고를 가격 체계(달러는 /usd 문구, 두 달러 체계의 문구가 같다) */
export const noticeFor = (cur: Currency) => LOCAL_FEE_NOTICE[cur === 'KRW' ? 'kr' : cur === 'JPY' ? 'jp' : 'usd'];

/** 4주 단가(코스 이름이 가격 버전에 없으면 null) */
export function coursePrice(book: PriceBook, id: string | null, cur: Currency): number | null {
  const c = id ? book.courses.find((x) => x.id === id) : undefined;
  return c ? c.price[cur] ?? null : null;
}

/**
 * 상담 ④ 단계 줄의 4주 가격(CL-044 2단계). 포털 코스·단계 → 견적 코스 이름(quoteLink 의 짝)으로 찾는다.
 * 짝이 없는 단계(챌린저 ESL·IELTS의 세미 스파르타·스파르타, 프리미엄 ESL)는 null — 소항목은 견적에서 고른다(CL-071, 조건표 V2.2 뒤).
 */
export function levelPrice(book: PriceBook, courseId: string | null | undefined, level: string | null, cur: Currency): { id: string; price: number } | null {
  const id = courseId ? quoteCourse(courseId, level) : null;
  const price = coursePrice(book, id, cur);
  return id && price != null ? { id, price } : null;
}

export interface FeeRow { key: string; name: string; basis: string; php: number }

/**
 * 학비표의 현지 비용 줄(₱, 환산 없음 CL-059). 기준 글은 견적 계산 모듈의 규칙과 같다(engine.ts 현지비용).
 * campus 를 주면(상담 ⑤) 그 캠퍼스에 없는 줄(프리미엄의 IELTS Guarantee)은 뺀다.
 */
export function localFeeRows(book: PriceBook, campus?: Campus): FeeRow[] {
  const L = book.local;
  const every4 = '4주 금액 · 2주 단위로 나눠 계산';
  const rows: FeeRow[] = [
    { key: 'ssp', name: 'SSP', basis: '24주 이하 1회, 25주 이상 2회', php: L.ssp },
    { key: 'icard', name: 'SSP I-Card', basis: '52주 이하 1회, 53주 이상 2회', php: L.icard },
    { key: 'student_id', name: '학생증', basis: '1회', php: L.studentId },
    { key: 'deposit', name: '기숙사 보증금', basis: '1회(환불)', php: L.deposit },
    { key: 'utilities', name: '전기·수도', basis: every4, php: L.utilities },
    { key: 'laundry', name: '세탁', basis: every4, php: L.laundry },
    { key: 'facility', name: '시설관리비', basis: every4, php: L.facility },
  ];
  // 비자 연장: 연수 주수가 든 가장 높은 단계 1회 → 단계마다 '8~11주'처럼 구간으로
  const visa = [...(L.visa ?? [])].sort((a, b) => a.minWeeks - b.minWeeks);
  visa.forEach((v, i) => {
    const next = visa[i + 1];
    const range = next ? `${v.minWeeks}~${next.minWeeks - 1}주` : `${v.minWeeks}주 이상`;
    rows.push({ key: `visa:${v.minWeeks}`, name: '비자 연장', basis: `연수 ${range} · 1회`, php: v.php });
  });
  const hasGuarantee = book.courses.some((c) => c.guarantee && (!campus || c.campus === campus));
  if (hasGuarantee) rows.push({ key: 'guarantee', name: 'IELTS Guarantee', basis: 'IELTS Guarantee 등록 때 1회(8주)', php: L.guarantee });
  for (const p of book.pickups ?? []) rows.push({ key: `pickup:${p.id}`, name: `공항 픽업 · ${pickupText(p)}`, basis: '고른 경우 1회', php: p.php });
  return rows;
}
