/**
 * 견적 결과 블록 화면 글자(D8·P7: 문구는 코드와 따로). 1차 화면은 한국어.
 * 프로모션 표시 이름은 가격 버전의 프로모션 표(display)에 있고, 계산 근거 낱말은 packages/quote BASIS_TEXT.
 */
export const QV_TEXT = {
  ko: {
    title: '견적',
    course: '코스',
    dorm: '숙소',
    itemsTotal: '코스+숙소',
    registration: '등록금',
    adjust: '할인 · 추가요금',
    total: '총 학비',
    local: '현지비용 (페소, 현지 납부)',
    localTotal: '현지비용 합계',
    pending: '확인 필요',
    weeks: (n: number) => `${n}주`,
    discount: '할인',
    surcharge: '추가요금',
  },
} as const;
export type QvLang = keyof typeof QV_TEXT;
