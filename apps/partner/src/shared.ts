import type { Course } from './data';

// 관리자 포털(apps/admin '파트너 포털 관리 › 추천·콘텐츠·공지')도 가져다 쓰는 값. Supabase·화면·문구(i18n)에 기대지 않아야 한다(관리자 앱이 이 파일만 읽어도 되게).

/** 화면에 보이는 코스 이름(CL-009) */
export const courseLabel = (c: Pick<Course, 'name' | 'display_name'>) => c.display_name || c.name;

/** 보는 사람 기기의 오늘(YYYY-MM-DD). toISOString 은 세계 표준시라 한국·필리핀 오전에는 어제 날짜가 된다 */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtSize = (n: number | null) =>
  n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** 자료실 분류(12.4)와 파일을 올리는 저장소 버킷 */
export const RESOURCE_CATEGORIES = ['가격표', '코스 브로슈어', '시설·수업 사진·영상', '등록 서류', '학사·생활 규정'];
export const RESOURCE_BUCKET = 'partner-resources';

/** 지점 국가(가입 화면에서 고름). 국가별 콘텐츠(CL-036)의 노출 국가·우선 순서도 이 이름을 쓴다 */
export const COUNTRIES = ['한국', '일본', '대만', '중국', '베트남', '사우디아라비아', '태국', '몽골', '기타'];

/**
 * 국가별 우선 순서(CL-036): 그 나라에 순서가 정해진 항목을 작은 수부터 먼저, 나머지는 원래 순서 그대로.
 * 노출 국가로 거르는 것은 DB 정책이 한다(다른 나라 항목은 읽히지 않음). 나라가 없으면(직원 등) 원래 순서.
 */
export function byCountryOrder<T extends { country_order?: Record<string, number> | null }>(items: T[], country?: string | null): T[] {
  if (!country) return items;
  const rank = (x: T) => {
    const n = x.country_order?.[country];
    return typeof n === 'number' ? n : Number.POSITIVE_INFINITY;
  };
  return items.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map((v) => v.x);
}
