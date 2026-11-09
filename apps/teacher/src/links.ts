import type { Me } from './auth';

// 다른 포털로 가는 주소. 배포는 같은 Pages 주소 아래(첫 화면 '/', 인트라넷 '/intranet/'), 로컬은 각 개발 서버(docs/collab.md 포트).
export const PORTAL_HOME = import.meta.env.VITE_PORTAL_HOME ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/' : '/');
const INTRANET = import.meta.env.VITE_INTRANET_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5177/' : '/intranet/');

/** 인트라넷 화면 주소(path 는 인트라넷 라우트, 예: 'requests/absences') */
export const intranetUrl = (path: string) => INTRANET.replace(/\/?$/, '/') + path.replace(/^\//, '');

/**
 * 인트라넷에서 결석 신청 처리·무단결석 패널티 승인을 할 수 있는 사람: 직원(관리자·오피스)과 강사 포털 매니저.
 * 인트라넷 역할 2단계 B(#64, 20261109100000_intranet_manager.sql)와 같은 범위. 강사·체커·스케줄러에게는 링크를 숨긴다.
 */
export const canUseIntranet = (me: Me | null) => !!me && (me.isManager || me.roles.includes('staff'));
