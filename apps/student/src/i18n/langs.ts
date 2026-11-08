/** 언어 목록과 사전 묶음. React 에 의존하지 않아 시험에서도 쓴다. */
import { ch } from './ch';
import { en } from './en';
import { jp } from './jp';
import { ko } from './ko';
import { tw } from './tw';
import { vi } from './vi';

export const DICTS = { ko, en, jp, ch, tw, vi } as const;
export type Lang = keyof typeof DICTS;

/** 언어 고르기 목록의 이름(각 언어로 씀), html lang, 요일 */
export const LANGS: { code: Lang; name: string; html: string; week: string[] }[] = [
  { code: 'ko', name: '한국어', html: 'ko', week: ['일', '월', '화', '수', '목', '금', '토'] },
  { code: 'en', name: 'English', html: 'en', week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  { code: 'jp', name: '日本語', html: 'ja', week: ['日', '月', '火', '水', '木', '金', '土'] },
  { code: 'ch', name: '简体中文', html: 'zh-Hans', week: ['日', '一', '二', '三', '四', '五', '六'] },
  { code: 'tw', name: '繁體中文', html: 'zh-Hant', week: ['日', '一', '二', '三', '四', '五', '六'] },
  { code: 'vi', name: 'Tiếng Việt', html: 'vi', week: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] },
];

/** 브라우저 언어 → 앱 언어. 중국어는 대만·홍콩·번체면 tw, 나머지는 ch. */
export function langFromBrowser(tags: readonly string[]): Lang {
  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (t.startsWith('ko')) return 'ko';
    if (t.startsWith('ja')) return 'jp';
    if (t.startsWith('vi')) return 'vi';
    if (t.startsWith('zh')) return /-(tw|hk|mo|hant)/.test(t) ? 'tw' : 'ch';
    if (t.startsWith('en')) return 'en';
  }
  return 'en';
}

