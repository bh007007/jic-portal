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
  /** 지점 대표(owner) 또는 대표가 등록한 직원(staff), CL-032 */
  role: 'owner' | 'staff';
  owner_id: string | null;
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
  /** JIC 직원(관리자). 에이전시 직원 아이디는 agencyStaff */
  staff: boolean;
  /** DB 기준으로 쓸 수 있는 지점 아이디(is_partner: 사용 중이고, 직원이면 대표 아이디도 사용 중) */
  partner: boolean;
  /** 지점 대표 아이디(사용 중) */
  owner: boolean;
  /** 지점 직원 아이디(CL-032): 상담·자료·공지만 */
  agencyStaff: boolean;
  /** 승인된 파트너이거나 JIC 직원 */
  allowed: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [info, setInfo] = useState<{ member: Member | null; request: AgencyRequest | null; staff: boolean; partner: boolean; loaded: boolean }>({
    member: null,
    request: null,
    staff: false,
    partner: false,
    loaded: false,
  });

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setInfo({ member: null, request: null, staff: false, partner: false, loaded: true });
      return;
    }
    const uid = s.user.id;
    const member = () => supabase.from('agency_members').select('*').eq('user_id', uid).maybeSingle();
    const [m0, r, st] = await Promise.all([
      member(),
      supabase.from('agency_requests').select('id,status,agency_name,branch,review_note,created_at').eq('user_id', uid).maybeSingle(),
      supabase.from('staff_users').select('user_id').eq('user_id', uid).maybeSingle(),
    ]);
    let m = m0;
    // 지점 대표가 이 이메일을 직원으로 등록해 두었으면 처음 로그인할 때 직원 아이디가 생긴다(CL-032)
    if (!m.data && !st.data) {
      const c = await supabase.rpc('claim_agency_staff_invite');
      if (c.data === true) {
        m = await member();
        await supabase.rpc('touch_partner_login'); // 로그인 순간에는 직원 행이 없어 세지 못한 첫 접속
      }
    }
    const p = m.data ? await supabase.rpc('is_partner') : null;
    setInfo({ member: (m.data as Member) ?? null, request: (r.data as AgencyRequest) ?? null, staff: Boolean(st.data), partner: p?.data === true, loaded: true });
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
    partner: info.partner,
    owner: info.partner && info.member?.role !== 'staff',
    agencyStaff: !info.staff && info.partner && info.member?.role === 'staff',
    allowed: info.staff || info.partner,
    reload: () => load(session ?? null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth 를 썼습니다.');
  return v;
}
