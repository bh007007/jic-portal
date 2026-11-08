/**
 * 카드키 QR(기획안 I6 '카드키 QR 외출·귀가'): 학생 앱이 1분마다 바뀌는 서명된 QR 을 보여 주고, 가드 태블릿이 읽어 외출·귀가를 기록한다.
 * 캡처한 QR 을 다른 사람에게 보내 대신 찍는 것을 막으려고, 학생번호와 1분 단위 시각을 HMAC-SHA256 으로 서명한다.
 * 비밀 값은 서버에만 있다(로컬: .local-db/student/keycard-secret.txt, 배포: Supabase keycard_secret 표를 서비스 키로).
 * 학생 앱(만들기)과 인트라넷(확인)이 같이 쓴다. Web Crypto 만 쓴다(Workers·Node·브라우저 공통). 파일·네트워크 의존 없음.
 *
 * 형식: JIC1.<학생번호>.<1분 창 번호>.<서명 20자(16진)>  예) JIC1.30095.29384021.1f0c…
 */

export const KEYCARD_PREFIX = 'JIC1';
/** 한 QR 이 쓰이는 시간(초) */
export const KEYCARD_PERIOD = 60;
/** 직전 창 몇 개까지 받을지(1 → 길게 잡아 2분). 학생 앱이 끝나기 몇 초 전에 새 QR 로 바꾸고, 가드 태블릿 시계가 조금 달라도 받게. */
export const KEYCARD_GRACE = 1;
const SIG_LEN = 20; // 16진 20자 = 80비트

export type KeycardSecret = () => Promise<string>;

const enc = new TextEncoder();
async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, SIG_LEN);
}
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const windowOf = (ms: number) => Math.floor(ms / 1000 / KEYCARD_PERIOD);

/** 지금 창의 QR 값과, 그 창이 끝나는 시각(학생 앱이 이때 새로 받는다) */
export async function keycardCode(secret: string, stId: string, nowMs: number) {
  const w = windowOf(nowMs);
  const body = `${KEYCARD_PREFIX}.${stId}.${w}`;
  return { code: `${body}.${await sign(secret, body)}`, expiresAt: new Date((w + 1) * KEYCARD_PERIOD * 1000).toISOString(), period: KEYCARD_PERIOD };
}

export type KeycardRead =
  | { ok: true; stId: string; via: 'qr' | 'number' }
  | { ok: false; error: 'invalid_qr' | 'qr_expired' | 'qr_unavailable' | 'code_required' };

/**
 * 가드 태블릿 입력 읽기. 'JIC1.' 로 시작하면 카드키 QR(서명·시각 확인), 아니면 숫자만 뽑아 직접 입력한 학생번호로 본다
 * (휴대폰이 없을 때 등. 기록에 '번호 입력'으로 남는다). 앞으로 1분 넘게 앞선 창은 받지 않는다(시계가 많이 틀린 기기).
 */
export async function readKeycard(secret: KeycardSecret | undefined, raw: unknown, nowMs: number): Promise<KeycardRead> {
  const text = String(raw ?? '').trim();
  if (text.toUpperCase().startsWith(`${KEYCARD_PREFIX}.`)) {
    const m = text.match(/^JIC1\.(\d{1,12})\.(\d{1,12})\.([0-9a-f]+)$/i);
    if (!m) return { ok: false, error: 'invalid_qr' };
    if (!secret) return { ok: false, error: 'qr_unavailable' };
    const [, stId, ws, sig] = m;
    const w = Number(ws);
    const expected = await sign(await secret(), `${KEYCARD_PREFIX}.${stId}.${w}`);
    if (!same(sig.toLowerCase(), expected)) return { ok: false, error: 'invalid_qr' };
    const now = windowOf(nowMs);
    if (w > now + 1) return { ok: false, error: 'invalid_qr' };
    if (w < now - KEYCARD_GRACE) return { ok: false, error: 'qr_expired' };
    return { ok: true, stId, via: 'qr' };
  }
  const stId = text.replace(/\D/g, '');
  return stId ? { ok: true, stId, via: 'number' } : { ok: false, error: 'code_required' };
}

/** 배포: Supabase keycard_secret(서비스 키만 읽음, 20261108170000_keycard_qr.sql)에서 한 번 읽어 Worker 메모리에 둔다. */
export function serviceKeycardSecret(url: string, serviceKey: string, fetchFn: typeof fetch = fetch): KeycardSecret {
  let cached: Promise<string> | null = null;
  const headers: Record<string, string> = { apikey: serviceKey, ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}) };
  return () => {
    cached ??= fetchFn(`${url.replace(/\/+$/, '')}/rest/v1/keycard_secret?select=secret&id=eq.1`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error(`keycard_${r.status}`);
        const rows = (await r.json()) as { secret: string }[];
        if (!rows[0]?.secret) throw new Error('keycard_missing');
        return rows[0].secret;
      })
      .catch((e) => {
        cached = null; // 다음 요청에 다시 읽는다
        throw e;
      });
    return cached;
  };
}
