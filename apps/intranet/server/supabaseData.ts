/**
 * 인트라넷 배포 서버(Workers)의 로그인 확인과 학생·연수 데이터.
 * - 계정: 토큰의 사용자 id 로 staff_users(직원) 또는 guard_accounts(출입구 가드 공용 계정)의 본인 행을 그 토큰으로 읽는다.
 *   직원 이름은 처리자로, 직원 역할(user_roles: 관리자·오피스, 캠퍼스)은 권한 확인에, 가드는 출입구(캠퍼스)로 쓴다.
 * - 학생·연수: 업체 원본(legacy_*, 직원만 읽기)을 읽어 관리자 core 의 createDb 에 넣는다. 인트라넷이 쓰는 것만 읽는다(메타, 학생, 연수, 기숙사 배정).
 *   직원 요청은 직원 토큰으로(관리자 앱 functions/api 와 같은 방식), 가드 요청은 가드가 원본을 못 읽으므로 서비스 키로 읽는다.
 *   가드에게는 가드 API(재학 여부·이름·캠퍼스)로만 내보낸다(worker/index.ts 가 가드 경로만 연다).
 * 정규화 테이블(HANDOFF 6-3)로 옮기면 이 파일만 바꾼다.
 */
import { createDb, type Raw } from '../../admin/server/core';
import { tokenSubject, type SupabaseConf } from '../../student/server/supabaseAuth';
import type { StaffRole } from './core';

type Db = ReturnType<typeof createDb>;
export type Account =
  | { role: 'staff'; userId: string; name: string; staffRole: StaffRole; campuses: string[] | null }
  | { role: 'guard'; userId: string; campus: string; label: string }
  | { role: 'manager'; userId: string; name: string; campuses: string[] | null };

const PAGE = 1000;
const base = (url: string) => `${url.replace(/\/+$/, '')}/rest/v1`;
export const userHeaders = (conf: SupabaseConf, token: string): Record<string, string> => ({ apikey: conf.key, Authorization: `Bearer ${token}` });
// 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다(scripts/upload-to-supabase.mjs 와 같음).
export const serviceHeaders = (serviceKey: string): Record<string, string> => ({ apikey: serviceKey, ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}) });

async function firstRow<T>(conf: SupabaseConf, token: string, path: string, fetchFn: typeof fetch): Promise<T | null | 'denied'> {
  const r = await fetchFn(`${base(conf.url)}/${path}`, { headers: userHeaders(conf, token) });
  if (r.status === 401 || r.status === 403) return 'denied';
  if (!r.ok) throw new Error(`supabase_${r.status}`);
  return ((await r.json()) as T[])[0] ?? null;
}

/**
 * 직원 역할(docs/roles.md): DB 의 is_admin() 과 같게, admin 역할이 있거나 office 역할이 없으면 관리자다(역할을 주기 전에는 모든 직원이 관리자).
 * 오피스의 캠퍼스는 office 역할 행의 캠퍼스(빈칸이 있으면 모든 캠퍼스). user_roles 는 본인 행을 읽을 수 있다(20261108200000_teacher_portal.sql).
 */
export function staffRoleFrom(rows: { role: string; campus: string | null }[]): { staffRole: StaffRole; campuses: string[] | null } {
  const office = rows.filter((r) => r.role === 'office');
  if (rows.some((r) => r.role === 'admin') || !office.length) return { staffRole: 'admin', campuses: null };
  return { staffRole: 'office', campuses: office.some((r) => !r.campus) ? null : [...new Set(office.map((r) => r.campus!))].sort() };
}

