/**
 * 이 앱이 열리는 경로. 로컬 개발은 '/', 배포는 JIC 포털(관리자 앱) 주소 아래 '/intranet/'(npm run portal:build).
 * 포털 안에서는 API 도 '/intranet/api/*'(Pages Function functions/intranet/api)로 부른다. 관리자 앱의 '/api/*'와 겹치지 않게.
 */
export const BASE = import.meta.env.BASE_URL; // '/' 또는 '/intranet/'
export const inPortal = BASE !== '/';
/** '/api/...' → 포털 안이면 '/intranet/api/...' */
export const apiUrl = (path: string) => (inPortal ? BASE.replace(/\/$/, '') + path : path);
/** 관리자 앱 주소(끝에 / 없음): 포털 안이면 같은 주소(''), 로컬은 VITE_ADMIN_URL 또는 관리자 앱 개발 서버 */
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL ?? (inPortal ? '' : 'http://127.0.0.1:5173')).replace(/\/+$/, '');
/** 관리자 앱 첫 화면('통합관리' 버튼) */
export const ADMIN_HOME = ADMIN_URL || '/';
