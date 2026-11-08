/**
 * Cloudflare Pages Function: JIC 포털 주소 아래 강사 포털(LMS) 화면(/teacher/*, npm run teacher:portal 이 apps/admin/dist/teacher 에 넣는다).
 * 파일(/teacher/assets/…)은 그대로 주고, 화면 주소(/teacher/students/1001 등)는 강사 포털 index.html 로 보낸다
 * (주소창에서 바로 열거나 새로 고쳐도 강사 포털이 열리게. Pages 기본 동작은 첫 화면 index.html 을 준다).
 * 강사 포털은 서버 코드 없이 Supabase(RLS)를 바로 쓴다.
 */
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export const onRequest = async ({ request, env, next }: { request: Request; env: Env; next: () => Promise<Response> }): Promise<Response> => {
  const url = new URL(request.url);
  if (/\/[^/]+\.[a-z0-9]+$/i.test(url.pathname)) return next();
  return env.ASSETS.fetch(new Request(new URL('/teacher/', url).toString(), request));
};
