import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { studentLocalPlugin } from './server/localData';

const here = path.dirname(fileURLToPath(import.meta.url));

// 데이터 위치는 관리자 앱과 같다: JIC_DATA_DIR → data/tables(실제 추출본, Git 제외) → data-sample/tables(가짜 샘플).
// 결석 신청은 저장소 루트 .local-db/(Git 제외)에 파일로 남긴다. 서버는 이 PC(127.0.0.1)에서만 열린다.
const realDir = path.resolve(here, '../../data/tables');
const sampleDir = path.resolve(here, '../../data-sample/tables');
const dataDir = process.env.JIC_DATA_DIR
  ? path.resolve(process.env.JIC_DATA_DIR)
  : fs.existsSync(path.join(realDir, 'enrollments.ndjson'))
    ? realDir
    : sampleDir;
const storeDir = path.resolve(here, '../../.local-db/student');

export default defineConfig({
  plugins: [react(), studentLocalPlugin(dataDir, storeDir)],
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  preview: { host: '127.0.0.1', port: 5176 },
});
