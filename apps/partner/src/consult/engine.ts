import type { Course, RuleSet } from '../data';

export type Answers = Record<string, string>;

export interface Recommendation {
  campus: string;
  first: Course;
  alt: Course | null;
  weeks: number | null;
  /** 희망 기간(답변)과 권장 기간 차이(주). 양수면 권장이 더 길다 */
  diff: number | null;
  defaultLevel: string | null;
}

/** 추천 조건표: 위에서부터 조건이 모두 맞는 첫 규칙을 쓴다. 조건이 빈 규칙은 기본값이다. */
export function recommend(set: RuleSet, answers: Answers, courses: Course[]): Recommendation | null {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const rule = set.rules.find((r) => Object.entries(r.when).every(([q, vals]) => vals.includes(answers[q])));
  if (!rule) return null;
  const first = byId.get(rule.first);
  if (!first) return null;
  const wished = Number(answers.weeks);
  const weeks = rule.weeks ?? null;
  return {
    campus: rule.campus,
    first,
    alt: (rule.alt && byId.get(rule.alt)) || null,
    weeks,
    diff: weeks && Number.isFinite(wished) && wished > 0 ? weeks - wished : null,
    defaultLevel: set.level_defaults[first.id]?.[answers.level] ?? first.levels[0]?.name ?? null,
  };
}

export const answerLabel = (set: RuleSet, qid: string, value: string) =>
  set.questions.find((q) => q.id === qid)?.options.find(([v]) => v === value)?.[1] ?? value;
