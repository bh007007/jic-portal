import { Navigate, Route, Routes } from 'react-router-dom';
import { useApi, useStudentId, type Meta } from './api';
import { BottomNav, Header } from './components/Layout';
import AbsenceNew from './pages/AbsenceNew';
import Home from './pages/Home';
import Login from './pages/Login';
import OvernightDetail from './pages/OvernightDetail';
import OvernightNew from './pages/OvernightNew';
import Profile from './pages/Profile';
import RequestDetail from './pages/RequestDetail';
import Requests from './pages/Requests';
import Timetable from './pages/Timetable';

export default function App() {
  const stId = useStudentId();
  const { data: meta } = useApi<Meta>('/api/meta');

  if (!stId) return <Login meta={meta} />;

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
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/me" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
