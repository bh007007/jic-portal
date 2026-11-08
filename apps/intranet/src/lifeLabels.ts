/** 생활 요청(학생 앱 server/lifeRequests.ts)의 화면 이름 */
export const LIFE_CATEGORY: Record<string, string> = {
  facility: '시설 수리',
  room_change: '방 변경',
  id_card: 'ID 카드 재발급',
  document: '서류 발급',
  other: '기타',
};
export const LIFE_STATUS: Record<string, string> = {
  received: '접수',
  in_progress: '처리 중',
  done: '완료',
  rejected: '반려',
  cancelled: '학생 취소',
};
export const LIFE_STATUS_CLASS: Record<string, string> = {
  received: 'text-amber',
  in_progress: 'text-primary',
  done: 'text-blue',
  rejected: 'text-red',
  cancelled: 'muted',
};
