import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Member {
  user_id: string;
  email: string;
  agency_name: string;
  branch: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  lang: string;
  currency: string;
  status: 'active' | 'suspended';
}

export interface AgencyRequest {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  agency_name: string;
  branch: string | null;
  review_note: string | null;
  created_at: string;
}

interface AuthState {
  /** undefined = 확인 중 */
  session: Session | null | undefined;
  member: Member | null;
  request: AgencyRequest | null;
  staff: boolean;
  /** 승인된 파트너이거나 JIC 직원 */
  allowed: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [info, setInfo] = useState<{ member: Member | null; request: AgencyRequest | null; staff: boolean; loaded: boolean }>({
    member: null,
    request: null,
    staff: false,
    loaded: false,
  });

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setInfo({ member: null, request: null, staff: false, loaded: true });
      return;
    }
    const uid = s.user.id;
    const [m, r, st] = await Promise.all([
      supabase.from('agency_members').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('agency_requests').select('id,status,agency_name,branch,review_note,created_at').eq('user_id', uid).maybeSingle(),
      supabase.from('staff_users').select('user_id').eq('user_id', uid).maybeSingle(),
    ]);
    setInfo({ member: (m.data as Member) ?? null, request: (r.data as AgencyRequest) ?? null, staff: Boolean(st.data), loaded: true });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      load(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s);
      if (event === 'SIGNED_IN') supabase.rpc('touch_partner_login').then(() => undefined);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const value: AuthState = {
    session: session === undefined || (session && !info.loaded) ? undefined : session,
    member: info.member,
    request: info.request,
    staff: info.staff,
    allowed: info.staff || info.member?.status === 'active',
    reload: () => load(session ?? null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth 를 썼습니다.');
  return v;
}
