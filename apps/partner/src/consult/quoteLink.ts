/**
 * 상담 결과 → 포털 견적(/quote, T-20 11/12) 주소. 주소에 캠퍼스·코스·기간을 담아 견적 화면을 미리 채운다.
 * 견적 사이트(quote.baguiojic)는 11/12부터 쓰지 않는다(CL-065). 코스 이름은 견적 이름(견적 계산 모듈 PRICE_BOOK_2026)과 같다.
 * 학생 정보(이름·생년월일)는 담지 않는다(원칙 P3).
 *
 * 코스 짝(11/10 레오님 결정): 견적 프로그램의 코스 이름과 다른 것은 아래처럼 바꾸고, 짝이 없는 것은 코스를 비운다.
 * - Senior 3·4 → Active Senior 5·6
 * - 챌린저 ESL·IELTS(세미 스파르타·스파르타) → 비움(Flex·Lite·Core·Standard 는 견적 화면에서 고른다)
 * - 프리미엄 ESL → 비움(견적 프로그램 프리미엄에 ESL 이 없다)
 */

/** 견적 프로그램의 캠퍼스 값(DATA 키). 에이전시 포털 캠퍼스 id 와 같다. */
export const QUOTE_CAMPUSES = ['challenger', 'premium'] as const;

const SPEAKING: Record<string, string> = { STARTER: 'Speaking Starter', PRO: 'Speaking Pro', MASTER: 'Speaking Master' };
const SENIOR: Record<string, string> = { 'Senior 3': 'Active Senior 5', 'Senior 4': 'Active Senior 6' };

/** 에이전시 포털 코스 id + 단계 이름 → 견적 프로그램 코스 이름(없으면 null). */
export function quoteCourse(courseId: string, level: string | null): string | null {
  switch (courseId) {
    case 'p-tep':
      return level && /^TEP \d+$/.test(level) ? `ESL ${level}` : null;
    case 'p-speaking':
      return level ? SPEAKING[level.toUpperCase()] ?? null : null;
    case 'p-senior':
      return level ? SENIOR[level] ?? null : null;
    case 'p-wh':
      return 'Working Holiday 8';
    case 'p-toeic':
      return 'TOEIC';
    case 'p-business':
      return 'Business Master 8';
    case 'c-ielts-g':
      return 'IELTS Guarantee';
    default:
      return null; // p-esl, c-esl, c-ielts
  }
}

export interface QuoteInput {
  campusId: string | null | undefined;
  courseId: string | null | undefined;
  level: string | null;
  weeks: string | null | undefined;
  agency?: string | null;
}

/** 견적 프로그램에 넘길 값. 모르는 값은 넣지 않는다. */
export function quoteParams({ campusId, courseId, level, weeks, agency }: QuoteInput): URLSearchParams {
  const p = new URLSearchParams();
  if (campusId && (QUOTE_CAMPUSES as readonly string[]).includes(campusId)) p.set('campus', campusId);
  const course = courseId ? quoteCourse(courseId, level) : null;
  if (course && p.has('campus')) p.set('course', course);
  const w = Number(weeks);
  if (Number.isInteger(w) && w > 0 && w <= 52) p.set('weeks', String(w));
  if (agency && agency.trim()) p.set('agency', agency.trim().slice(0, 80));
  return p;
}

/** 포털 견적 주소(같은 포털 안, 새 탭으로 열어 상담 화면을 그대로 둔다). 가격 체계는 견적 화면이 지점 국가로 정한다(CL-063) */
export const portalQuoteUrl = (params: URLSearchParams) => `/quote${params.toString() ? `?${params}` : ''}`;
