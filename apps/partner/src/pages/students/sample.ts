/**
 * My Students 예시 데이터(CL-051, 화면 명세 6장). 전부 가짜다(실제 학생·지점과 관계없음). 2차 연동 전까지 화면 모양을 보여 주는 데만 쓴다.
 * 날짜는 오늘을 기준으로 만들어 입학 예정·재학·졸업(2주 안, P6)·취소가 늘 맞게 보이게 한다.
 * 연동되면 원본: 학생·연수 legacy_students·legacy_enrollments(지점 = tr_am_id ↔ legacy_am_id), 픽업 tr_pick_*, 출석·성적 LMS, 패널티 인트라넷, 인보이스 회계 추출(명세 6.2).
 */
export type StudentStatus = 'upcoming' | 'current' | 'graduated' | 'cancelled';
export const STATUS_TABS: [StudentStatus, string][] = [['upcoming', '입학 예정'], ['current', '재학'], ['graduated', '졸업'], ['cancelled', '취소']];

export interface SampleStudent {
  id: string;
  name: string;
  status: StudentStatus;
  campus: string;
  course: string;
  level: string;
  dorm: string;
  weeks: number;
  start: string;
  end: string;
  extension?: { weeks: number; end: string };
  arrival: { date: string; time: string; flight: string; airport: string; pickup: boolean } | null;
  attendance?: { rate: number; absent: number; late: number; total: number };
  tests: { date: string; name: string; score: string; cefr: string }[];
  reports: { month: string; title: string }[];
  penalty?: { points: number; stage: string };
  invoices: { no: string; item: string; amount: string; status: '완납' | '부분 납부' | '미납' }[];
}

const day = (base: string, add: number) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
};

/** 오늘 기준 예시 학생 */
export function sampleStudents(today: string): SampleStudent[] {
  return [
    {
      id: 's1', name: '예시 학생 A', status: 'current', campus: 'Premium', course: 'Speaking Course', level: 'PRO', dorm: '2인실', weeks: 8,
      start: day(today, -24), end: day(today, 31), extension: { weeks: 4, end: day(today, 59) },
      arrival: { date: day(today, -25), time: '22:40', flight: 'XX 123', airport: '마닐라(MNL) T3', pickup: true },
      attendance: { rate: 96, absent: 1, late: 2, total: 64 },
      tests: [
        { date: day(today, -24), name: '입학 레벨 테스트', score: '42 / 100', cefr: 'A2' },
        { date: day(today, -10), name: '4주 평가', score: '55 / 100', cefr: 'B1' },
      ],
      reports: [{ month: day(today, -10).slice(0, 7), title: '4주 그로스 리포트' }],
      penalty: { points: 2, stage: '없음' },
      invoices: [
        { no: 'INV-0001', item: 'Speaking Course 8주 · 2인실', amount: 'KRW 0,000,000(예시)', status: '완납' },
        { no: 'INV-0002', item: '연장 4주', amount: 'KRW 0,000,000(예시)', status: '부분 납부' },
      ],
    },
    {
      id: 's2', name: '예시 학생 B', status: 'current', campus: 'Challenger', course: 'IELTS', level: 'Band 6.0 목표', dorm: '4인실', weeks: 12,
      start: day(today, -45), end: day(today, 38),
      arrival: { date: day(today, -46), time: '10:15', flight: 'YY 456', airport: '클락(CRK)', pickup: true },
      attendance: { rate: 89, absent: 4, late: 5, total: 120 },
      tests: [
        { date: day(today, -45), name: '입학 레벨 테스트', score: 'IELTS 5.0', cefr: 'B1' },
        { date: day(today, -17), name: '모의 IELTS', score: 'IELTS 5.5', cefr: 'B1' },
      ],
      reports: [{ month: day(today, -17).slice(0, 7), title: '4주 그로스 리포트' }, { month: day(today, -3).slice(0, 7), title: '8주 그로스 리포트' }],
      penalty: { points: 6, stage: '1차 경고' },
      invoices: [{ no: 'INV-0003', item: 'IELTS 12주 · 4인실', amount: 'KRW 0,000,000(예시)', status: '완납' }],
    },
    {
      id: 's3', name: '예시 학생 C', status: 'upcoming', campus: 'Premium', course: 'TEP', level: 'TEP 8', dorm: '1인실', weeks: 4,
      start: day(today, 10), end: day(today, 37),
      arrival: { date: day(today, 9), time: '23:55', flight: 'ZZ 789', airport: '마닐라(MNL) T1', pickup: true },
      tests: [], reports: [],
      invoices: [{ no: 'INV-0004', item: 'TEP 4주 · 1인실', amount: 'KRW 0,000,000(예시)', status: '미납' }],
    },
    {
      id: 's4', name: '예시 학생 D', status: 'upcoming', campus: 'Challenger', course: 'ESL', level: '-', dorm: '2인실', weeks: 8,
      start: day(today, 17), end: day(today, 72),
      arrival: null, // 항공편을 아직 받지 못함
      tests: [], reports: [],
      invoices: [{ no: 'INV-0005', item: 'ESL 8주 · 2인실', amount: 'KRW 0,000,000(예시)', status: '부분 납부' }],
    },
    {
      id: 's5', name: '예시 학생 E', status: 'graduated', campus: 'Premium', course: 'Business Master', level: '-', dorm: '1인실', weeks: 4,
      start: day(today, -33), end: day(today, -6),
      arrival: { date: day(today, -34), time: '18:20', flight: 'XX 321', airport: '마닐라(MNL) T3', pickup: false },
      attendance: { rate: 100, absent: 0, late: 0, total: 32 },
      tests: [
        { date: day(today, -33), name: '입학 레벨 테스트', score: '61 / 100', cefr: 'B1' },
        { date: day(today, -7), name: '수료 평가', score: '70 / 100', cefr: 'B2' },
      ],
      reports: [{ month: day(today, -7).slice(0, 7), title: '수료 리포트' }],
      penalty: { points: 0, stage: '없음' },
      invoices: [{ no: 'INV-0006', item: 'Business Master 4주 · 1인실', amount: 'KRW 0,000,000(예시)', status: '완납' }],
    },
    {
      id: 's6', name: '예시 학생 F', status: 'cancelled', campus: 'Challenger', course: 'IELTS Guarantee', level: '-', dorm: '-', weeks: 12,
      start: day(today, 24), end: day(today, 107),
      arrival: null, tests: [], reports: [],
      invoices: [{ no: 'INV-0007', item: 'IELTS Guarantee 12주(취소)', amount: 'KRW 0(예시)', status: '완납' }],
    },
  ];
}
