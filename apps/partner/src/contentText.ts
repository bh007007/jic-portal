import { updateText, type ContentItem } from './contentKinds';

/** 화면 콘텐츠 표시에 쓰는 순수 함수(화면·DB에 기대지 않아 시험에서 바로 부른다, content.test.ts) */
/** 언어별 문구가 없으면 한국어(P7) */
export function textOf(it: Pick<ContentItem, 'title' | 'body' | 'i18n'>, lang = 'ko') {
  const tr = lang === 'ko' ? undefined : it.i18n?.[lang];
  return { title: tr?.title || it.title, body: tr?.body || it.body };
}

export const str = (it: ContentItem, key: string) => {
  const v = it.data?.[key];
  return typeof v === 'string' ? v.trim() : '';
};

/** 목록 화면 위의 '기준일 · 다음 업데이트 예정'(CL-054): 가장 최근 업데이트일과 가장 가까운 다음 업데이트 */
export function listUpdate(items: Pick<ContentItem, 'updated_on' | 'next_update'>[]) {
  const max = items.map((i) => i.updated_on).filter(Boolean).sort().pop() ?? null;
  const next = items.map((i) => i.next_update).filter(Boolean).sort()[0] ?? null;
  return updateText({ updated_on: max, next_update: next });
}

/** 유튜브 주소에서 영상 번호(일부 공개 링크 포함). 못 찾으면 null */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
      return m ? m[1] : null;
    }
  } catch {
    /* 주소가 아님 */
  }
  return null;
}

/** '학생의 하루'를 코스에 맞추기: 코스 칸이 비었으면 그 캠퍼스 공통, 있으면 코스 이름이 맞는 것 */
export function dayMatches(it: ContentItem, courseNames: string[]) {
  const c = str(it, 'course').toLowerCase().replace(/\s+/g, '');
  if (!c) return true;
  return courseNames.some((n) => {
    const k = n.toLowerCase().replace(/\s+/g, '');
    return !!k && (k === c || k.includes(c) || c.includes(k));
  });
}

/** 시간 순서(07:30 < 13:00). 시간이 없으면 뒤로 */
export const byTime = (a: ContentItem, b: ContentItem) => (str(a, 'time') || '99').localeCompare(str(b, 'time') || '99') || a.sort - b.sort;

/** 사진 중심점(data.focus = [x, y], 0~1) → CSS object-position. 없으면 가운데 */
export function focusPos(it: Pick<ContentItem, 'data'>): string {
  const f = it.data?.focus;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  if (!Array.isArray(f) || f.length !== 2 || !ok(f[0]) || !ok(f[1])) return '50% 50%';
  return `${Math.round(f[0] * 100)}% ${Math.round(f[1] * 100)}%`;
}

/** FAQ(11/12): 분야 목록(처음 나온 순서, 빈칸 제외) */
export function faqCategories(items: ContentItem[]): string[] {
  return [...new Set(items.map((it) => str(it, 'category')).filter(Boolean))];
}
/** FAQ 거르기: 고른 분야(빈칸 = 모두)와 검색어(질문·답변·분야) */
export function faqMatch(it: ContentItem, category: string, kw: string): boolean {
  if (category && str(it, 'category') !== category) return false;
  const k = kw.trim().toLowerCase();
  if (!k) return true;
  const { title, body } = textOf(it);
  return [title, body, str(it, 'category')].join(' ').toLowerCase().includes(k);
}
