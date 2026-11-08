/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 상단 '인트라넷' 링크. 없으면 배포는 같은 주소의 /intranet/, 로컬 개발은 http://127.0.0.1:5177 */
  readonly VITE_INTRANET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
