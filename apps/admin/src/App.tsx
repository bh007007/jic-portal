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
import Rooms from './pages/Rooms';
import Arrivals from './pages/Arrivals';
import Agencies from './pages/Agencies';
import AgencyDetail from './pages/AgencyDetail';
import Agents from './pages/Agents';
import Invoices from './pages/Invoices';
import Deposits from './pages/Deposits';
import Points from './pages/Points';
import Codes from './pages/Codes';
import Batches from './pages/Batches';
import StudentCalendar from './pages/StudentCalendar';
import Registrations from './pages/Registrations';
import Cancellations from './pages/Cancellations';
import Memos from './pages/Memos';
import Users from './pages/Users';
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
        <Route path="/arrivals" element={<Arrivals />} />
        <Route path="/dorm" element={<Dorm />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/agencies" element={<Agencies />} />
        <Route path="/agencies/:agId" element={<AgencyDetail />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/deposits" element={<Deposits />} />
        <Route path="/points" element={<Points />} />
        <Route path="/codes" element={<Codes />} />
        <Route path="/batches" element={<Batches />} />
        <Route path="/stats/calendar" element={<StudentCalendar />} />
        <Route path="/stats/registrations" element={<Registrations />} />
        <Route path="/cancellations" element={<Cancellations />} />
        <Route path="/memos" element={<Memos />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<NotReady />} />
      </Routes>
    </Shell>
  );
}
