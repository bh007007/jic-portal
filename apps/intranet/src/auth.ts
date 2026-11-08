/**
 * 로그인. 두 가지 방식이 있다.
 * - 로컬 개발(VITE_SUPABASE_URL 없음): 로그인 없이 이 PC 의 데이터로 동작하고, 처리자 이름은 오른쪽 위에 입력한다(X-Staff-Name).
 * - 배포(환경변수 있음): Supabase 직원 계정(이메일·비밀번호, 관리자 앱과 같은 계정)으로 로그인하고 토큰을 보낸다.
 *   JIC 포털 주소 아래(/intranet)에서 관리자 앱과 같은 로그인 저장 키(Supabase 기본값)를 써서, 한쪽에서 로그인하면 다른 쪽도 로그인된다.
 *   처리자 이름은 서버가 staff_users 에서 읽는다(화면이 보내는 이름은 쓰지 않는다).
 */
import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;
export const authMode: 'local' | 'supabase' = supabase ? 'supabase' : 'local';

type SessionState = 'loading' | Session | null;
let session: SessionState = supabase ? 'loading' : null;
const listeners = new Set<() => void>();
const setSession = (s: Session | null) => {
  session = s;
  listeners.forEach((fn) => fn());
};
if (supabase) {
  supabase.auth.onAuthStateChange((_event, s) => setSession(s));
}

/** 로그인·로그아웃 때 부른다(처리자 이름을 다시 읽는 데 쓴다). */
export function onSessionChange(fn: () => void) {
  let last = typeof session === 'object' && session ? session.user.id : null;
  listeners.add(() => {
    const now = typeof session === 'object' && session ? session.user.id : null;
    if (now !== last) {
      last = now;
      fn();
    }
  });
}

export function useSession(): SessionState {
  const [s, setS] = useState(session);
  useEffect(() => {
    const fn = () => setS(session);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return s;
}

/** /api 요청에 붙일 로그인 헤더(배포만). */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return null;
  if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (!error.status) return '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  return error.message;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
