// 학교 여행(학생 앱 server/trips.ts) 화면 이름. 학생 앱 문구와 뜻을 맞춘다.
export const TRIP_STATUS: Record<string, string> = { open: '신청 받는 중', closed: '신청 마감', cancelled: '여행 취소' };
export const TRIP_STATUS_CLASS: Record<string, string> = { open: 'text-blue', closed: 'muted', cancelled: 'text-red' };
export const SIGNUP_STATUS: Record<string, string> = { applied: '참가 신청', waiting: '대기', cancelled: '학생 취소', removed: '명단 제외' };
export const SIGNUP_STATUS_CLASS: Record<string, string> = { applied: 'text-blue', waiting: '', cancelled: 'muted', removed: 'text-red' };

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const day = (d: string) => `${d.slice(5).replace('-', '.')} (${WEEK[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
/** 11.14 (토) ~ 11.15 (일) · 1박 / 11.14 (토) · 당일 */
export const tripDates = (t: { start: string; end: string; nights: number }) => (t.nights > 0 ? `${day(t.start)} ~ ${day(t.end)} · ${t.nights}박` : `${day(t.start)} · 당일`);
export const tripCost = (cost: number) => (cost > 0 ? `${cost.toLocaleString('en-US')} PHP` : '무료');
export const deadlineText = (d: string) => `${day(d)}까지`;

/** 이 화면에서만 뜻이 다른 오류 코드(같은 코드를 다른 화면이 다른 뜻으로 쓴다) */
export const TRIP_ERRORS: Record<string, string> = {
  invalid_date: '출발일과 돌아오는 날을 확인하세요.',
  reason_required: '명단에서 빼는 사유를 적어 주세요(학생에게 보입니다).',
  reason_too_long: '사유는 300자까지 쓸 수 있습니다.',
  invalid_status: '여행 상태를 고르세요.',
};
