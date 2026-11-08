import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Me {
  session: Session;
  roles: string[]; // teacher·checker·scheduler·manager, 직원이면 'staff'
  name: string;
  isManager: boolean; // 매니저 또는 관리자: 시험 종류·강사 목록·출석 마감·사유 인정(DB is_lms_manager)
  isAdmin: boolean; // 직원 중 관리자('office' 역할만 있으면 오피스, docs/roles.md)
  canWrite: boolean; // 성적 입력·자료 등록: 강사·매니저·관리자(DB is_lms_writer). 체커·스케줄러·오피스는 읽기만
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  me: Me | null;
  error: string;
}

const Ctx = createContext<AuthState>({ loading: true, session: null, me: null, error: '' });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [loadingMe, setLoadingMe] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // 탭 전환·토큰 갱신 때마다 Supabase 가 새 세션 객체를 알려 준다(SIGNED_IN·TOKEN_REFRESHED). 사람이 바뀔 때만 다시 읽어야
  // 화면이 다시 그려지며 입력 중인 내용(여러 명 성적 등)이 지워지지 않는다.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    let alive = true;
    setLoadingMe(true);
    setError('');
    (async () => {
      const r = await supabase.rpc('my_roles');
      if (r.error) throw r.error;
      const roles = (r.data as string[]) ?? [];
      const s = await supabase.from('staff').select('name').eq('user_id', session.user.id).maybeSingle();
      const name = (s.data?.name as string | undefined) || session.user.email || '';
      const isAdmin = roles.includes('staff') && (roles.includes('admin') || !roles.includes('office'));
      const isManager = roles.includes('manager') || isAdmin;
      const canWrite = isManager || roles.includes('teacher');
      if (alive) setMe({ session, roles, name, isManager, isAdmin, canWrite });
    })()
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoadingMe(false));
    return () => {
      alive = false;
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ loading: session === undefined || loadingMe, session: session ?? null, me, error }}>{children}</Ctx.Provider>;
}
