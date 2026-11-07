import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Dorm from './pages/Dorm';
import NotReady from './pages/NotReady';

// undefined = 세션 확인 중, null = 로그인 안 됨
function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export default function App() {
  const session = useSession();
  if (supabase && session === undefined) return null;
  if (supabase && !session) return <Login />;

  return (
    <Shell user={session?.user.email}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:stId" element={<StudentDetail />} />
        <Route path="/dorm" element={<Dorm />} />
        <Route path="*" element={<NotReady />} />
      </Routes>
    </Shell>
  );
}
