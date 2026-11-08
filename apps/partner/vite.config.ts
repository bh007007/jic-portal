import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 파트너 포털. 데이터는 전부 Supabase(공용 DB)에 있다. apps/partner/.env.local 에 주소와 공개 키를 넣고 실행한다.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  preview: { host: '127.0.0.1' },
});
