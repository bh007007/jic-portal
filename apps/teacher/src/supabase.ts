import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 강사 포털은 데이터가 모두 공용 DB에 있어 Supabase 설정이 반드시 필요하다. 로그인 저장 키는 기본값(관리자 포털·인트라넷과 같은 주소라 한 번 로그인). */
export const configured = Boolean(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing');

/** Supabase·DB 오류를 화면용 문장으로. */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m === 'Invalid login credentials') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (/Failed to fetch/i.test(m)) return '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  if (/invalid_value/.test(m)) return '점수가 시험 종류의 범위·단위를 벗어났습니다.';
  if (/invalid_section/.test(m)) return '이 시험 종류에 없는 영역입니다.';
  if (/invalid_date/.test(m)) return '오늘 이후 날짜는 넣을 수 없습니다.';
  if (/invalid_test_type/.test(m)) return '쓰지 않는 시험 종류입니다.';
  if (/row-level security|violates row-level/.test(m)) return '권한이 없습니다.';
  if (/duplicate key/.test(m)) return '이미 있는 항목입니다.';
  if (/check constraint/.test(m)) return '입력 형식이 맞지 않습니다.';
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
