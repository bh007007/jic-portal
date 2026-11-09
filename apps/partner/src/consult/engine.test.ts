// 상담 추천 계산 시험(조건표 v2.1, CL-021). 데이터는 마이그레이션 20261109140000_partner_reco_v21.sql 의 JSON 을 그대로 읽는다.
// 실행: npm --workspace apps/partner run test (partner:build 에 포함)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Course, Question, RuleSet, ScoreModel } from '../data';
import { estimateLevel, rank, recommend } from './engine';

// npm 워크스페이스 스크립트는 apps/partner 에서 돈다(번들 뒤에는 import.meta.url 이 캐시 폴더라 쓰지 않는다)
const sql = readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261109140000_partner_reco_v21.sql'), 'utf8');
const between = (tag: string) => JSON.parse(sql.split(`$${tag}$`)[1]);
const questions = between('q') as Question[];
const model = between('r') as ScoreModel;
const levels = Object.fromEntries([...sql.matchAll(/levels = \$lv\$(\[.*?\])\$lv\$::jsonb, updated_at = now\(\)\n {2}where id = '([^']+)'/g)].map((m) => [m[2], JSON.parse(m[1])]));

const NAMES: Record<string, [string, string]> = {
  'p-esl': ['premium', 'ESL'], 'p-tep': ['premium', 'TEP'], 'p-speaking': ['premium', 'Speaking Course'], 'p-wh': ['premium', 'Working Holiday'],
  'p-toeic': ['premium', 'TOEIC'], 'p-business': ['premium', 'Business Master'], 'p-senior': ['premium', 'Senior'],
  'c-ielts': ['challenger', 'IELTS'], 'c-ielts-g': ['challenger', 'IELTS Guarantee'], 'c-esl': ['challenger', 'ESL'],
};
const courses: Course[] = Object.entries(NAMES).map(([id, [campus_id, name]], sort) => ({ id, campus_id, name, levels: levels[id] ?? [], sort, status: 'open' }));
const set: RuleSet = { id: 1, version: 'V2.1', status: 'approved', note: null, questions, rules: model, level_defaults: {}, updated_at: '' };

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const rec = (a: Record<string, string>, checks: number[] = []) => recommend(set, a, courses, checks);

// ── 데이터 모양: 질문 5개, 조건표 10코스, 빈 칸 없음(엑셀 '입력 확인'과 같음)
ok('질문 5개', questions.length === 5 && questions.map((q) => q.id).join() === 'purpose,focus,level,weeks,age');
ok('Q4 4주부터(CL-016)', questions[3].options.map(([v]) => v).join() === '4,8,12,16');
ok('Q5 17세 이하 없음(CL-003)', !questions[4].options.some(([, l]) => l.includes('17')));
ok('Q1 TEP 문구(CL-001)', questions[0].options.some(([, l]) => l === '테마별 관심 영어 향상 (TEP)'));
ok('Q3 잘 모름(CL-012)', questions[2].options.some(([v]) => v === 'unknown'));
ok('안내 문구(CL-003)', (model.intro ?? '').includes('만 18세 이상'));
ok('10코스', model.courses.length === 10);
for (const c of model.courses) {
  for (const q of questions) {
    const rows = q.options.map(([v]) => v).filter((v) => v !== 'unknown' && !(q.id === 'focus' && v === 'both'));
    ok(`${c.course} ${q.id} 빈 칸 없음`, rows.every((v) => ['◎', '○', '×'].includes(c.marks[q.id]?.[v])), JSON.stringify(c.marks[q.id]));
  }
}
const col = (id: string) => model.courses.find((c) => c.course === id)!;
ok('Speaking 공부에 집중 ◎(CL-013)', col('p-speaking').marks.focus.study === '◎');
ok('Speaking 워홀 준비 ○(CL-014)', col('p-speaking').marks.purpose.wh === '○');
ok('ESL·Senior·Challenger ESL 선행 없음(CL-015·017)', !col('p-esl').prereq && !col('p-senior').prereq && !col('c-esl').prereq);
ok('Challenger ESL 대안 조건(CL-010)', col('c-esl').alt === 'c-ielts' && col('c-esl').alt_when === '더 집중해서 공부하고 싶을 때');
ok('단계: ESL 기본 세미 스파르타, IELTS 기본 스파르타(CL-007)', levels['c-esl'][0].name === '세미 스파르타' && levels['c-esl'][0].default && levels['c-ielts'][0].name === '스파르타' && levels['c-ielts'][0].default);
ok('단계: TEP·Speaking·Senior 기본 없음(CL-020)', ['p-tep', 'p-speaking', 'p-senior'].every((id) => levels[id].every((l: { default: boolean }) => !l.default)));
ok('단계: Senior 5·6교시(CL-018)', levels['p-senior'].map((l: { lessons: string }) => l.lessons).join('|') === '5교시 (1:1 정규 3 + 옵션 2)|6교시 (1:1 정규 4 + 옵션 2)');

// ── 레벨 간단 확인 합계 → 추정 레벨(최고 B2)
const lc = model.level_check!;
ok('0~1점 A1', estimateLevel(lc, [0, 1, 0]) === 'A1');
ok('2~3점 A2', estimateLevel(lc, [1, 1, 1]) === 'A2');
ok('4점 B1', estimateLevel(lc, [2, 1, 1]) === 'B1');
ok('5~6점 B2', estimateLevel(lc, [2, 2, 2]) === 'B2');
ok('다 답하지 않으면 없음', estimateLevel(lc, [2, 2]) === null);

// ── 계산 규칙(조건표 값으로 손 계산한 결과와 비교)
// IELTS·공부 집중·B1·12주·18–29: IELTS 10점, IELTS Guarantee 9점. IELTS 의 대안 Challenger ESL 은 × 로 빠져 점수 2위가 대안
let r = rec({ purpose: 'ielts', focus: 'study', level: 'B1', weeks: '12', age: '18' });
ok('IELTS 1순위', r?.first.id === 'c-ielts' && r.campus === 'challenger', JSON.stringify(r?.ranking));
ok('대안이 빠지면 점수 2위', r?.alt?.id === 'c-ielts-g' && r.altWhen === null);
ok('IELTS 기본 단계 스파르타', r?.defaultLevel === '스파르타');
ok('권장 기간 12주, 차이 0', r?.weeks === 12 && r.diff === 0);
// 영어회화·말하기·A2·8주·30–39: Speaking 10, TEP 9, Challenger ESL 9, ESL 8 → 대안은 Speaking 의 대안 ESL(점수 2위보다 우선)
r = rec({ purpose: 'conversation', focus: 'speaking', level: 'A2', weeks: '8', age: '30' });
ok('Speaking 1순위', r?.first.id === 'p-speaking', JSON.stringify(r?.ranking));
ok('대안 코스 우선(점수 2위보다)', r?.alt?.id === 'p-esl' && r.altWhen === '수준이 낮을 때');
ok('Speaking 기본 단계 없음(CL-020)', r?.defaultLevel === null);
ok('Senior 30대 × 제외', r?.ranking.find((x) => x.id === 'p-senior')?.excluded === true);
// 기초·둘 다·A1·8주·40–49: ESL·Senior·Challenger ESL 7점 동점, 모두 Q1 ◎ → 열 순서로 ESL. '둘 다'는 점수·제외 없음
r = rec({ purpose: 'basics', focus: 'both', level: 'A1', weeks: '8', age: '40' });
ok('동점이면 열 순서', r?.first.id === 'p-esl', JSON.stringify(r?.ranking));
ok('둘 다 괜찮음은 제외 없음', r?.ranking.filter((x) => !x.excluded).map((x) => x.id).sort().join() === 'c-esl,p-esl,p-senior,p-speaking,p-tep');
// 잘 모름 → 레벨 간단 확인 2·1·1 = 4점 → B1 로 계산
r = rec({ purpose: 'ielts', focus: 'study', level: 'unknown', weeks: '12', age: '18' }, [2, 1, 1]);
ok('잘 모름 → 추정 B1', r?.level === 'B1' && r.estimated && r.first.id === 'c-ielts');
ok('레벨 확인 전에는 추천 없음', rec({ purpose: 'ielts', focus: 'study', level: 'unknown', weeks: '12', age: '18' }, [2]) === null);
// 모든 코스가 × 면 추천 없음: TOEIC 목적 + 공부에 집중(TOEIC 은 공부 집중 ×, 나머지는 TOEIC ×)
ok('후보가 없으면 null', rec({ purpose: 'toeic', focus: 'study', level: 'B1', weeks: '8', age: '18' }) === null);
// 50세 이상도 TEP 추천 가능(CL-008): 테마별·말하기·B1·4주·50+ → TEP 가 1순위 후보
r = rec({ purpose: 'tep', focus: 'speaking', level: 'B1', weeks: '4', age: '50' });
ok('50대 TEP', r?.first.id === 'p-tep', JSON.stringify(r?.ranking));

// ── 동점 규칙: Q1 ◎ 가 ○ 보다 먼저(가상의 2코스 조건표)
const tiny: ScoreModel = {
  model: 'score', points: { '◎': 2, '○': 1 },
  courses: [
    { course: 'a', marks: { q1: { x: '○' }, q2: { y: '◎' } }, min_weeks: 4, weeks: 4, alt: null, alt_when: null, prereq: null, prereq_weeks: null, status: '운영 중', visible: true },
    { course: 'b', marks: { q1: { x: '◎' }, q2: { y: '○' } }, min_weeks: 4, weeks: 4, alt: null, alt_when: null, prereq: null, prereq_weeks: null, status: '운영 중', visible: true },
    { course: 'c', marks: { q1: { x: '◎' }, q2: { y: '◎' } }, min_weeks: 4, weeks: 4, alt: null, alt_when: null, prereq: null, prereq_weeks: null, status: '미확정', visible: false },
  ],
};
const tr = rank(tiny, { q1: 'x', q2: 'y' }, 'q1');
ok('동점이면 Q1 ◎ 먼저', tr[0].id === 'b' && tr[1].id === 'a', JSON.stringify(tr));
ok('운영 전·숨김 코스 제외', tr.find((x) => x.id === 'c')?.excluded === true);

console.log(`상담 추천 계산 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
