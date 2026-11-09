/**
 * 학생 앱 '시간표': 강사 포털(LMS)의 수업(class_sessions)과 출석(attendance)에서 이 학생이 든 수업을 주 단위로 보여 준다.
 * 수업·출석은 강사 포털이 쓰고 학생 앱은 읽기만 한다(원칙 L1). 결석 사유 인정은 강사 포털 매니저가 정한다.
 * 배포: DB 함수 student_timetable(학생 본인만, 20261109140000_student_timetable.sql), 로컬: 파일(강사 포털에 로컬 실행이 없어 비어 있다).
 * 강사 메모(attendance.note)와 다른 학생은 내보내지 않는다. 파일·네트워크 의존 없음.
 */

export type AttendanceResult = 'AT' | 'AB' | 'TA';

/** 이 학생이 든 수업 한 건 */
export interface ClassMark {
  id: string; // 수업 id
  day: string; // YYYY-MM-DD
  time: string; // 시작 'HH:MM'
  minutes: number;
  kind: '1' | 'G'; // 1:1 / 그룹
  subject: string;
  teacher: string; // 강사 부르는 이름(없으면 '')
  room: string; // 교실 번호(없으면 '')
  result: AttendanceResult | null; // null = 아직 체크 전
  lateMin: number | null;
  excused: boolean; // 결석·지각 사유 인정
}

export interface TimetableSource {
  classes(stId: string, from: string, to: string): Promise<ClassMark[]>;
}

const DAY = 864e5;
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** 그 날짜가 든 주의 월요일 */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 일요일
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/**
 * 주 단위 시간표. week 가 없거나 날짜가 아니면 오늘이 든 주. 월~일 7일을 날짜순으로, 수업은 시작 시각 순.
 * 합계는 그 주의 체크된 수업만 센다(사유 인정된 결석은 따로).
 */
export async function timetableView(source: TimetableSource | undefined, stId: string, today: string, week?: string | null) {
  const from = mondayOf(week && isDate(week) ? week : today);
  const to = addDays(from, 6);
  const marks = source ? (await source.classes(stId, from, to)).filter((m) => m.day >= from && m.day <= to) : [];
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    return { day, classes: marks.filter((m) => m.day === day).sort((a, b) => a.time.localeCompare(b.time)) };
  });
  const counts = { classes: marks.length, attended: 0, absent: 0, late: 0, excused: 0, unchecked: 0 };
  for (const m of marks) {
    if (m.result === null) counts.unchecked++;
    else if (m.result === 'AT') counts.attended++;
    else if (m.result === 'AB') counts[m.excused ? 'excused' : 'absent']++;
    else counts.late++;
  }
  return { available: !!source, today, from, to, prev: addDays(from, -7), next: addDays(from, 7), days, counts };
}
export type TimetableView = Awaited<ReturnType<typeof timetableView>>;
