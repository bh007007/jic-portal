/**
 * 로컬 개발용 데이터 소스: 하드디스크의 *.ndjson 을 읽어 Vite 개발 서버의 /api/* 로 제공한다.
 * 배포 환경에서는 저장소 루트의 functions/api/[[path]].ts 가 같은 core 를 Supabase 데이터로 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { BALANCE_COLUMNS, CHANGE_COLUMNS, createDb, EXTENSION_COLUMNS, handleApi, INVOICE_ITEM_COLUMNS, INVOICE_SUMMARY_COLUMNS, LOCAL_COST_COLUMNS, POINT_HISTORY_COLUMNS, type Raw } from './core';

const pick = (cols: string[]) => (r: Raw) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));

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
    deposits: readNdjson(path.join(dataDir, 'deposits.ndjson')),
    pointHistory: readNdjson(path.join(dataDir, 'point_history.ndjson')).map(pick(POINT_HISTORY_COLUMNS)),
    rooms: readNdjson(path.join(dataDir, 'rooms.ndjson')),
    // 인보이스 항목(portal-extract-invoice-items.js). 입금 표(inv_invoice_deposit)는 받는 계좌 열이 있어 읽지 않는다.
    invoiceItems: readNdjson(path.join(dataDir, 'inv_invoice_cost_st.ndjson')).map(pick(INVOICE_ITEM_COLUMNS)),
    invoiceAgencyItems: readNdjson(path.join(dataDir, 'inv_invoice_cost_ag.ndjson')).map(pick(INVOICE_ITEM_COLUMNS)),
    localCosts: readNdjson(path.join(dataDir, 'inv_etc.ndjson')).map(pick(LOCAL_COST_COLUMNS)),
    // 연장·변경(portal-extract-extend.js). 원본 행의 입금 은행명·연락처 같은 열은 싣지 않는다.
    extensions: readNdjson(path.join(dataDir, 'extend.ndjson')).map(pick(EXTENSION_COLUMNS)),
    courseChanges: readNdjson(path.join(dataDir, 'change_course.ndjson')).map(pick(CHANGE_COLUMNS)),
    dormChanges: readNdjson(path.join(dataDir, 'change_dorm.ndjson')).map(pick(CHANGE_COLUMNS)),
    comebacks: readNdjson(path.join(dataDir, 'change_comeback.ndjson')).map(pick(CHANGE_COLUMNS)),
    // 연수 청구 합계: 인보이스별 합계(inv_summary, 기본 + 연장)와 업체 Check Balance(balance).
    invoiceSummary: readNdjson(path.join(dataDir, 'inv_summary.ndjson')).map(pick(INVOICE_SUMMARY_COLUMNS)),
    balances: readNdjson(path.join(dataDir, 'balance.ndjson')).map(pick(BALANCE_COLUMNS)),
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
