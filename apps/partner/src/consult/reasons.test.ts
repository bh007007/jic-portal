// 추천 이유 3칸 고르기 시험(CL-050, 명세 3장). npm run test 에서 돈다.
import { pickReasons, type CourseReason } from './reasons';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const r = (o: Partial<CourseReason>): CourseReason => ({
  id: Math.random().toString(36).slice(2), course_id: 'p-tep', slot: 1, answer: '', title: '', body: '', evidence: [], i18n: {},
  status: 'published', updated_on: null, updated_at: '2026-11-12T00:00:00Z', ...o,
});
const Q = ['purpose', 'focus'];
const reasons = [
  r({ slot: 1, answer: '', title: '기본1', evidence: ['e1'] }),
  r({ slot: 1, answer: 'tep', title: 'TEP 목적', i18n: { en: { title: 'For TEP' } } }),
  r({ slot: 2, answer: '', title: '기본2' }),
  r({ slot: 2, answer: 'speaking', title: '말하기 중시', evidence: ['e2', 'e3'] }),
  r({ slot: 2, answer: 'study', title: '초안', status: 'draft' }),
  r({ slot: 3, answer: '', title: '성장' }),
  r({ course_id: 'p-esl', slot: 1, answer: '', title: 'ESL 기본' }),
];
const pick = (ans: Record<string, string>, legacy?: Parameters<typeof pickReasons>[4], lang?: string) => pickReasons(reasons, 'p-tep', ans, Q, legacy, lang);

// 1) 답에 맞는 이유가 먼저
let p = pick({ purpose: 'tep', focus: 'speaking' });
ok('이유 1 = Q1 답(TEP)', p[0].title === 'TEP 목적' && p[0].source === 'answer');
ok('이유 2 = Q2 답(말하기)·증거 2개', p[1].title === '말하기 중시' && p[1].evidence.length === 2);
ok('이유 3 = 공통', p[2].title === '성장' && p[2].source === 'default');
ok('칸 이름', p.map((x) => x.label).join('/') === '학습 목적/중요하게 생각하는 것/성장 근거');

// 2) 없으면 기본
p = pick({ purpose: 'business', focus: 'study' });
ok('Q1 답 이유가 없으면 기본 1', p[0].title === '기본1' && p[0].source === 'default' && p[0].evidence[0] === 'e1');
ok('초안은 안 씀 → 기본 2', p[1].title === '기본2');
ok("Q2 '둘 다 괜찮음' → 기본 2", pick({ purpose: 'tep', focus: 'both' })[1].title === '기본2');
ok('답이 없어도 기본', pick({})[0].title === '기본1');

// 3) 다른 코스 이유는 안 씀, 기본도 없으면 예전 글 → 준비 중
const esl = pickReasons(reasons, 'p-esl', { purpose: 'tep' }, Q, { reason_environment: '조용한 자습실', reason_growth: '  ' });
ok('다른 코스: 자기 기본만', esl[0].title === 'ESL 기본');
ok('기본 없으면 예전 글(학습 환경 → 이유 2)', esl[1].source === 'legacy' && esl[1].title === '학습 환경' && esl[1].body === '조용한 자습실');
ok('예전 글도 비면 준비 중', esl[2].source === 'none' && esl[2].title === '');

// 4) 언어별 문구(P7): 번역이 없으면 한국어
p = pick({ purpose: 'tep', focus: 'speaking' }, undefined, 'en');
ok('영어 번역 제목', p[0].title === 'For TEP');
ok('번역 없는 칸은 한국어', p[1].title === '말하기 중시');

console.log(`추천 이유 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
