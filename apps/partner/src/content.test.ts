// 화면 콘텐츠 표시 시험(CL-045·054): 유튜브 주소, 언어별 문구, 기준일 줄, 학생의 하루 코스 맞추기. npm run test 에서 돈다.
import type { ContentItem } from './contentKinds';
import { byTime, dayMatches, focusPos, listUpdate, textOf, youtubeId } from './contentText';
import { guessFromName } from './photoGuess';
import { PLACEMENTS } from './contentKinds';

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

// 5) 사진 중심점 → object-position
ok('중심점', focusPos(item({ data: { focus: [0.25, 0.8] } })) === '25% 80%');
ok('중심점 없음·잘못된 값은 가운데', focusPos(item({})) === '50% 50%' && focusPos(item({ data: { focus: [2, 0.5] } })) === '50% 50%');

// 6) 시제품 묶음 파일 이름 → 화면 위치·캠퍼스·순서(사진 보관함 자동 분류)
const g = (n: string) => guessFromName(n);
const want: [string, string, string, number?][] = [
  ['pk000_PHOTO_t_pre.jpg', 'campus_card', 'premium', 0],
  ['pk059_CAMPUS_PHOTO_CLEAN_pre.jpg', 'campus_hero', 'premium', 59],
  ['pk120_CAMPUS_PHOTO_cha.jpg', 'campus_card', 'challenger'],
  ['pk121_MAP_IMG_pre.jpg', 'map', 'premium'],
  ['pk003_PHOTO_g_why.jpg', 'why_jic', ''],
  ['pk010_PHOTO_jr_hero.jpg', 'camp', 'premium'],
  ['pk066_PHOTO_s_mco_room.jpg', 'camp', 'mco'],
  ['pk061_PHOTO_s_pre_room.jpg', 'dorm', 'premium'],
  ['pk076_PHOTO_s_cha_meal1.jpg', 'meals', 'challenger'],
  ['pk081_PHOTO_s_yoga.jpg', 'activity', ''],
  ['pk096_PHOTO_c_r1_1.jpg', 'dorm', 'challenger'],
  ['pk111_PHOTO_c_209_1.jpg', 'dorm', 'challenger'],
  ['pk091_PHOTO_c_ov1.jpg', 'campus_gallery', 'challenger'],
  ['pk055_PHOTO_cls_t1.jpg', 'academic', ''],
  ['spot_pre_academic_o2_c0dda1.jpg', 'academic', 'premium', 2],
  ['hero_campus_cha_o0_5a159f.jpg', 'campus_hero', 'challenger', 0],
  ['guide_01_o-2_dbbeac.jpg', '', '', -2],
  ['baguio_hero_o0_857a1f.jpg', 'baguio', ''],
  ['act_줌바_o0_f68f56.jpg', 'activity', ''],
  ['할로윈_3_a0c47b2e.jpg', 'event', 'premium', 3],
  ['New캠퍼스_티저_8d909572.jpg', 'campus_hero', 'new'],
  ['그냥사진.png', '', ''],
];
for (const [n, placement, campus, sort] of want) {
  const r = g(n);
  ok(`자동 분류 ${n}`, !r.skip && r.placement === placement && r.campus === campus && (sort === undefined || r.sort === sort), JSON.stringify(r));
}
ok('줌바 설명', g('act_줌바_o0_f68f56.jpg').caption === '줌바');
const travel = g('pk021_TRAVEL_Mines_View_Park.jpg');
ok('여행지 → 바기오·설명·순서', travel.placement === 'baguio' && travel.caption === 'Mines View Park' && travel.sort === 21 && !travel.skip, JSON.stringify(travel));
ok('여행지 이름의 점', g('pk030_TRAVEL_Mt._Pulag_National_Park.jpg').caption === 'Mt. Pulag National Park');
for (const n of ['pk040_FEE_IMG_pre_t.jpg', 'pk020_-_unused.jpg', 'pk122_REPORT_ASSET_read.jpg', 'pk045_FEE_PDF_pre_t.bin', 'JICPlay_a8_표지.jpg', 'JICPlay_a8_할로윈_포토존.mp4'])
  ok(`건너뜀 ${n}`, !!g(n).skip, JSON.stringify(g(n)));
const keys = new Set(PLACEMENTS.map((p) => p.key));
ok('자동 분류 화면 위치는 모두 목록에 있음', want.every(([, p]) => !p || keys.has(p)));

console.log(`화면 콘텐츠 표시 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
