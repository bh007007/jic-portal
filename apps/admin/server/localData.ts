/**
 * 로컬 개발용 데이터 소스: 하드디스크의 *.ndjson 을 읽어 Vite 개발 서버의 /api/* 로 제공한다.
 * 배포 환경에서는 저장소 루트의 functions/api/[[path]].ts 가 같은 core 를 Supabase 데이터로 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createDb, handleApi, type Raw } from './core';

function readNdjson(file: string): Raw[] {
  if (!fs.existsSync(file)) return [];
  const rows: Raw[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

export function loadDir(dataDir: string) {
  const metaFile = path.join(dataDir, 'meta.json');
  return createDb({
    meta: fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : { counts: {}, extracted_at: null },
    enrollments: readNdjson(path.join(dataDir, 'enrollments.ndjson')),
    students: readNdjson(path.join(dataDir, 'students.ndjson')),
    invoices: readNdjson(path.join(dataDir, 'invoices.ndjson')),
    dorms: readNdjson(path.join(dataDir, 'dorm_assignments.ndjson')),
    agencies: readNdjson(path.join(dataDir, 'agencies.ndjson')),
    agents: readNdjson(path.join(dataDir, 'agents.ndjson')),
  });
}

export function localDataPlugin(dataDir: string): Plugin {
  return {
    name: 'jic-local-data',
    configureServer(server) {
      const started = Date.now();
      const db = loadDir(dataDir);
      server.config.logger.info(`[local-data] ${db.summary()} · 기준일 ${db.refDate} (${Date.now() - started}ms)`);

      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', 'http://local');
        const { status, body } = handleApi(db, url.pathname, url.searchParams);
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(body));
      });
    },
  };
}
