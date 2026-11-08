/**
 * 로컬 개발용 인트라넷 서버: Vite 개발 서버의 /api/* 를 처리한다.
 * - 학생·연수는 관리자 앱과 같은 파일을 관리자 앱의 loadDir 로 읽는다.
 * - 외출·귀가 기록과 패널티는 storeDir(저장소 루트 .local-db/intranet, Git 제외)의 NDJSON 파일에 쓴다.
 *   샘플 데이터와 실제 추출본을 섞지 않도록 데이터 종류별로 파일을 나눈다. 통금·근무자·점수표 설정은 공용 JSON.
 * - 결석·외박 신청은 학생 앱의 파일(studentStoreDir, .local-db/student)을 같이 열어 승인·반려한다.
 * - 상담 기록·접근 기록은 counseling-<source>.ndjson, audit-<source>.ndjson. 실제 데이터로 실행하면 민감 정보가 들어간다.
 * - 로컬에는 로그인이 없다(관리자 앱과 같다). 상담 기록 처리자는 X-Staff-Name 헤더(브라우저에 입력한 이름). 이 PC(127.0.0.1)에서만 열린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { loadDir } from '../../admin/server/localData';
import { fileStore, requestFiles } from '../../student/server/localData';
import type { Departure } from '../../student/server/departures';
import type { Absence, Overnight } from '../../student/server/requests';
import { ACTOR_MAX } from './counseling';
import { handleIntranetApi, type DocRepo, type Repo, type Stores } from './core';

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/** 기록 파일. 손으로 고친 내용이 바로 보이도록 읽을 때마다 파일을 다시 읽는다(건수가 적은 로컬 전용). */
export function fileRepo<T extends { id: string }>(file: string): Repo<T> {
  const readAll = (): T[] =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as T)
      : [];
  const writeAll = (rows: T[]) => writeAtomic(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return {
    async all() {
      return readAll();
    },
    async put(x) {
      const rows = readAll();
      const i = rows.findIndex((r) => r.id === x.id);
      if (i >= 0) rows[i] = x;
      else rows.push(x);
      writeAll(rows);
    },
    async remove(id) {
      writeAll(readAll().filter((r) => r.id !== id));
    },
  };
}

export function fileDoc<T>(file: string): DocRepo<T> {
  return {
    async get() {
      return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null;
    },
    async set(v) {
      writeAtomic(file, JSON.stringify(v, null, 2) + '\n');
    },
  };
}

const BODY_LIMIT = 32 * 1024;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= BODY_LIMIT) chunks.push(c);
    });
    req.on('end', () => {
      if (size > BODY_LIMIT) return reject(new Error('body_too_large'));
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

export function intranetLocalPlugin(dataDir: string, storeDir: string, studentStoreDir: string): Plugin {
  return {
    name: 'jic-intranet-local',
    configureServer(server) {
      const db = loadDir(dataDir);
      const source = db.meta().source;
      const req = requestFiles(studentStoreDir, source); // 학생 앱과 같은 파일
      const stores: Stores = {
        absences: fileStore<Absence>(req.absences),
        overnights: fileStore<Overnight>(req.overnights),
        departures: fileStore<Departure>(req.departures),
        outings: fileRepo(path.join(storeDir, `outings-${source}.ndjson`)),
        penalties: fileRepo(path.join(storeDir, `penalties-${source}.ndjson`)),
        settings: fileDoc(path.join(storeDir, 'settings.json')),
        rules: fileDoc(path.join(storeDir, 'penalty-rules.json')),
        counseling: fileRepo(path.join(storeDir, `counseling-${source}.ndjson`)),
        audit: fileRepo(path.join(storeDir, `audit-${source}.ndjson`)),
        notices: fileRepo(path.join(storeDir, 'notices.ndjson')),
        noticeReads: fileRepo(path.join(storeDir, 'notice-reads.ndjson')),
        reports: fileRepo(path.join(storeDir, `reports-${source}.ndjson`)),
      };
      server.config.logger.info(`[intranet-local] ${db.summary()} · 기준일 ${db.refDate} · 저장 폴더 ${storeDir}`);

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
        // 로컬 직원 이름: 한글이 있어 화면에서 encodeURIComponent 로 보낸다. 배포에서는 로그인 정보로 바꾼다.
        let actor: string | null = null;
        const raw = req.headers['x-staff-name'];
        if (typeof raw === 'string' && raw) {
          try {
            actor = decodeURIComponent(raw).trim().slice(0, ACTOR_MAX) || null;
          } catch {
            actor = null;
          }
        }
        const { status, body: out } = await handleIntranetApi(
          { db, stores, actor, now: () => new Date(), newId: () => crypto.randomUUID() },
          method,
          url.pathname,
          url.searchParams,
          body,
        );
        send(status, out);
      });
    },
  };
}
