/**
 * Cloudflare Pages Function: JIC 포털 주소 아래 인트라넷 화면(/intranet/*, npm run portal:build 가 apps/admin/dist/intranet 에 넣는다).
 * 파일(/intranet/assets/…)은 그대로 주고, 화면 주소(/intranet/trips, /intranet/guard 등)는 인트라넷 index.html 로 보낸다
 * (주소창에서 바로 열거나 새로 고쳐도 인트라넷이 열리게. Pages 기본 동작은 관리자 앱 index.html 을 준다).
 * /intranet/api/* 는 더 구체적인 functions/intranet/api 가 맡는다.
 */
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export const onRequest = async ({ request, env, next }: { request: Request; env: Env; next: () => Promise<Response> }): Promise<Response> => {
  const url = new URL(request.url);
  if (/\/[^/]+\.[a-z0-9]+$/i.test(url.pathname)) return next();
  return env.ASSETS.fetch(new Request(new URL('/intranet/', url).toString(), request));
};
