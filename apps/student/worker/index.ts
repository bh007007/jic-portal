/**
 * 학생 앱 배포 서버 (Cloudflare Workers: 정적 파일 + /api). 설정은 apps/student/wrangler.jsonc, 설명은 docs/student-app.md '배포'.
 * - 로그인: Supabase 학생 계정 토큰(Authorization)으로 학생을 확인한다(server/supabaseAuth.ts). 첫 비밀번호를 안 바꿨으면 403.
 * - 학생·연수: 업체 원본에서 그 학생 행만 서비스 키로 읽는다(server/supabaseData.ts).
 * - 신청·귀국 항공편·배차: Supabase 테이블을 학생 토큰으로 읽고 쓴다(server/supabaseStores.ts, RLS).
 * - 계산은 로컬 개발 서버와 같은 core(server/core.ts)라서 화면은 같은 응답을 받는다.
 * 키는 Workers 변수에서 읽는다. 코드에 키를 넣지 않는다.
 */
import { handleStudentApi } from '../server/core';
import { dbCache } from '../server/supabaseData';
import { tokenCache } from '../server/supabaseAuth';
import { supabaseStores } from '../server/supabaseStores';

export interface Env {
  /** 정적 파일(apps/student/dist) */
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL?: string;
  /** anon(publishable) 키: 학생 토큰과 함께 쓴다 */
  SUPABASE_ANON_KEY?: string;
  /** 서비스 키(비밀 변수): 업체 원본에서 그 학생 행만 읽는 데만 쓴다 */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const BODY_LIMIT = 16 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// 같은 Worker 인스턴스 안에서 잠깐 기억한다(토큰 30초, 학생 데이터 60초).
let caches: { key: string; tokens: ReturnType<typeof tokenCache>; data: ReturnType<typeof dbCache> } | null = null;
function cachesFor(env: Required<Omit<Env, 'ASSETS'>>, fetchFn: typeof fetch) {
  const key = `${env.SUPABASE_URL}|${env.SUPABASE_ANON_KEY}`;
  if (!caches || caches.key !== key) {
    caches = {
      key,
      tokens: tokenCache({ url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY }, 30_000, fetchFn),
      data: dbCache({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY }, 60_000, fetchFn),
    };
  }
  return caches;
}

async function readBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  if (req.method !== 'POST' && req.method !== 'PUT') return { ok: true, body: null };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > BODY_LIMIT) return { ok: false, status: 413, error: 'body_too_large' };
  try {
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}

export async function handleApi(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'server_config' }); // Workers 변수 SUPABASE_URL·SUPABASE_ANON_KEY·SUPABASE_SERVICE_ROLE_KEY
  }
  const conf = { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY };
  const { tokens, data } = cachesFor(env as Required<Omit<Env, 'ASSETS'>>, fetchFn);
  const body = await readBody(req);
  if (!body.ok) return json(body.status, { error: body.error });

  try {
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
    const session = token ? await tokens.resolve(token) : null;
    const db = session ? await data.student(session.stId) : await data.meta();
    // 로그인 전에는 저장소를 쓰지 않는다(core 가 /meta 말고는 401). 토큰이 없을 때는 빈 토큰으로 만들어 두기만 한다.
    const stores = supabaseStores(conf, token ?? '', fetchFn);
    const url = new URL(req.url);
    const { status, body: out } = await handleStudentApi(
      {
        db,
        ...stores,
        stId: session?.stId ?? null,
        mustChangePassword: session?.mustChangePassword ?? false,
        localLogin: false,
        now: () => new Date(),
        newId: () => crypto.randomUUID(),
      },
      req.method,
      url.pathname,
      body.body,
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
