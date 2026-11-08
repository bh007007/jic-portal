/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 상단 '인트라넷' 링크. 없으면 배포는 같은 주소의 /intranet/, 로컬 개발은 http://127.0.0.1:5177 */
  readonly VITE_INTRANET_URL?: string;
  /** JIC 포털 첫 화면(/)의 학생·에이전시·강사 포털 주소. 없으면 지금 배포 주소(로컬은 각 개발 서버), 강사 포털은 '준비 중' */
  readonly VITE_STUDENT_URL?: string;
  readonly VITE_PARTNER_URL?: string;
  readonly VITE_TEACHER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
