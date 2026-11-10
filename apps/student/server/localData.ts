/**
 * 로컬 개발용 학생 앱 서버: Vite 개발 서버의 /api/* 를 처리한다.
 * - 학생·연수 데이터는 관리자 앱과 같은 파일(data/tables 또는 data-sample/tables)을 관리자 앱의 loadDir 로 읽는다.
 * - 결석·외박 신청은 storeDir(저장소 루트 .local-db/student, Git 제외)의 NDJSON 파일에 쓴다. 인트라넷도 같은 파일을 쓴다.
 *   샘플 데이터와 실제 추출본을 섞지 않도록 데이터 종류별로 파일을 나눈다.
 * - 로그인한 학생은 X-Student-Id 헤더로 구분한다. 이 PC(127.0.0.1)에서만 열리는 개발 서버 전용이다.
 *   .env.local 에 Supabase 주소가 있으면 대신 Supabase 학생 계정 토큰으로 구분한다(studentLocalPlugin).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { loadDir } from '../../admin/server/localData';
import { handleStudentApi } from './core';
import type { Departure, Ride } from './departures';
import type { LifeRequest } from './lifeRequests';
import type { Absence, Overnight, RequestStore } from './requests';
import { promotions, waitingPosition, withTaken, type Trip, type TripSignup, type TripStore } from './trips';
import type { KeycardSecret } from './keycard';
import type { ClassMark, TimetableSource } from './timetable';
import { tokenCache, type SupabaseConf } from './supabaseAuth';
import { IMAGE_BODY_LIMIT, type FileStore } from './files';

function readRows<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}
function writeRows<T>(file: string, rows: T[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function putRow<T extends { id: string }>(file: string, x: T) {
  const rows = readRows<T>(file);
  const i = rows.findIndex((r) => r.id === x.id);
  if (i >= 0) rows[i] = x;
  else rows.push(x);
  writeRows(file, rows);
}

/**
 * 신청 파일 하나(결석 또는 외박). 인트라넷 개발 서버도 같은 파일을 열어 승인·반려한다.
 * 손으로 승인·반려를 바꿔 볼 수 있도록 읽을 때마다 파일을 다시 읽는다(건수가 적은 로컬 전용).
 */
export function fileStore<T extends { id: string; stId: string }>(file: string): RequestStore<T> {
  return {
    async listAll() {
      return readRows<T>(file);
    },
    async listByStudent(stId) {
      return readRows<T>(file).filter((r) => r.stId === stId);
    },
    async get(id) {
      return readRows<T>(file).find((r) => r.id === id) ?? null;
    },
    async put(x) {
      putRow(file, x);
    },
  };
}

/** 학교 여행과 참가 신청 파일(학생 앱·인트라넷이 같이 씀). 참가 신청 수(taken)는 저장하지 않고 읽을 때 센다. */
export function tripFileStore(tripsFile: string, signupsFile: string): TripStore {
  const trips = () => withTaken(readRows<Trip>(tripsFile), readRows<TripSignup>(signupsFile));
  // 참가 신청이 빠지거나 정원이 늘면 대기자를 순서대로 참가로(11/10 결정 I12, 배포는 DB 함수 trip_promote)
  const promote = (tripId: string) => {
    const t = readRows<Trip>(tripsFile).find((x) => x.id === tripId);
    if (t) for (const p of promotions(t, readRows<TripSignup>(signupsFile), new Date().toISOString())) putRow(signupsFile, p);
  };
  return {
    listTrips: async () => trips(),
    getTrip: async (id) => trips().find((t) => t.id === id) ?? null,
    async putTrip(t) {
      const { taken: _taken, ...row } = t;
      putRow(tripsFile, row);
      promote(t.id);
    },
    listSignups: async (tripId) => readRows<TripSignup>(signupsFile).filter((s) => !tripId || s.tripId === tripId),
    signupsByStudent: async (stId) => readRows<TripSignup>(signupsFile).filter((s) => s.stId === stId),
    getSignup: async (id) => readRows<TripSignup>(signupsFile).find((s) => s.id === id) ?? null,
    async putSignup(s) {
      putRow(signupsFile, s);
      promote(s.tripId);
    },
    waitingNo: async (s) => waitingPosition(readRows<TripSignup>(signupsFile), s),
  };
}

/**
 * 카드키 QR 비밀 값(로컬): 처음 쓸 때 만들어 파일로 둔다. 학생 앱(만들기)과 인트라넷(확인)이 같은 파일을 읽는다.
 * 배포는 Supabase keycard_secret(keycard.ts serviceKeycardSecret).
 */