/** 직원이면 이름·역할, 가드면 출입구, 강사 포털 매니저면 이름·캠퍼스. 모두 아니면 null(토큰 만료·위조, 학생·에이전시·강사 계정). */
export async function accountFromToken(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch): Promise<Account | null> {
  const sub = tokenSubject(token);
  if (!sub) return null;
  const staff = await firstRow<{ name: string | null }>(conf, token, `staff_users?select=name&user_id=eq.${sub}`, fetchFn);
  if (staff === 'denied') return null;
  const roles = async () => {
    const r = await fetchFn(`${base(conf.url)}/user_roles?select=role,campus&user_id=eq.${sub}`, { headers: userHeaders(conf, token) });
    if (!r.ok) throw new Error(`supabase_${r.status}`);
    return (await r.json()) as { role: string; campus: string | null }[];
  };
  if (staff) return { role: 'staff', userId: sub, name: staff.name?.trim() || sub, ...staffRoleFrom(await roles()) };
  const guard = await firstRow<{ campus: string; label: string }>(conf, token, `guard_accounts?select=campus,label&user_id=eq.${sub}`, fetchFn);
  if (guard && guard !== 'denied') return { role: 'guard', userId: sub, campus: guard.campus, label: guard.label };
  // 강사 포털 매니저(직원 아님): 인트라넷 일부를 쓴다(docs/roles.md). 이름은 강사 목록 이름(current_lms_name)
  const managerCampuses = managerFrom(await roles());
  if (managerCampuses === false) return null;
  const n = await fetchFn(`${base(conf.url)}/rpc/current_lms_name`, { method: 'POST', headers: { ...userHeaders(conf, token), 'Content-Type': 'application/json' }, body: '{}' });
  const name = n.ok ? String((await n.json()) ?? '').trim() : '';
  return { role: 'manager', userId: sub, name: name || sub, campuses: managerCampuses };
}

/** 매니저 역할의 캠퍼스(null = 모든 캠퍼스), 매니저가 아니면 false */
export function managerFrom(rows: { role: string; campus: string | null }[]): string[] | null | false {
  const m = rows.filter((r) => r.role === 'manager');
  if (!m.length) return false;
  return m.some((r) => !r.campus) ? null : [...new Set(m.map((r) => r.campus!))].sort();
}

async function readAll(url: string, headers: Record<string, string>, table: string, fetchFn: typeof fetch): Promise<Raw[]> {
  const out: Raw[] = [];
  for (;;) {
    const r = await fetchFn(`${base(url)}/${table}?select=data&order=id&limit=${PAGE}&offset=${out.length}`, { headers });
    if (!r.ok) throw new Error(`legacy_${r.status}`);
    const rows = (await r.json()) as { data: Raw }[];
    for (const x of rows) out.push(x.data);
    if (rows.length < PAGE) return out;
  }
}

/** headers: 직원 토큰(userHeaders) 또는 서비스 키(serviceHeaders) */
export async function loadDb(url: string, headers: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<Db> {
  const [meta, students, enrollments, dorms] = await Promise.all([
    readAll(url, headers, 'legacy_meta', fetchFn),
    readAll(url, headers, 'legacy_students', fetchFn),
    readAll(url, headers, 'legacy_enrollments', fetchFn),
    readAll(url, headers, 'legacy_dorm_assignments', fetchFn),
  ]);
  return createDb({ meta: meta[0] ?? { counts: {}, extracted_at: null }, students, enrollments, dorms, invoices: [], agencies: [], agents: [] });
}

/**
 * 같은 Worker 인스턴스 안에서 잠깐 기억한다: 계정 확인 30초(토큰별), 학생·연수 60초(누가 읽어도 같은 원본).
 * 학생·연수는 계정 확인을 마친 요청에서만 읽고, 내보내는 범위는 경로가 정한다.
 */
export function accountCaches(conf: SupabaseConf, fetchFn: typeof fetch = fetch) {
  const tokens = new Map<string, { at: number; account: Account | null }>();
  let data: { at: number; db: Promise<Db> } | null = null;
  return {
    async account(token: string, now = Date.now()) {
      const hit = tokens.get(token);
      if (hit && now - hit.at < 30_000) return hit.account;
      const account = await accountFromToken(conf, token, fetchFn);
      for (const [k, v] of tokens) if (now - v.at >= 30_000) tokens.delete(k);
      tokens.set(token, { at: now, account });
      return account;
    },
    db(headers: Record<string, string>, now = Date.now()) {
      if (!data || now - data.at >= 60_000) {
        const db = loadDb(conf.url, headers, fetchFn);
        data = { at: now, db };
        db.catch(() => {
          if (data?.db === db) data = null; // 실패는 기억하지 않는다
        });
      }
      return data.db;
    },
  };
}
