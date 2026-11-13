/**
 * JIC 견적 계산 모듈(R-014). 1차 에이전시 포털 상담 ⑤ 견적과 2차 학생등록·인보이스(CL-076)가 이 모듈 하나를 쓴다.
 * 사용: quote({ system: systemForCountry(지점 국가), start, courses, dorms, pickup }, PRICE_BOOK_2026)
 */
export * from './types';
export { LOCAL_FEE_NOTICE, SYSTEM_CURRENCY, quote, systemForCountry, validate } from './engine';
export { diffBooks, validateBook, type BookChange } from './book';
export { COURSES_2026, DORMS_2026, PRICE_BOOK_2026, PROMOTIONS_2026 } from './prices2026';
export {
  BASIS_TEXT, CAMPUS_NAME, NAME_LANG, moneyText, pesoText, presentQuote, promoName, promoTag, withPromoDisplay,
  type QuoteLang, type QuoteView, type TextLang, type ViewAdjust, type ViewItem,
} from './present';
