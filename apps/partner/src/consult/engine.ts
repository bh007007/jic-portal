import type { Course, LevelCheck, Rule, RuleSet, ScoreModel } from '../data';

export type Answers = Record<string, string>;

/** 점수 방식의 코스별 계산 결과(관리자 확인·시험용) */
export interface Scored {
  id: string;
  score: number;
  excluded: boolean;
  /** Q1(학습 목적)이 ◎ 인지: 동점일 때 먼저 */
  firstTop: boolean;
  /** 조건표 열 순서 */
  order: number;
}

export interface Recommendation {
  campus: string;
  first: Course;
  alt: Course | null;
  /** 대안이 되는 조건(조건표 '대안이 되는 조건', 1순위 코스 기준). 대안이 점수 2위로 정해졌으면 null */
  altWhen: string | null;
  /** 권장 기간(주) */
  weeks: number | null;
  /** 희망 기간(답변)과 권장 기간 차이(주). 양수면 권장이 더 길다 */
  diff: number | null;
  /** 단계 선택 화면에서 먼저 골라 둘 단계. 없으면 직접 고른다(CL-020) */
  defaultLevel: string | null;
  /** 점수 계산에 쓴 수준과 '잘 모름'에서 추정했는지(CL-012) */
  level: string | null;
  estimated: boolean;
  ranking: Scored[];
}

export const isScoreModel = (rules: RuleSet['rules'] | null | undefined): rules is ScoreModel =>
  !!rules && !Array.isArray(rules) && (rules as ScoreModel).model === 'score';

/** 레벨 간단 확인(CL-012): 세 문항 0~2점 합계 → 추정 레벨(최고 B2). 다 답하지 않았으면 null */
export function estimateLevel(lc: LevelCheck, scores: (number | undefined)[]): string | null {
  if (lc.items.some((_, i) => scores[i] == null)) return null;
  const sum = lc.items.reduce((a, _, i) => a + (scores[i] ?? 0), 0);
  return lc.bands.find((b) => sum >= b.min && sum <= b.max)?.level ?? null;
}

/** 점수 계산에 쓸 답: '잘 모름'이면 추정 레벨로 바꾼다. 추정이 안 되면 null(아직 답하지 않음) */
export function scoringAnswers(model: ScoreModel, answers: Answers, checks: (number | undefined)[] = []): { answers: Answers; level: string | null; estimated: boolean } | null {
  const lc = model.level_check;
  if (lc && answers[lc.question] === lc.unknown) {
    const level = estimateLevel(lc, checks);
    if (!level) return null;
    return { answers: { ...answers, [lc.question]: level }, level, estimated: true };
  }
  return { answers, level: lc ? answers[lc.question] ?? null : null, estimated: false };
}

/**
 * 조건표 v2.1 계산 규칙(CL-021, 2026-11-09 확정). 정책이라 바꾸려면 조건표·Change Log 를 먼저 고친다(요청 R-003).
 * - 운영 중이고 포털에 노출하는 코스만 본다(New Campus 는 '운영 중'이 되기 전까지 제외).
 * - 답 중 × 가 하나라도 있으면 제외. 남은 코스는 ◎ 2점·○ 1점 합산.
 * - 조건표에 행이 없는 답(Q2 '둘 다 괜찮음')은 점수도 제외도 없다('모든 코스를 후보로 본다').
 * - 순서: 점수 높은 순 → 동점이면 Q1 이 ◎ 인 코스 → 그래도 같으면 조건표 열 순서.
 */
export function rank(model: ScoreModel, answers: Answers, firstQuestion: string): Scored[] {
  const out = model.courses.map((c, order) => {
    let score = 0;
    let excluded = !(c.visible && c.status === '운영 중');
    for (const [qid, v] of Object.entries(answers)) {
      const m = c.marks[qid]?.[v];
      if (m === '×') excluded = true;
      else if (m) score += model.points[m] ?? 0;
    }
    return { id: c.course, score, excluded, firstTop: c.marks[firstQuestion]?.[answers[firstQuestion]] === '◎', order };
  });
  return out.sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.score - a.score || Number(b.firstTop) - Number(a.firstTop) || a.order - b.order);
}

function recommendScore(set: RuleSet, model: ScoreModel, answers: Answers, courses: Course[], checks: (number | undefined)[]): Recommendation | null {
  const sa = scoringAnswers(model, answers, checks);
  if (!sa) return null;
  const byId = new Map(courses.filter((c) => c.status === 'open').map((c) => [c.id, c]));
  const ranking = rank(model, sa.answers, set.questions[0]?.id ?? '');
  const candidates = ranking.filter((r) => !r.excluded && byId.has(r.id));
  if (!candidates.length) return null;
  const top = candidates[0];
  const col = model.courses.find((c) => c.course === top.id)!;
  // 2순위: 1순위의 대안 코스가 후보에 남아 있으면 그 코스, 없으면 점수 2위
  const altCandidate = col.alt && col.alt !== top.id ? candidates.find((r) => r.id === col.alt) : undefined;
  const second = altCandidate ?? candidates[1];
  const first = byId.get(top.id)!;
  const wished = Number(answers.weeks);
  const weeks = col.weeks ?? null;
  const levels = first.levels ?? [];
  return {
    campus: first.campus_id,
    first,
    alt: second ? byId.get(second.id) ?? null : null,
    altWhen: altCandidate ? col.alt_when : null,
    weeks,
    diff: weeks && Number.isFinite(wished) && wished > 0 ? weeks - wished : null,
    defaultLevel: levels.find((l) => l.default)?.name ?? (levels.length === 1 ? levels[0].name : null),
    level: sa.level,
    estimated: sa.estimated,
    ranking,
  };
}

/** 예전 샘플 규칙(sample-1): 위에서부터 조건이 모두 맞는 첫 규칙. 조건이 빈 규칙은 기본값이다. */
function recommendFirstMatch(set: RuleSet, rules: Rule[], answers: Answers, courses: Course[]): Recommendation | null {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const rule = rules.find((r) => Object.entries(r.when).every(([q, vals]) => vals.includes(answers[q])));
  if (!rule) return null;
  const first = byId.get(rule.first);
  if (!first) return null;
  const wished = Number(answers.weeks);
  const weeks = rule.weeks ?? null;
  return {
    campus: rule.campus,
    first,
    alt: (rule.alt && byId.get(rule.alt)) || null,
    altWhen: null,
    weeks,
    diff: weeks && Number.isFinite(wished) && wished > 0 ? weeks - wished : null,
    defaultLevel: set.level_defaults[first.id]?.[answers.level] ?? first.levels[0]?.name ?? null,
    level: answers.level ?? null,
    estimated: false,
    ranking: [],
  };
}

/** checks: 레벨 간단 확인 세 문항 점수(Q3 '잘 모름'일 때만 쓴다) */
export function recommend(set: RuleSet, answers: Answers, courses: Course[], checks: (number | undefined)[] = []): Recommendation | null {
  return isScoreModel(set.rules) ? recommendScore(set, set.rules, answers, courses, checks) : recommendFirstMatch(set, set.rules, answers, courses);
}

export const answerLabel = (set: RuleSet, qid: string, value: string) =>
  set.questions.find((q) => q.id === qid)?.options.find(([v]) => v === value)?.[1] ?? value;
