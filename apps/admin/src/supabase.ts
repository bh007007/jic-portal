import { useEffect, useState } from 'react';
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

/** 관리자인지(docs/roles.md): 직원 중 'office' 역할만 있으면 오피스, 아니면 관리자. 로컬 데이터 실행은 로그인이 없어 관리자로 본다. 확인 전에는 null. */
export function useIsAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(supabase ? null : true);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.rpc('is_admin').then(({ data, error }) => alive && setAdmin(error ? true : data === true)); // 마이그레이션 전(함수 없음)이면 지금처럼 관리자
    return () => {
      alive = false;
    };
  }, []);
  return admin;
}
