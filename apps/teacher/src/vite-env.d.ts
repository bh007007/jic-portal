/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 상단 '포털 홈' 주소. 없으면 배포는 '/', 로컬은 관리자 앱 개발 서버 */
  readonly VITE_PORTAL_HOME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
