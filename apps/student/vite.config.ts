import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { studentLocalPlugin } from './server/localData';

const here = path.dirname(fileURLToPath(import.meta.url));

// 데이터 위치는 관리자 앱과 같다: JIC_DATA_DIR → data/tables(실제 추출본, Git 제외) → data-sample/tables(가짜 샘플).
// 결석 신청은 저장소 루트 .local-db/(Git 제외)에 파일로 남긴다. 서버는 이 PC(127.0.0.1)에서만 열린다.
const realDir = path.resolve(here, '../../data/tables');
const sampleDir = path.resolve(here, '../../data-sample/tables');
const pickDataDir = (supabaseLogin: boolean) =>
  process.env.JIC_DATA_DIR
    ? path.resolve(process.env.JIC_DATA_DIR)
    : // Supabase 로그인 시험은 테스트 프로젝트(샘플 학생 계정만)와 맞추려고 샘플 데이터로 고정한다.
      !supabaseLogin && fs.existsSync(path.join(realDir, 'enrollments.ndjson'))
      ? realDir
      : sampleDir;
const storeDir = path.resolve(here, '../../.local-db/student');

// apps/student/.env.local 에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 가 있으면 로그인만 Supabase 학생 계정으로 시험한다
// (데이터는 샘플 파일, docs/student-app.md "학생 계정과 로그인"). 없으면 학생번호 + 생년월일 로컬 로그인.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, 'VITE_');
  const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY } : undefined;
  return {
    plugins: [react(), studentLocalPlugin(pickDataDir(!!supabase), storeDir, supabase)],
    server: { host: '127.0.0.1', port: 5176, strictPort: true },
    preview: { host: '127.0.0.1', port: 5176 },
  };
});
