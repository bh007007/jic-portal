// 시제품 V74 HTML의 글 콘텐츠를 파트너 포털 화면 콘텐츠 '초안'으로 바꾼다(CL-056: 콘텐츠 시트(T-24) 전에는 시제품 콘텐츠로 시험).
// 시제품 코드를 실행하지 않고(prototype-constants.mjs, 문법 트리만) 상수 값만 읽는다. 결과는 JSON과 SQL 두 파일.
// 모두 status = 'draft'(에이전시 화면에 안 보임), data.source = 'prototype-v74'. SQL은 같은 종류·제목·출처가 이미 있으면 넣지 않는다(여러 번 실행해도 된다).
// 글 속 가격 숫자는 지운다(CL-055). 지운 뒤에도 남으면 그 항목은 뺀다.
// 쓰지 않는 상수: CONTACTS(개인 연락처), PLAYBOOK(기획 확정 뒤 입력, T-12), ADULT_FAQ(FAQ 입력 화면 미정), PLAY(유튜브 주소 없음), GUIDE(상담원용 안내).
//
// 실행: node scripts/content/prototype-drafts.mjs <시제품.html> <출력 폴더>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConstants } from './prototype-constants.mjs';

// apps/partner/src/contentKinds.ts PRICE_IN_TEXT 와 같게 둔다
const PRICE_IN_TEXT = /(₩|￦|\$|₱|¥|PHP|KRW|USD|JPY)\s?\d|\d[\d,]*\s?(원|만원|페소|달러|엔)(?![가-힣])/;
const SOURCE = 'prototype-v74';
const CAMPUS = { pre: 'premium', cha: 'challenger' };
const YEAR = '2026';

/** 글 속 금액 지우기(예: '500PHP 쿠폰' → '쿠폰', '(₱250)' → '') */
const noPrice = (s) =>
  String(s ?? '')
    .replace(/\(?\s*(₱|PHP|KRW|USD|₩)\s?\d[\d,]*(\.\d+)?\s*\)?/g, '')
    .replace(/\d[\d,]*\s?(PHP|페소|원)\s?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+·\s+·/g, ' ·')
    .trim();

export function buildDrafts(html) {
  const c = readConstants(html, ['AROUND', 'LIFE', 'HOLI_2026', 'MTEST_2026', 'EV_KNOWN']);
  const items = [];
  const add = (kind, campus, title, body, data = {}) => items.push({ kind, campus, title: noPrice(title), body: noPrice(body), data: { ...data, source: SOURCE }, status: 'draft' });

  // 소개 › 왜 바기오·주변: 캠퍼스 주변 안내(AROUND)
  for (const a of c.AROUND ?? []) add('about', '', a.t, [a.d, a.cats?.length ? `(${a.cats.join(', ')})` : ''].filter(Boolean).join('\n'), { section: '왜 바기오·주변' });

  // 학생 생활 › 액티비티: 캠퍼스별 활동(LIFE.acts). 양 캠퍼스 공통(Speaking Challenger)은 공통 한 건
  const seen = new Set();
  for (const [key, campus] of Object.entries(CAMPUS)) {
    for (const a of c.LIFE?.[key]?.acts ?? []) {
      const both = /양 캠퍼스/.test(a.freq ?? '');
      const id = both ? `both:${a.t}` : `${campus}:${a.t}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const body = [a.speak, a.items?.length ? `· ${a.items.join(' · ')}` : '', a.cap ? `“${a.cap}”` : ''].filter(Boolean).join('\n');
      add('activity', both ? '' : campus, a.t, body, { schedule: noPrice(String(a.freq ?? '').replace(/\s*·\s*양 캠퍼스/, '')) });
    }
  }

  // 활동 달력: 필리핀 공휴일(HOLI_2026), 월간 테스트(MTEST_2026, 캠퍼스·날짜 확인 필요), 알려진 행사(EV_KNOWN)
  for (const [md, name] of c.HOLI_2026 ?? []) add('event', '', name, '', { date: `${YEAR}-${md}`, type: '휴일' });
  for (const md of c.MTEST_2026 ?? []) add('event', 'challenger', '월간 테스트', '시제품의 월간 테스트 날짜입니다. 캠퍼스와 날짜를 확인한 뒤 게시하세요.', { date: `${YEAR}-${md}`, type: '시험' });
  for (const e of c.EV_KNOWN ?? []) add('event', CAMPUS[e.campus] ?? '', e.name, e.note ?? '', { date: e.date, type: '이벤트' });

  // 가격이 남은 항목은 뺀다
  const kept = items.filter((it) => ![it.title, it.body, ...Object.values(it.data).map(String)].some((s) => PRICE_IN_TEXT.test(s)));
  return { items: kept, dropped: items.length - kept.length };
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
export function toSql(items) {
  const rows = items.map((it) => `(${q(it.kind)}, ${q(it.campus)}, ${q(it.title)}, ${q(it.body)}, ${q(JSON.stringify(it.data))}::jsonb)`);
  return `-- 시제품 V74 글 콘텐츠 → 파트너 포털 화면 콘텐츠 초안(${items.length}건). scripts/content/prototype-drafts.mjs 가 만든 파일. 같은 종류·제목·날짜·출처가 있으면 넣지 않는다.
insert into public.partner_content_items (kind, campus, title, body, data, status)
select v.kind, v.campus, v.title, v.body, v.data, 'draft'
from (values
  ${rows.join(',\n  ')}
) as v(kind, campus, title, body, data)
where not exists (
  select 1 from public.partner_content_items i
  where i.kind = v.kind and i.title = v.title and i.campus = v.campus
    and coalesce(i.data ->> 'date', '') = coalesce(v.data ->> 'date', '') and i.data ->> 'source' = '${SOURCE}'
);
`;
}

if (process.argv[1] && process.argv[1].endsWith('prototype-drafts.mjs')) {
  const [, , input, outDir] = process.argv;
  if (!input || !outDir) {
    console.error('쓰기: node scripts/content/prototype-drafts.mjs <시제품.html> <출력 폴더>');
    process.exit(1);
  }
  const { items, dropped } = buildDrafts(readFileSync(input, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'prototype-drafts.json'), JSON.stringify(items, null, 2));
  writeFileSync(join(outDir, 'prototype-drafts.sql'), toSql(items));
  const by = {};
  for (const it of items) by[it.kind] = (by[it.kind] ?? 0) + 1;
  console.log(`초안 ${items.length}건 (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}), 가격이 남아 뺀 것 ${dropped}건 → ${outDir}`);
}
