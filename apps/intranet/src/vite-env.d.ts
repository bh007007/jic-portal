/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 상단 '통합관리' 링크. 없으면 로컬 관리자 앱(http://127.0.0.1:5173) */
  readonly VITE_ADMIN_URL?: string;
  /** 있으면 Supabase 직원 계정으로 로그인한다(배포). 없으면 로그인 없이 로컬 데이터로 동작한다. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
