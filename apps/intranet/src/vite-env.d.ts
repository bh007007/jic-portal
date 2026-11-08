/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 상단 '통합관리' 링크. 없으면 로컬 관리자 앱(http://127.0.0.1:5173) */
  readonly VITE_ADMIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
