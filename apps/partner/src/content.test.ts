// 화면 콘텐츠 표시 시험(CL-045·054): 유튜브 주소, 언어별 문구, 기준일 줄, 학생의 하루 코스 맞추기. npm run test 에서 돈다.
import type { ContentItem } from './contentKinds';
import { byTime, dayMatches, listUpdate, textOf, youtubeId } from './contentText';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const item = (o: Partial<ContentItem>): ContentItem => ({
  id: 'x', kind: 'day', campus: 'premium', title: '', body: '', data: {}, i18n: {}, countries: [], country_order: {},
  status: 'published', sort: 0, updated_on: null, next_update: null, updated_at: '2026-11-11T00:00:00Z', ...o,
});

// 1) 유튜브 주소(일부 공개 링크 포함)
const yt: [string, string | null][] = [
  ['https://youtu.be/M7lc1UVf-VE', 'M7lc1UVf-VE'],
  ['https://youtu.be/M7lc1UVf-VE?si=abc', 'M7lc1UVf-VE'],
  ['https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10s', 'aqz-KE-bpKQ'],
  ['https://m.youtube.com/watch?v=aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
  ['https://www.youtube.com/shorts/abcdef12345', 'abcdef12345'],
  ['https://www.youtube.com/embed/abcdef12345', 'abcdef12345'],
  ['https://drive.google.com/file/d/abc/view', null],
  ['유튜브 주소 아님', null],
];
for (const [u, want] of yt) ok(`youtubeId ${u}`, youtubeId(u) === want, String(youtubeId(u)));

// 2) 언어별 문구: 번역이 없으면 한국어(P7)
const t1 = item({ title: '선생님', body: '본문', i18n: { en: { title: 'Teacher' } } });
ok('번역 제목', textOf(t1, 'en').title === 'Teacher');
ok('번역 없는 본문은 한국어', textOf(t1, 'en').body === '본문');
ok('일본어 번역 없음 → 한국어', textOf(t1, 'ja').title === '선생님');
ok('한국어', textOf(t1).title === '선생님');

// 3) 기준일 줄(CL-054): 가장 최근 업데이트일 + 가장 가까운 다음 업데이트
ok('기준일 줄', listUpdate([
  item({ updated_on: '2026-10-01', next_update: '2027-02' }), item({ updated_on: '2026-11-05', next_update: '2026-12' }), item({}),
]) === '2026-11-05 기준 · 다음 업데이트 2026-12 예정', listUpdate([item({ updated_on: '2026-11-05', next_update: '2026-12' })]));
ok('기준일만', listUpdate([item({ updated_on: '2026-11-01' })]) === '2026-11-01 기준');
ok('날짜 없으면 빈 줄', listUpdate([item({})]) === '');

// 4) 학생의 하루: 코스 칸이 비면 캠퍼스 공통, 있으면 코스 이름이 맞는 것만
const tep = item({ data: { course: 'TEP' } });
ok('코스 맞음', dayMatches(tep, ['TEP', '', 'p-tep']));
ok('코스 다름', !dayMatches(tep, ['Speaking Course', '', 'p-speaking']));
ok('공통(코스 칸 빈 것)', dayMatches(item({}), ['Speaking Course']));
ok('대소문자·띄어쓰기 무시', dayMatches(item({ data: { course: 'speaking course' } }), ['Speaking Course']));
const sorted = [item({ id: 'b', data: { time: '13:00' } }), item({ id: 'c', data: {} }), item({ id: 'a', data: { time: '07:30' } })].sort(byTime).map((x) => x.id).join('');
ok('시간 순서(시간 없으면 뒤)', sorted === 'abc', sorted);

console.log(`화면 콘텐츠 표시 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
