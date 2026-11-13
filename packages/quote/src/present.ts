import { pickupText } from './besa';
import { LOCAL_FEE_NOTICE } from './engine';
import { PROMOTIONS_2026 } from './prices2026';
import type { Campus, Currency, Line, PriceBook, PriceSystem, PromoDisplay, PromoRow, QuoteOk } from './types';

/**
 * 견적 결과 블록의 내용(기획 '견적 수정 목록 1113' 견적-1·2). 화면에 기대지 않는 부분만 둔다.
 * 1차 상담 ⑤·견적 화면과 2차 학생등록 3단계·인보이스가 같은 블록을 쓴다(R-014: 같은 계산 + 같은 모양).
 * 순서: 코스 → 숙소 → 코스+숙소 → 등록금 → 할인·추가요금 → 총 학비 → 현지비용. 커미션·현지비용 원화 환산은 넣지 않는다.
 */

/** 표시 이름 언어. 일본어 이름은 견적 담당자 확인 뒤 넣고, 그 전에는 영어(견적-2) */
export type QuoteLang = 'ko' | 'en' | 'ja';
/** 가격 체계 → 표시 이름 언어(유학원에게 익숙한 이름: 한국 = 한국어, 그 밖 = 영어, 일본 = 일본어가 없으면 영어) */
export const NAME_LANG: Record<PriceSystem, QuoteLang> = { kr: 'ko', jp: 'ja', usd: 'en', 'usd-new': 'en' };

const SYMBOL: Record<Currency, string> = { KRW: '₩', USD: '$', JPY: '¥' };
export const moneyText = (cur: Currency, n: number) => `${SYMBOL[cur]}${n.toLocaleString('en-US')}`;
export const pesoText = (n: number) => `₱${n.toLocaleString('en-US')}`;
export const CAMPUS_NAME: Record<Campus, string> = { premium: 'Premium', challenger: 'Challenger' };

/** 계산 근거(작은 글씨)의 낱말. 화면 글자는 코드와 따로 둔다(D8·P7). 1차 화면은 한국어 */
export const BASIS_TEXT = {
  ko: { weeks: (n: number) => `${n}주`, times: (n: number) => `${n}회`, start: '시작', rooms: '대상 방', over: (n: number) => `${n}주 이상`, pickup: '공항 픽업' },
  en: { weeks: (n: number) => `${n} wk`, times: (n: number) => `${n}×`, start: 'start', rooms: 'eligible room', over: (n: number) => `${n}+ weeks`, pickup: 'Airport pickup' },
} as const;
export type TextLang = keyof typeof BASIS_TEXT;

const DEFAULT_PROMO = new Map(PROMOTIONS_2026.map((p) => [p.id, p]));

/** 프로모션 표시 이름: 가격 버전의 display → 모듈 기본값(11/12 v1에는 display 가 없음) → 관리용 이름 */
export function promoName(p: PromoRow | undefined, id: string, lang: QuoteLang): string {
  const d: PromoDisplay | undefined = p?.display ?? DEFAULT_PROMO.get(id)?.display;
  if (!d) return p?.name ?? id;
  return (lang === 'ja' ? d.ja || d.en : d[lang]) || d.ko;
}
/** 계산 근거 앞 구분 글자(예: "Lean '26") */
export function promoTag(p: PromoRow | undefined, id: string): string {
  return p?.tag ?? DEFAULT_PROMO.get(id)?.tag ?? '';
}
/** 표시 이름·구분 글자가 빠진 프로모션에 모듈 기본값을 채운다(관리자 새 가격 버전을 만들 때) */
export function withPromoDisplay(book: PriceBook): PriceBook {
  return {
    ...book,
    promotions: book.promotions.map((p) => {
      const def = DEFAULT_PROMO.get(p.id);
      return { ...p, display: p.display ?? (def?.display ? { ...def.display } : undefined), tag: p.tag ?? def?.tag };
    }),
  };
}

export interface ViewItem { key: string; name: string; campus: Campus; weeks: number; from: string; to: string; amount: number }
/** 현지비용 한 줄(₱). sub 는 작은 글씨(공항 픽업의 공항·요일·단체 여부) */
export interface ViewLocal { key: string; label: string; sub?: string; amount: number }
export interface ViewAdjust {
  key: string;
  kind: 'discount' | 'surcharge';
  promoId: string;
  /** 표시 이름(큰 글씨, 검정) */
  name: string;
  /** 계산 근거(작은 글씨) */
  basis: string;
  /** 양수. 할인은 −, 추가요금은 + 로 보인다 */
  amount: number;
}
export interface QuoteView {
  currency: Currency;
  start: string;
  end: string;
  weeks: number;
  mixed: boolean;
  /** 기간 순서대로의 캠퍼스(머리 줄 'Challenger + Premium') */
  campuses: Campus[];
  courses: ViewItem[];
  dorms: ViewItem[];
  /** 코스+숙소 소계 */
  itemsTotal: number;
  registration: number;
  /** 할인 먼저, 그다음 추가요금(계산 모듈의 프로모션 표 순서) */
  adjustments: ViewAdjust[];
  total: number;
  /** 공항 픽업을 신청하면 맨 위 한 줄(견적-5), 나머지는 계산 모듈 순서 그대로 */
  local: ViewLocal[];
  localTotal: number;
  localNotice: string;
  pending: string[];
}

