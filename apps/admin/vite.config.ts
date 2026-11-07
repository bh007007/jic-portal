import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localDataPlugin } from './server/localData';

const here = path.dirname(fileURLToPath(import.meta.url));

// 데이터 위치: JIC_DATA_DIR 환경변수 → data/tables(실제 추출본, Git 제외) → data-sample/tables(가짜 샘플) 순서.
// 서버는 이 PC(127.0.0.1)에서만 열리고, 데이터는 밖으로 나가지 않는다.
const realDir = path.resolve(here, '../../data/tables');
const sampleDir = path.resolve(here, '../../data-sample/tables');
const dataDir = process.env.JIC_DATA_DIR
  ? path.resolve(process.env.JIC_DATA_DIR)
  : fs.existsSync(path.join(realDir, 'enrollments.ndjson'))
    ? realDir
    : sampleDir;

export default defineConfig({
  plugins: [react(), localDataPlugin(dataDir)],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1' },
});
