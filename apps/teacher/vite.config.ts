import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 강사 포털(LMS). 데이터는 전부 Supabase(공용 DB)에 있고 권한은 RLS 가 막는다(supabase/migrations/20261108200000_teacher_portal.sql).
// 로컬: apps/teacher/.env.local 에 주소와 공개 키를 넣고 npm run teacher. 배포: JIC 포털 주소 아래 /teacher/ (npm run teacher:portal).
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  preview: { host: '127.0.0.1' },
});
