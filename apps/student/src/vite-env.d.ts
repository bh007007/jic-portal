/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 있으면 Supabase 학생 계정으로 로그인한다. 없으면 로컬 개발용 로그인(학생번호 + 생년월일). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 학생 계정 이메일 도메인. scripts/accounts.ts 의 STUDENT_EMAIL_DOMAIN 과 같아야 한다(기본 students.jic.internal). */
  readonly VITE_STUDENT_EMAIL_DOMAIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
