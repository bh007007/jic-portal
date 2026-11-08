/**
 * 인트라넷 배포 서버(Workers)의 로그인 확인과 학생·연수 데이터.
 * - 직원: 토큰의 사용자 id 로 staff_users 의 본인 행을 그 토큰으로 읽는다(읽히면 직원, 이름은 처리자로 쓴다).
 * - 학생·연수: 직원 토큰으로 업체 원본(legacy_*, 직원만 읽기)을 읽어 관리자 core 의 createDb 에 넣는다(관리자 앱 functions/api 와 같은 방식).
 *   인트라넷이 쓰는 것만 읽는다: 메타, 학생, 연수, 기숙사 배정. 정규화 테이블(HANDOFF 6-3)로 옮기면 이 파일만 바꾼다.
 * 가드 공용 계정은 다음 단계(docs/intranet.md '배포').
 */
import { createDb, type Raw } from '../../admin/server/core';
import { tokenSubject, type SupabaseConf } from '../../student/server/supabaseAuth';

type Db = ReturnType<typeof createDb>;
export interface Staff {
  userId: string;
  name: string;
}

const PAGE = 1000;
const headers = (conf: SupabaseConf, token: string) => ({ apikey: conf.key, Authorization: `Bearer ${token}` });
const base = (conf: SupabaseConf) => `${conf.url.replace(/\/+$/, '')}/rest/v1`;

/** 직원이면 사용자 id 와 이름, 아니면 null(토큰 만료·위조, 직원이 아닌 계정). */
export async function staffFromToken(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch): Promise<Staff | null> {
  const sub = tokenSubject(token);
  if (!sub) return null;
  const r = await fetchFn(`${base(conf)}/staff_users?select=name&user_id=eq.${sub}`, { headers: headers(conf, token) });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`supabase_${r.status}`);
  const row = ((await r.json()) as { name: string | null }[])[0];
  return row ? { userId: sub, name: row.name?.trim() || sub } : null;
}

async function readAll(conf: SupabaseConf, token: string, table: string, fetchFn: typeof fetch): Promise<Raw[]> {
  const out: Raw[] = [];
  for (;;) {
    const r = await fetchFn(`${base(conf)}/${table}?select=data&order=id&limit=${PAGE}&offset=${out.length}`, { headers: headers(conf, token) });
    if (!r.ok) throw new Error(`legacy_${r.status}`);
    const rows = (await r.json()) as { data: Raw }[];
    for (const x of rows) out.push(x.data);
    if (rows.length < PAGE) return out;
  }
}

export async function loadDb(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch): Promise<Db> {
  const [meta, students, enrollments, dorms] = await Promise.all([
    readAll(conf, token, 'legacy_meta', fetchFn),
    readAll(conf, token, 'legacy_students', fetchFn),
    readAll(conf, token, 'legacy_enrollments', fetchFn),
    readAll(conf, token, 'legacy_dorm_assignments', fetchFn),
  ]);
  return createDb({ meta: meta[0] ?? { counts: {}, extracted_at: null }, students, enrollments, dorms, invoices: [], agencies: [], agents: [] });
}

/**
 * 같은 Worker 인스턴스 안에서 잠깐 기억한다: 토큰 확인 30초(토큰별), 학생·연수 60초(직원이면 모두 같은 데이터).
 * 학생·연수는 직원 확인을 마친 요청에서만 읽고 내보낸다.
 */
export function staffCaches(conf: SupabaseConf, fetchFn: typeof fetch = fetch) {
  const tokens = new Map<string, { at: number; staff: Staff | null }>();
  let data: { at: number; db: Promise<Db> } | null = null;
  return {
    async staff(token: string, now = Date.now()) {
      const hit = tokens.get(token);
      if (hit && now - hit.at < 30_000) return hit.staff;
      const staff = await staffFromToken(conf, token, fetchFn);
      for (const [k, v] of tokens) if (now - v.at >= 30_000) tokens.delete(k);
      tokens.set(token, { at: now, staff });
      return staff;
    },
    db(token: string, now = Date.now()) {
      if (!data || now - data.at >= 60_000) {
        const db = loadDb(conf, token, fetchFn);
        data = { at: now, db };
        db.catch(() => {
          if (data?.db === db) data = null; // 실패는 기억하지 않는다
        });
      }
      return data.db;
    },
  };
}
