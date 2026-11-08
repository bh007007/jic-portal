/**
 * 화면 문구 시험: 6개 언어 사전의 키·자리 표시({n}, {t} 등)가 한국어 기준과 같은지, 브라우저 언어 고르기.
 * 실행: npm --workspace apps/student run test (빌드할 때도 함께 돈다).
 */
import { DICTS, LANGS, langFromBrowser } from '../src/i18n/langs';

let fails = 0;
const expect = (label: string, cond: boolean, extra?: unknown) => {
  if (!cond) fails++;
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label + (cond ? '' : ' ' + JSON.stringify(extra)));
};
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const base = DICTS.ko as Record<string, string>;
const keys = Object.keys(base);
for (const l of LANGS) {
  const d = DICTS[l.code] as Record<string, string>;
  const missing = keys.filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !(k in base));
  const empty = keys.filter((k) => !d[k]?.trim());
  const badHoles = keys.filter((k) => holes(d[k] ?? '') !== holes(base[k]));
  expect(`${l.code}: 키 ${keys.length}개 모두 있고 남는 키 없음`, !missing.length && !extra.length, { missing, extra });
  expect(`${l.code}: 빈 문구 없음`, !empty.length, empty);
  expect(`${l.code}: 자리 표시가 한국어와 같음`, !badHoles.length, badHoles.map((k) => [k, d[k]]));
  expect(`${l.code}: 요일 7개`, l.week.length === 7, l.week);
}
expect('언어 6개', LANGS.length === 6 && Object.keys(DICTS).length === 6);

const cases: [string[], string][] = [
  [['ko-KR'], 'ko'],
  [['ja'], 'jp'],
  [['zh-TW'], 'tw'],
  [['zh-HK'], 'tw'],
  [['zh-Hant-TW'], 'tw'],
  [['zh-CN'], 'ch'],
  [['zh'], 'ch'],
  [['vi-VN'], 'vi'],
  [['en-US'], 'en'],
  [['fr-FR', 'ja-JP'], 'jp'],
  [['ar-SA'], 'en'],
];
for (const [tags, want] of cases) expect(`브라우저 ${tags.join(',')} → ${want}`, langFromBrowser(tags) === want, langFromBrowser(tags));

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
