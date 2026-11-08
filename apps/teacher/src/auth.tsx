import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Me {
  session: Session;
  roles: string[]; // teacher·checker·scheduler·manager, 직원이면 'staff'
  name: string;
  isManager: boolean; // 매니저 또는 직원: 시험 종류·강사 목록 관리
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
      if (alive) setMe({ session, roles, name, isManager: roles.includes('manager') || roles.includes('staff') });
    })()
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoadingMe(false));
    return () => {
      alive = false;
    };
  }, [session]);

  return <Ctx.Provider value={{ loading: session === undefined || loadingMe, session: session ?? null, me, error }}>{children}</Ctx.Provider>;
}

export const ROLE_LABEL: Record<string, string> = { teacher: '강사', checker: '체커', scheduler: '스케줄러', manager: '매니저', staff: '직원' };