export function localKeycardSecret(file: string): KeycardSecret {
  return async () => {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, crypto.randomBytes(32).toString('hex') + '\n', { encoding: 'utf8', mode: 0o600 });
    }
    return fs.readFileSync(file, 'utf8').trim();
  };
}

/** 시간표(강사 포털 수업·출석) 파일. 한 줄 = 학생 한 명의 수업 한 건: {"stId", ...ClassMark}. 파일이 없으면 수업 없음. 읽기만 한다. */
export function fileTimetable(file: string): TimetableSource {
  return {
    async classes(stId, from, to) {
      if (!fs.existsSync(file)) return [];
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as ClassMark & { stId: string })
        .filter((m) => m.stId === stId && m.day >= from && m.day <= to)
        .map(({ stId: _s, ...m }) => m);
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
    life: path.join(storeDir, `life-requests-${source}.ndjson`),
    trips: path.join(storeDir, `trips-${source}.ndjson`),
    tripSignups: path.join(storeDir, `trip-signups-${source}.ndjson`),
    keycardSecret: path.join(storeDir, 'keycard-secret.txt'),
    timetable: path.join(storeDir, `timetable-${source}.ndjson`), // 강사 포털 수업·출석(읽기만, 로컬에는 강사 포털이 없어 넣었을 때만)
    absenceDocs: path.join(storeDir, `absence-docs-${source}`), // 진단서 사진 폴더(11/10 결정 I10, 인트라넷도 읽음)
  };
}

/** 사진 파일 폴더(로컬). 경로는 '<폴더>/<파일>', 종류는 확장자로 안다. 배포는 files.ts supabaseFiles */
export function localFiles(dir: string): FileStore {
  const TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const full = (p: string) => {
    if (!/^[\w-]+\/[\w.-]+$/.test(p) || p.includes('..')) throw new Error('invalid_path');
    return path.join(dir, p);
  };
  return {
    async put(p, f) {
      fs.mkdirSync(path.dirname(full(p)), { recursive: true });
      fs.writeFileSync(full(p), f.bytes);
    },
    async get(p) {
      const file = full(p);
      if (!fs.existsSync(file)) return null;
      return { bytes: new Uint8Array(fs.readFileSync(file)), contentType: TYPE[path.extname(file).slice(1)] ?? 'application/octet-stream' };
    },
  };
}

const BODY_LIMIT = 16 * 1024;

/** limit: 사진을 받는 경로(진단서·학생 사진)는 IMAGE_BODY_LIMIT, 나머지는 BODY_LIMIT */
export function readJson(req: IncomingMessage, limit = BODY_LIMIT): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => {
      if (size > limit) {
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

/**
 * supabase 를 주면(.env.local 의 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY) 로그인은 Supabase 학생 계정 토큰으로 확인하고
 * 데이터는 그대로 이 PC 파일을 쓴다(배포 전 로그인 시험용). 없으면 학생번호 + 생년월일 로컬 로그인.
 */
export function studentLocalPlugin(dataDir: string, storeDir: string, supabase?: SupabaseConf): Plugin {
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
      const life = fileStore<LifeRequest>(files.life);
      const trips = tripFileStore(files.trips, files.tripSignups);
      const keycardSecret = localKeycardSecret(files.keycardSecret);
      const timetable = fileTimetable(files.timetable);
      const absenceDocs = localFiles(files.absenceDocs);
      const tokens = supabase ? tokenCache(supabase) : null;
      server.config.logger.info(`[student-local] ${db.summary()} · 기준일 ${db.refDate} · 신청 파일 ${storeDir}${supabase ? ` · 로그인 Supabase(${supabase.url})` : ''}`);

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
            body = await readJson(req, /\/document$/.test(req.url ?? '') ? IMAGE_BODY_LIMIT : BODY_LIMIT);
          } catch (e) {
            const code = (e as Error).message;
            send(code === 'body_too_large' ? 413 : 400, { error: code });
            return;
          }
        }
        const url = new URL(req.url ?? '/', 'http://local');
        let stId: string | null = null;
        let mustChangePassword = false;
        if (tokens) {
          const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
          try {
            const s = token ? await tokens.resolve(token) : null;
            stId = s?.stId ?? null;
            mustChangePassword = s?.mustChangePassword ?? false;
          } catch {
            send(502, { error: 'network' });
            return;
          }
        } else {
          const header = req.headers['x-student-id'];
          stId = typeof header === 'string' && /^\d+$/.test(header) ? header : null;
        }
        const { status, body: out } = await handleStudentApi(
          { db, store, overnights, departures, rides, life, trips, timetable, keycardSecret, absenceDocs, stId, mustChangePassword, localLogin: !tokens, now: () => new Date(), newId: () => crypto.randomUUID() },
          method,
          url.pathname,
          body,
        );
        send(status, out);
      });
    },
  };
}
