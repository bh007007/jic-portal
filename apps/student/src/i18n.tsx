/**
 * 화면 문구. 기획안 P7에 따라 업체와 같은 6개 언어(ko, en, jp, ch, tw, vi).
 * 사전은 src/i18n/*.ts 에 언어별로 있고, 키 목록은 ko.ts 가 정한다(빠진 키는 타입 검사에서 걸린다).
 * jp·ch·tw·vi 는 초안이며 원어민 검토가 필요하다(docs/student-app.md).
 * 학생 이름·국적·코스명처럼 데이터에서 오는 값은 번역하지 않는다.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DICTS, LANGS, langFromBrowser, type Lang } from './i18n/langs';
import { ko, type MsgKey } from './i18n/ko';

export { LANGS, type Lang, type MsgKey };
const langInfo = (l: Lang) => LANGS.find((x) => x.code === l)!;

const STORAGE_KEY = 'jic-student-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) return saved as Lang;
  } catch {
    // 저장소를 못 쓰면 브라우저 언어
  }
  return langFromBrowser(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']);
}

export type T = (key: MsgKey, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  t: T;
  weekday: (n: number) => string;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = langInfo(lang).html;
  }, [lang]);
  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      t: (key, vars) => dict[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')),
      weekday: (n) => langInfo(lang).week[n],
      setLang: (next) => {
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // 무시
        }
        setLangState(next);
      },
    };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider 가 없습니다.');
  return v;
}

/** 서버 오류 코드 → 화면 문구 */
export function errorText(t: T, code: string, vars?: Record<string, string | number>) {
  const key = ('err.' + code) as MsgKey;
  return key in ko ? t(key, vars) : t('err.unknown');
}
