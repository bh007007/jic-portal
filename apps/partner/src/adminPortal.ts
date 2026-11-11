// 관리자 포털 주소(배포는 JIC 포털 Pages 의 /admin/, 로컬은 관리자 앱 개발 서버). 도메인을 바꾸면 VITE_ADMIN_PORTAL_URL 로 덮어쓴다.
// 에이전시 포털의 관리자 화면은 11/10 모두 관리자 포털 '파트너 포털 관리' 메뉴로 옮겼다(docs/leo-todo.md D-4, 11/11 메뉴 7개 CL-045).
const ADMIN_PORTAL =
  (import.meta.env.VITE_ADMIN_PORTAL_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/admin/' : 'https://jic-portal-916.pages.dev/admin/');

/** 관리자 포털 '파트너 포털 관리' 메뉴(CL-045): accounts 지점 계정 | consult 상담 설정 | content 화면 콘텐츠 | media 사진·영상 | notices 공지·일정 | visits 방문 신청 | stats 통계·설정 */
export type AdminMenu = 'accounts' | 'consult' | 'content' | 'media' | 'notices' | 'visits' | 'stats';
export const adminUrl = (menu: AdminMenu = 'accounts', tab = '') => `${ADMIN_PORTAL.replace(/\/?$/, '/')}partner/${menu}${tab ? `?tab=${tab}` : ''}`;