/** 계산 결과 → 결과 블록 내용. nameLang 은 표시 이름 언어(기본: 가격 체계), textLang 은 계산 근거 낱말(기본: 한국어) */
export function presentQuote(r: QuoteOk, book: PriceBook, opts: { nameLang?: QuoteLang; textLang?: TextLang } = {}): QuoteView {
  const nameLang = opts.nameLang ?? NAME_LANG[r.system];
  const T = BASIS_TEXT[opts.textLang ?? 'ko'];
  const m = (n: number) => moneyText(r.currency, n);
  const promoOf = (id: string) => book.promotions.find((p) => p.id === id);

  const item = (l: Line): ViewItem => ({
    key: l.key,
    name: l.item?.id ?? l.label,
    campus: l.item?.campus ?? 'challenger',
    weeks: l.item?.weeks ?? 0,
    from: l.item?.from ?? '',
    to: l.item?.to ?? '',
    amount: l.amount,
  });
  const courses = r.charges.filter((l) => l.part === 'course').map(item);
  const dorms = r.charges.filter((l) => l.part === 'dorm').map(item);

  const basis = (l: Line, p: PromoRow | undefined): string => {
    const x = l.promo;
    if (!x) return l.detail ?? '';
    const tag = promoTag(p, x.id);
    const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');
    switch (p?.kind ?? DEFAULT_PROMO.get(x.id)?.kind) {
      case 'room_lean':
        return join(tag, x.rooms?.join(', '), `${T.weeks(x.weeks ?? 0)} → ${T.times(x.units ?? 0)} × ${m(x.unit ?? 0)}`);
      case 'surcharge':
        return join(tag, x.rooms?.join(', '), `${T.weeks(x.weeks ?? 0)} × ${m(x.unit ?? 0)}`);
      case 'holiday':
        return join(tag, `${T.start} ${x.start}`, `${T.rooms} ${T.weeks(x.weeks ?? 0)}`);
      case 'long_term': {
        const min = p?.minWeeks ?? 12;
        // 12주를 넘으면 금액이 2주마다 늘어나므로 총 주수를 같이 보인다
        return join(T.over(min), (x.weeks ?? 0) > min && T.weeks(x.weeks ?? 0));
      }
      case 'stay_period':
        return join(tag, T.weeks(x.weeks ?? 0));
      case 'manual':
        return join(x.by, x.on, x.memo);
      default:
        return l.detail ?? '';
    }
  };
  const adjust = (l: Line, kind: ViewAdjust['kind']): ViewAdjust => {
    const id = l.promo?.id ?? l.key;
    const p = promoOf(id);
    return { key: l.key, kind, promoId: id, name: promoName(p, id, nameLang), basis: basis(l, p), amount: l.amount };
  };
  const adjustments = [
    ...r.discounts.map((l) => adjust(l, 'discount')),
    ...r.charges.filter((l) => l.part === 'surcharge').map((l) => adjust(l, 'surcharge')),
  ];

  const campuses: Campus[] = [];
  for (const c of courses) if (campuses[campuses.length - 1] !== c.campus) campuses.push(c.campus);

  // 현지비용: 공항 픽업은 맨 위 한 줄 '공항 픽업' + 작은 글씨(견적-5). 금액·합계는 계산 모듈 그대로
  const pickupLines: ViewLocal[] = [];
  const otherLines: ViewLocal[] = [];
  for (const l of r.local) {
    if (l.key.startsWith('pickup:')) {
      const p = book.pickups.find((x) => `pickup:${x.id}` === l.key);
      pickupLines.push({ key: l.key, label: T.pickup, sub: p ? pickupText(p) : l.label, amount: l.amount });
    } else otherLines.push({ key: l.key, label: l.label, amount: l.amount });
  }

  return {
    currency: r.currency,
    start: r.start,
    end: r.end,
    weeks: r.weeks,
    mixed: r.mixed,
    campuses,
    courses,
    dorms,
    itemsTotal: [...courses, ...dorms].reduce((a, x) => a + x.amount, 0),
    registration: r.charges.filter((l) => l.part === 'registration').reduce((a, l) => a + l.amount, 0),
    adjustments,
    total: r.total,
    local: [...pickupLines, ...otherLines],
    localTotal: r.localTotal,
    localNotice: LOCAL_FEE_NOTICE[r.system],
    pending: r.pending,
  };
}
