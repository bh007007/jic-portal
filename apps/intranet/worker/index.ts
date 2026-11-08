/**
 * 인트라넷 배포 서버 (Cloudflare Workers: 정적 파일 + /api). 설정은 apps/intranet/wrangler.jsonc, 설명은 docs/intranet.md '배포'.
 * - 로그인: Supabase 계정 토큰(Authorization). 직원(staff_users)은 모든 직원 화면, 출입구 가드 공용 계정(guard_accounts)은
 *   가드 태블릿 API 만 쓴다. 가드의 캠퍼스는 계정의 출입구로 고정한다(RLS 도 같은 범위만 허용).
 * - 학생·연수: 직원은 직원 토큰으로, 가드는 서비스 키로 업체 원본을 읽는다(server/supabaseData.ts).
 * - 저장소: Supabase 테이블을 로그인한 계정의 토큰으로(server/supabaseStores.ts, RLS·DB 함수).
 *   가드 화면의 승인된 외박만 서비스 키로 읽는다(사유 없이).
 * - 계산은 로컬 개발 서버와 같은 core(server/core.ts).
 * 키는 Workers 변수에서 읽고 코드에 넣지 않는다. 서비스 키는 가드 요청에서만 쓴다.
 */
import { handleIntranetApi } from '../server/core';
import { accountCaches, serviceHeaders, userHeaders } from '../server/supabaseData';
import { approvedOvernights, supabaseStores } from '../server/supabaseStores';

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  /** 비밀 변수: 가드 태블릿이 재학생 명단과 승인된 외박을 읽는 데만 쓴다. 없으면 가드 요청만 500 */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const BODY_LIMIT = 32 * 1024; // 로컬 개발 서버와 같음(공지 본문 5000자)
/** 가드 공용 계정이 쓸 수 있는 경로(가드 태블릿) */
const GUARD_ROUTES = new Set(['GET /api/meta', 'GET /api/guard', 'POST /api/guard/scan', 'POST /api/guard/report']);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

let caches: { key: string; c: ReturnType<typeof accountCaches> } | null = null;

export async function handleApi(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json(500, { error: 'server_config' }); // Workers 변수 SUPABASE_URL·SUPABASE_ANON_KEY
  const conf = { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY };
  const key = `${conf.url}|${conf.key}`;
  if (!caches || caches.key !== key) caches = { key, c: accountCaches(conf, fetchFn) };

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
  const url = new URL(req.url);
  try {
    const account = await caches.c.account(token);
    if (!account) return json(403, { error: 'staff_only' }); // 토큰은 맞지만 직원·가드가 아닌 계정(학생·에이전시)
    const stores = supabaseStores(conf, token, account.userId, fetchFn);
    const base = { now: () => new Date(), newId: () => crypto.randomUUID() };

    if (account.role === 'guard') {
      if (!GUARD_ROUTES.has(`${req.method} ${url.pathname.replace(/\/+$/, '')}`)) return json(403, { error: 'guard_forbidden' });
      if (!env.SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: 'server_config' });
      // 캠퍼스는 화면이 보낸 값이 아니라 계정의 출입구
      url.searchParams.set('campus', account.campus);
      if (body && typeof body === 'object') (body as Record<string, unknown>).campus = account.campus;
      const db = await caches.c.db(serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY));
      const { status, body: out } = await handleIntranetApi(
        {
          ...base,
          db,
          stores: { ...stores, overnights: approvedOvernights(conf.url, env.SUPABASE_SERVICE_ROLE_KEY, fetchFn) },
          actor: account.label,
          session: { role: 'guard', campus: account.campus },
        },
        req.method,
        url.pathname,
        url.searchParams,
        body,
      );
      return json(status, out);
    }

    const db = await caches.c.db(userHeaders(conf, token));
    const { status, body: out } = await handleIntranetApi(
      { ...base, db, stores, actor: account.name, session: { role: 'staff' } },
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
