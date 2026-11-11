/**
 * 방문 신청(CL-046, 화면 명세 4.6). 에이전시 포털 신청서·내 방문 내역과 관리자 포털 '방문 신청'이 같이 쓴다.
 * 처리 흐름: 접수 → 일정 조율 중 → 승인 요청 → 확정 / 반려, 그리고 어느 단계에서나 취소(사유). 단계 검사는 DB(20261111220000)가 한 번 더 한다.
 * 누가 어느 단계를 처리하는지(그 나라 마케터·그 캠퍼스 센터장)는 11/12 권한 정리(Q-4) 뒤. 그 전에는 직원 모두.
 */
export type VisitStatus = 'received' | 'scheduling' | 'approval' | 'confirmed' | 'rejected' | 'cancelled' | 'done';

export const VISIT_STATUS: Record<VisitStatus, string> = {
  received: '접수',
  scheduling: '일정 조율 중',
  approval: '승인 요청',
  confirmed: '확정',
  rejected: '반려',
  cancelled: '취소',
  done: '방문 완료', // 예전 값(11/11 이전). 새 흐름에서는 쓰지 않는다
};

/** 다음으로 갈 수 있는 단계(취소는 끝나지 않은 단계 어디서나). DB 트리거와 같게 둔다 */
export const VISIT_NEXT: Record<VisitStatus, VisitStatus[]> = {
  received: ['scheduling', 'cancelled'],
  scheduling: ['approval', 'cancelled'],
  approval: ['confirmed', 'rejected', 'scheduling', 'cancelled'],
  confirmed: ['cancelled'],
  rejected: [],
  cancelled: [],
  done: [],
};

export const visitOpen = (s: string) => ['received', 'scheduling', 'approval', 'confirmed'].includes(s);
/** 사유가 꼭 있어야 하는 단계 */
export const NEEDS_REASON: VisitStatus[] = ['rejected', 'cancelled'];

/** 방문 목적(여러 개, 시제품 V74 항목) */
export const VISIT_PURPOSES = ['캠퍼스 투어', '수업 참관', '기숙사 확인', '운영진 미팅', '학생 면담'];
export const VISIT_TIMES = ['오전', '오후', '상관없음'];
export const PICKUP: Record<string, string> = { none: '아니요', airport: '공항', city: '시내' };
/** 방문할 수 있는 캠퍼스(New Campus 는 준비 중이라 뺀다) */
export const VISIT_CAMPUSES: [string, string][] = [['premium', 'Premium'], ['challenger', 'Challenger']];
export const visitCampusName = (id?: string | null) => VISIT_CAMPUSES.find(([k]) => k === id)?.[1] ?? (id || '-');

export interface VisitRequest {
  id: number;
  member_id: string;
  campus: string | null;
  visit_date: string;
  visit_date2: string | null;
  visit_time: string | null;
  people: number;
  purposes: string[] | null;
  pickup: string | null;
  purpose: string | null; // 요청사항(예전 '방문 목적' 글)
  status: VisitStatus;
  schedule_date: string | null;
  schedule_time: string | null;
  staff_note: string | null; // 에이전시에 보이는 안내
  decision_reason: string | null; // 반려·취소 사유(에이전시에 보임)
  created_at: string;
  updated_at: string | null;
}

export interface VisitEvent {
  id: number;
  request_id: number;
  kind: 'status' | 'memo';
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor: string | null;
  created_at: string;
}
