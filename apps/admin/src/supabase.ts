import { createClient } from '@supabase/supabase-js';

// 배포(Cloudflare Pages)에서는 환경변수가 있어 Supabase 로그인을 쓰고,
// 로컬 개발(환경변수 없음)에서는 로그인 없이 이 PC의 데이터로 동작한다.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
