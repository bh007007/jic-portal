/**
 * 배포 서버(Workers)의 학생·연수 데이터: 업체 원본(legacy_*)에서 로그인한 학생의 행만 서비스 키로 읽어 관리자 core 의 createDb 에 넣는다.
 * legacy_* 의 RLS(직원만 읽기)는 넓히지 않는다(docs/collab.md). 학생 번호는 토큰으로 확인한 값만 넘긴다(supabaseAuth.ts).
 * 학생 화면에 필요한 것만 읽는다: 메타(기준일), 학생, 연수, 기숙사 배정. 인보이스·입금·포인트·에이전시는 읽지 않는다.
 * 정규화 테이블(HANDOFF 6-3)로 옮기면 이 파일만 바꾼다.
 */
import { createDb, type Raw } from '../../admin/server/core';

export interface ServiceConf {
  url: string;
  serviceKey: string;
}

type Db = ReturnType<typeof createDb>;

// 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다(scripts/upload-to-supabase.mjs 와 같음).
const serviceHeaders = (key: string): Record<string, string> => ({ apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) });

async function rows(conf: ServiceConf, path: string, fetchFn: typeof fetch): Promise<Raw[]> {
  const r = await fetchFn(`${conf.url.replace(/\/+$/, '')}/rest/v1/${path}`, { headers: serviceHeaders(conf.serviceKey) });
  if (!r.ok) throw new Error(`legacy_${r.status}`);
  return ((await r.json()) as { data: Raw }[]).map((x) => x.data);
}

const EMPTY_META: Raw = { counts: {}, extracted_at: null };
const build = (meta: Raw, students: Raw[] = [], enrollments: Raw[] = [], dorms: Raw[] = []): Db =>
  createDb({ meta, students, enrollments, dorms, invoices: [], agencies: [], agents: [] });

export async function loadMeta(conf: ServiceConf, fetchFn: typeof fetch = fetch): Promise<Raw> {
  return (await rows(conf, 'legacy_meta?select=data&id=eq.current', fetchFn))[0] ?? EMPTY_META;
}

/** 로그인 전(/api/meta): 기준일·데이터 종류만 */
export async function metaDb(conf: ServiceConf, fetchFn: typeof fetch = fetch): Promise<Db> {
  return build(await loadMeta(conf, fetchFn));
}

/** 그 학생의 행만 담은 Db */
export async function studentDb(conf: ServiceConf, stId: string, fetchFn: typeof fetch = fetch): Promise<Db> {
  if (!/^\d+$/.test(stId)) throw new Error('invalid_student');
  const [meta, students, enrollments, dorms] = await Promise.all([
    loadMeta(conf, fetchFn),
    rows(conf, `legacy_students?select=data&id=eq.${stId}`, fetchFn),
    rows(conf, `legacy_enrollments?select=data&data->>tr_st_id=eq.${stId}`, fetchFn),
    rows(conf, `legacy_dorm_assignments?select=data&data->>tr_st_id=eq.${stId}`, fetchFn),
  ]);
  return build(meta, students, enrollments, dorms);
}

/** 같은 학생을 매 요청마다 읽지 않도록 잠깐 기억한다(학생별이라 섞이지 않음). 업체 원본은 하루 몇 번 바뀌는 정도다. */
export function dbCache(conf: ServiceConf, ttlMs = 60_000, fetchFn: typeof fetch = fetch) {
  const hits = new Map<string, { at: number; db: Db }>();
  const get = async (key: string, load: () => Promise<Db>, now: number) => {
    const hit = hits.get(key);
    if (hit && now - hit.at < ttlMs) return hit.db;
    const db = await load();
    for (const [k, v] of hits) if (now - v.at >= ttlMs) hits.delete(k);
    hits.set(key, { at: now, db });
    return db;
  };
  return {
    meta: (now = Date.now()) => get('', () => metaDb(conf, fetchFn), now),
    student: (stId: string, now = Date.now()) => get(`st:${stId}`, () => studentDb(conf, stId, fetchFn), now),
  };
}
