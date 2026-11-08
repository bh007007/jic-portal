import { Navigate, Route, Routes } from 'react-router-dom';
import { useApi, type Meta } from './api';
import { authMode, useAuth } from './auth';
import { BottomNav, Header, Loading } from './components/Layout';
import AbsenceNew from './pages/AbsenceNew';
import Departure from './pages/Departure';
import Home from './pages/Home';
import Login, { AuthShell } from './pages/Login';
import LifeDetail from './pages/LifeDetail';
import LifeNew from './pages/LifeNew';
import OvernightDetail from './pages/OvernightDetail';
import OvernightNew from './pages/OvernightNew';
import Password from './pages/Password';
import Profile from './pages/Profile';
import RequestDetail from './pages/RequestDetail';
import Requests from './pages/Requests';
import Timetable from './pages/Timetable';
import TripDetail from './pages/TripDetail';
import Trips from './pages/Trips';

export default function App() {
  const auth = useAuth();
  const { data: meta } = useApi<Meta>('/api/meta');

  if (auth.status === 'loading') return <AuthShell><Loading /></AuthShell>;
  if (auth.status === 'out') return <Login meta={meta} notice={auth.notice} />;
  // 첫 비밀번호(생년월일)를 바꾸기 전에는 다른 화면을 열지 않는다(서버도 403).
  if (auth.mustChangePassword) return <Password forced />;

  return (
    <div className="app">
      <Header sample={meta?.source === 'sample'} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/requests/absence/new" element={<AbsenceNew />} />
          <Route path="/requests/overnight/new" element={<OvernightNew />} />
          <Route path="/requests/overnight/:id" element={<OvernightDetail />} />
          <Route path="/requests/life/new" element={<LifeNew />} />
          <Route path="/requests/life/:id" element={<LifeDetail />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/departure" element={<Departure />} />
          {authMode === 'supabase' && <Route path="/password" element={<Password />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
