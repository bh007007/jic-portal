import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../supabase';

// 파트너 포털 관리 › 추천·콘텐츠·공지(추천 규칙·캠퍼스·코스 내용·자료실·공지·링크 설정) 화면이 같이 쓰는 것.
// 표와 권한은 에이전시 포털 표 그대로다(직원 is_staff, RLS: 20261107010000_partner_portal.sql). 이 화면들은 Supabase 가 있을 때만 열린다.

/** 화면은 AgencyContent 가 Supabase 설정을 확인한 뒤에만 그리므로 여기서는 늘 있다 */
export const db = () => supabase as SupabaseClient;

/** select 결과에서 오류면 던지고 데이터만 돌려준다 */
export async function must<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}

export const errText = (e: unknown) => (e as { message?: string })?.message ?? String(e);

/** 비동기 조회를 컴포넌트 상태로. reload 로 다시 부른다 */
export function useLoad<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const run = useCallback(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e) => alive && setState({ data: null, error: errText(e) }));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(run, [run]);
  return { ...state, reload: run };
}

export type Note = { ok: boolean; text: string } | null;

export function Status({ msg }: { msg: Note }) {
  return msg ? <div className={msg.ok ? 'text-blue' : 'text-red'} role="status" style={{ fontSize: 12, margin: '4px 0 8px' }}>{msg.text}</div> : null;
}

/** 캠퍼스 이름을 붙인 코스 이름(조건표 열 머리 등): 'Premium · ESL' */
export const campusName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
