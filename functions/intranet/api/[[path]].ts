/**
 * Cloudflare Pages Function: JIC 포털 주소 아래 인트라넷의 /intranet/api/*.
 * 인트라넷 서버(apps/intranet/worker/index.ts 의 handleApi: 직원·가드 로그인 확인, 같은 core, 저장소 Supabase)를 그대로 쓴다.
 * 주소 앞의 '/intranet' 만 떼고 넘긴다. 관리자 앱의 /api/*(functions/api)와 따로 돈다.
 * 변수: SUPABASE_URL·SUPABASE_ANON_KEY 가 없으면 관리자 앱과 같은 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 를 쓴다.
 * 비밀 변수 SUPABASE_SERVICE_ROLE_KEY 는 가드 태블릿 요청(재학생 명단·승인된 외박 읽기)에만 쓴다. 코드에 키를 넣지 않는다.
 */
import { handleApi } from '../../../apps/intranet/worker/index';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/intranet(?=\/api(\/|$))/, '');
  return handleApi(new Request(url.toString(), request), {
    ASSETS: env.ASSETS,
    SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  });
};
