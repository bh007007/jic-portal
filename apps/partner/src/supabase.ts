import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 파트너 포털은 데이터가 모두 공용 DB에 있어 Supabase 설정이 반드시 필요하다. */
export const configured = Boolean(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing');

/** Supabase 오류를 화면용 문장으로. */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m === 'Invalid login credentials') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (m === 'Email not confirmed') return '이메일 인증이 끝나지 않았습니다. 받은 편지함의 인증 메일을 확인하세요.';
  if (/User already registered/i.test(m)) return '이미 등록된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용하세요.';
  if (/Failed to fetch/i.test(m)) return '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  return m;
}

/** select 결과에서 오류면 던지고 데이터만 돌려준다. */
export async function must<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}
