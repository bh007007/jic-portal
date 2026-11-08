import { createClient } from '@supabase/supabase-js';
import { tNow } from './i18n';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 강사 포털은 데이터가 모두 공용 DB에 있어 Supabase 설정이 반드시 필요하다. 로그인 저장 키는 기본값(관리자 포털·인트라넷과 같은 주소라 한 번 로그인). */
export const configured = Boolean(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing');

/** Supabase·DB 오류를 화면용 문장으로(지금 고른 언어). */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m === 'Invalid login credentials') return tNow('e_login');
  if (/Failed to fetch/i.test(m)) return tNow('e_net');
  if (/invalid_value/.test(m)) return tNow('e_value');
  if (/invalid_section/.test(m)) return tNow('e_section');
  if (/invalid_date/.test(m)) return tNow('e_date');
  if (/invalid_test_type/.test(m)) return tNow('e_type');
  if (/row-level security|violates row-level/.test(m)) return tNow('e_rls');
  if (/duplicate key/.test(m)) return tNow('e_dup');
  if (/check constraint/.test(m)) return tNow('e_check');
  return m;
}

/** 결과에서 오류면 던지고 데이터만 돌려준다. */
export async function must<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}

/** 필리핀 오늘 날짜(YYYY-MM-DD). DB 의 manila_today() 와 같은 기준. */
export const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
