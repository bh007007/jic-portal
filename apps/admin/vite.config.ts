import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localDataPlugin } from './server/localData';

const here = path.dirname(fileURLToPath(import.meta.url));

// 지금 단계에서는 하드디스크의 data/tables 를 읽는 로컬 API를 개발 서버에 붙인다.
// 서버는 이 PC(127.0.0.1)에서만 열리고, 데이터는 밖으로 나가지 않는다.
export default defineConfig({
  plugins: [react(), localDataPlugin(path.resolve(here, '../../data/tables'))],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1' },
});
