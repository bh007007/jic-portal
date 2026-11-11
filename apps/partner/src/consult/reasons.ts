/**
 * 추천 이유 3칸(CL-050, 화면 명세 3장). 표 course_reasons(20261112010000), 입력은 관리자 포털 '상담 설정 › 추천 이유'.
 * 이유 1 = 학생의 학습 목적(Q1 답), 이유 2 = 중요하게 생각하는 것(Q2 답), 이유 3 = 성장 근거(공통).
 * 칸마다: 답에 맞는 이유 → 그 코스의 기본 이유(answer '') → 예전 코스별 글(course_contents.reason_*) → '준비 중'(C8).
 * Q2 '둘 다 괜찮음'(both)은 기본 이유 2를 쓴다. 화면·DB에 기대지 않아 시험에서 바로 부른다(reasons.test.ts).
 */
export interface CourseReason {
  id: string;
  course_id: string;
  slot: 1 | 2 | 3;
  answer: string;
  title: string;
  body: string;
  evidence: string[];
  i18n: Record<string, { title?: string; body?: string }>;
  status: 'draft' | 'published' | 'hidden';
  updated_on: string | null;
  updated_at: string;
}

/** 칸 이름과 기준 질문(조건표 질문 순서: Q1 = 0번째, Q2 = 1번째) */
export const REASON_SLOTS: { slot: 1 | 2 | 3; label: string; head: string; question: number | null }[] = [
  { slot: 1, label: '학습 목적', head: '이유 1 · 학생의 학습 목적 (Q1 답)', question: 0 },
  { slot: 2, label: '중요하게 생각하는 것', head: '이유 2 · 중요하게 생각하는 것 (Q2 답)', question: 1 },
  { slot: 3, label: '성장 근거', head: '이유 3 · 성장 근거 (모든 학생 공통)', question: null },
];

/** Q2 '둘 다 괜찮음'은 기본 이유 2(명세 3장) — 따로 쓰지 않는다 */
export const BOTH_ANSWER = 'both';

/** 예전 코스별 글 3칸(R-011)을 새 칸에 이어 쓰는 순서: 수업 방식 → 이유 1, 학습 환경 → 이유 2, 성장 확인 → 이유 3 */
export const LEGACY: { slot: 1 | 2 | 3; key: 'reason_learning' | 'reason_environment' | 'reason_growth'; title: string }[] = [
  { slot: 1, key: 'reason_learning', title: '수업 방식' },
  { slot: 2, key: 'reason_environment', title: '학습 환경' },
  { slot: 3, key: 'reason_growth', title: '성장 확인' },
];

export interface PickedReason {
  slot: 1 | 2 | 3;
  label: string;
  title: string;
  body: string;
  evidence: string[];
  source: 'answer' | 'default' | 'legacy' | 'none';
}

const tx = (r: Pick<CourseReason, 'title' | 'body' | 'i18n'>, lang: string) => {
  const t = lang === 'ko' ? undefined : r.i18n?.[lang];
  return { title: t?.title || r.title, body: t?.body || r.body };
};

/**
 * 추천된 코스와 학생 답으로 이유 3칸을 고른다.
 * @param answers 조건표 질문 id → 답(Q1·Q2 id 는 questionIds 로)
 * @param legacy 예전 코스별 글(course_contents 한 줄). 없으면 undefined
 */
export function pickReasons(
  reasons: CourseReason[],
  courseId: string,
  answers: Record<string, string | undefined>,
  questionIds: (string | undefined)[],
  legacy?: Partial<Record<'reason_learning' | 'reason_environment' | 'reason_growth', string | null>>,
  lang = 'ko',
): PickedReason[] {
  const mine = reasons.filter((r) => r.course_id === courseId && r.status === 'published');
  return REASON_SLOTS.map(({ slot, label, question }) => {
    const qid = question === null ? undefined : questionIds[question];
    const ans = qid ? answers[qid] ?? '' : '';
    const byAnswer = ans && ans !== BOTH_ANSWER ? mine.find((r) => r.slot === slot && r.answer === ans) : undefined;
    const byDefault = mine.find((r) => r.slot === slot && r.answer === '');
    const hit = byAnswer ?? byDefault;
    if (hit) return { slot, label, ...tx(hit, lang), evidence: hit.evidence ?? [], source: byAnswer ? 'answer' : 'default' };
    const old = LEGACY.find((l) => l.slot === slot)!;
    const text = legacy?.[old.key]?.trim();
    if (text) return { slot, label, title: old.title, body: text, evidence: [], source: 'legacy' };
    return { slot, label, title: '', body: '', evidence: [], source: 'none' };
  });
}
