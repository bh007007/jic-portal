// 관리자 포털 주소(배포는 JIC 포털 Pages 의 /admin/, 로컬은 관리자 앱 개발 서버). 도메인을 바꾸면 VITE_ADMIN_PORTAL_URL 로 덮어쓴다.
// 에이전시 포털의 관리자 화면은 11/10 모두 관리자 포털 '파트너 포털 관리' 메뉴로 옮겼다(docs/leo-todo.md D-4, 메뉴 그룹 CL-025).
const ADMIN_PORTAL =
  (import.meta.env.VITE_ADMIN_PORTAL_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/admin/' : 'https://jic-portal-916.pages.dev/admin/');

/** page: 'agency-portal'(가입 승인·지점 계정·방문 신청·사용 통계) | 'agency-content'(추천 규칙·콘텐츠·자료실·공지·설정) */
export const adminUrl = (page: 'agency-portal' | 'agency-content', tab = '') => `${ADMIN_PORTAL.replace(/\/?$/, '/')}${page}${tab ? `?tab=${tab}` : ''}`;
