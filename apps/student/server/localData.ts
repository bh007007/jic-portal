/**
 * 로컬 개발용 학생 앱 서버: Vite 개발 서버의 /api/* 를 처리한다.
 * - 학생·연수 데이터는 관리자 앱과 같은 파일(data/tables 또는 data-sample/tables)을 관리자 앱의 loadDir 로 읽는다.
 * - 결석·외박 신청은 storeDir(저장소 루트 .local-db/student, Git 제외)의 NDJSON 파일에 쓴다. 인트라넷도 같은 파일을 쓴다.
 *   샘플 데이터와 실제 추출본을 섞지 않도록 데이터 종류별로 파일을 나눈다.
 * - 로그인한 학생은 X-Student-Id 헤더로 구분한다. 이 PC(127.0.0.1)에서만 열리는 개발 서버 전용이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { loadDir } from '../../admin/server/localData';
import { handleStudentApi } from './core';
import type { Departure, Ride } from './departures';
import type { Absence, Overnight, RequestStore } from './requests';

/**
 * 신청 파일 하나(결석 또는 외박). 인트라넷 개발 서버도 같은 파일을 열어 승인·반려한다.
 * 손으로 승인·반려를 바꿔 볼 수 있도록 읽을 때마다 파일을 다시 읽는다(건수가 적은 로컬 전용).
 */
export function fileStore<T extends { id: string; stId: string }>(file: string): RequestStore<T> {
  const readAll = (): T[] => {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as T);
  };
  const writeAll = (rows: T[]) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    fs.renameSync(tmp, file);
  };
  return {
    async listAll() {
      return readAll();
    },
    async listByStudent(stId) {
      return readAll().filter((r) => r.stId === stId);
    },
    async get(id) {
      return readAll().find((r) => r.id === id) ?? null;
    },
    async put(x) {
      const rows = readAll();
      const i = rows.findIndex((r) => r.id === x.id);
      if (i >= 0) rows[i] = x;
      else rows.push(x);
      writeAll(rows);
    },
  };
}

/** 학생 앱·인트라넷이 같이 쓰는 신청 파일 위치. source 는 'sample' 또는 'extract'. */
export function requestFiles(storeDir: string, source: string) {
  return {
    absences: path.join(storeDir, `absences-${source}.ndjson`),
    overnights: path.join(storeDir, `overnights-${source}.ndjson`),
    departures: path.join(storeDir, `departures-${source}.ndjson`),
    rides: path.join(storeDir, `rides-${source}.ndjson`),
  };
}

const BODY_LIMIT = 16 * 1024;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= BODY_LIMIT) chunks.push(c);
    });
    req.on('end', () => {
      if (size > BODY_LIMIT) {
        reject(new Error('body_too_large'));
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : null);
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

export function studentLocalPlugin(dataDir: string, storeDir: string): Plugin {
  return {
    name: 'jic-student-local',
    configureServer(server) {
      const db = loadDir(dataDir);
      const source = db.meta().source;
      const files = requestFiles(storeDir, source);
      const store = fileStore<Absence>(files.absences);
      const overnights = fileStore<Overnight>(files.overnights);
      const departures = fileStore<Departure>(files.departures);
      const rides = fileStore<Ride>(files.rides);
      server.config.logger.info(`[student-local] ${db.summary()} · 기준일 ${db.refDate} · 신청 파일 ${storeDir}`);

      server.middlewares.use('/api', async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const method = req.method ?? 'GET';
        let body: unknown = null;
        if (method === 'POST' || method === 'PUT') {
          try {
            body = await readJson(req);
          } catch (e) {
            const code = (e as Error).message;
            send(code === 'body_too_large' ? 413 : 400, { error: code });
            return;
          }
        }
        const url = new URL(req.url ?? '/', 'http://local');
        const header = req.headers['x-student-id'];
        const stId = typeof header === 'string' && /^\d+$/.test(header) ? header : null;
        const { status, body: out } = await handleStudentApi(
          { db, store, overnights, departures, rides, stId, localLogin: true, now: () => new Date(), newId: () => crypto.randomUUID() },
          method,
          url.pathname,
          body,
        );
        send(status, out);
      });
    },
  };
}
