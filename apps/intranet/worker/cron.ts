/**
 * jic-intranet Worker: 인트라넷 자동 확인(크론) 전용(11/9 결정 I3). 인트라넷 화면과 /api 는 JIC 포털 Pages 의 /intranet 이 맡는다(worker/index.ts).
 * 매시 30분(wrangler.jsonc triggers)에 통금 위반·무단결석 후보를 정리한다. 화면을 열 때와 같은 core 규칙이라 여러 번 돌려도 같은 결과다.
 * 로그인한 사람이 없어 서비스 키로 읽고 쓰지만 바꾸는 것은 대기 중인 자동 후보뿐이다(승인·반려·설정은 하지 않는다).
 * 실행 변수: SUPABASE_URL, 비밀 변수 SUPABASE_SERVICE_ROLE_KEY. 키는 코드에 넣지 않는다.
 */
import { scheduledChecks } from '../server/core';
import { serviceStores } from '../server/supabaseStores';

export interface CronEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/** 한 번 확인한다. 돌려준 값은 대기 중인 자동 후보 수(통금 위반·무단결석). 변수가 없으면 오류 */
export async function runChecks(env: CronEnv, now: () => Date = () => new Date(), fetchFn: typeof fetch = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('server_config: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  return scheduledChecks({ stores: serviceStores(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, fetchFn), now, newId: () => crypto.randomUUID() });
}

export default {
  async scheduled(_event: unknown, env: CronEnv): Promise<void> {
    const r = await runChecks(env); // 실패하면 Cloudflare 크론 기록에 오류로 남는다
    console.log(`[intranet] 자동 확인: 대기 중 통금 위반 ${r.curfew}건, 무단결석 ${r.absence}건`);
  },
  // 화면은 JIC 포털 /intranet 에 있다. 이 주소로 들어오면 안내만 한다
  async fetch(): Promise<Response> {
    return new Response('jic-intranet: 인트라넷 자동 확인(크론) 전용입니다. 인트라넷은 JIC 포털 주소의 /intranet 에서 엽니다.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};
