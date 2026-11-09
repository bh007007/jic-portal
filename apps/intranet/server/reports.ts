/**
 * 가드 리포트(사건 리포트). 업체 포털의 eni, 기획안 '생활' 그룹의 incident_reports.
 * 가드 태블릿에서 등록하면 패널티 승인 대기 후보가 바로 생긴다(core.ts guardReport).
 */

/** 업체 포털의 사건 종류(기획안 '기존 포털 분석' 경비 행): 음주, 폭력, 무단외출, 기타 */
export const REPORT_KINDS = ['alcohol', 'violence', 'unauthorized', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_LABEL: Record<ReportKind, string> = { alcohol: '음주', violence: '폭력', unauthorized: '무단외출', other: '기타' };
/** 패널티 점수표의 위반 종류로: 리포트 종류와 같은 이름(11/10 결정 I7로 폭력·무단외출을 점수표에 따로 뒀다). */
export const PENALTY_KIND_OF: Record<ReportKind, string> = { alcohol: 'alcohol', violence: 'violence', unauthorized: 'unauthorized', other: 'other' };
export const REPORT_NOTE_MAX = 500;

export interface IncidentReport {
  id: string;
  stId: string;
  trId: string;
  campus: string; // 등록한 출입구의 캠퍼스
  kind: ReportKind;
  note: string;
  occurredAt: string; // ISO
  reportedBy: string; // 근무자
  createdAt: string;
}
