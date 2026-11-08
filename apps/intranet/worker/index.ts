/**
 * 인트라넷 배포 서버 (Cloudflare Workers: 정적 파일 + /api). 설정은 apps/intranet/wrangler.jsonc, 설명은 docs/intranet.md '배포'.
 * - 로그인: Supabase 직원 계정 토큰(Authorization). staff_users 에 있는 직원만 쓴다. 처리자 이름은 staff_users.name.
 * - 학생·연수: 직원 토큰으로 업체 원본을 읽는다(server/supabaseData.ts, 관리자 앱과 같은 방식).
 * - 외출·패널티·신청·상담·공지·배차: Supabase 테이블을 직원 토큰으로(server/supabaseStores.ts, RLS·DB 함수).
 * - 계산은 로컬 개발 서버와 같은 core(server/core.ts).
 * 가드 공용 계정(태블릿)은 다음 단계. 키는 Workers 변수에서 읽고 코드에 넣지 않는다. 서비스 키는 쓰지 않는다.
 */
import { handleIntranetApi } from '../server/core';
import { staffCaches } from '../server/supabaseData';
import { supabaseStores } from '../server/supabaseStores';

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

const BODY_LIMIT = 32 * 1024; // 로컬 개발 서버와 같음(공지 본문 5000자)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

let caches: { key: string; c: ReturnType<typeof staffCaches> } | null = null;

export async function handleApi(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json(500, { error: 'server_config' }); // Workers 변수 SUPABASE_URL·SUPABASE_ANON_KEY
  const conf = { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY };
  const key = `${conf.url}|${conf.key}`;
  if (!caches || caches.key !== key) caches = { key, c: staffCaches(conf, fetchFn) };

  let body: unknown = null;
  if (req.method === 'POST' || req.method === 'PUT') {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > BODY_LIMIT) return json(413, { error: 'body_too_large' });
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return json(400, { error: 'invalid_json' });
    }
  }

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: 'unauthorized' });
  try {
    const staff = await caches.c.staff(token);
    if (!staff) return json(403, { error: 'staff_only' }); // 토큰은 맞지만 직원이 아닌 계정(학생·에이전시·가드)
    const db = await caches.c.db(token);
    const url = new URL(req.url);
    const { status, body: out } = await handleIntranetApi(
      { db, stores: supabaseStores(conf, token, staff.userId, fetchFn), actor: staff.name, now: () => new Date(), newId: () => crypto.randomUUID() },
      req.method,
      url.pathname,
      url.searchParams,
      body,
    );
    return json(status, out);
  } catch (e) {
    return json(502, { error: 'network', detail: (e as Error).message.slice(0, 40) });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
};
