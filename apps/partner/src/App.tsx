import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { configured } from './supabase';
import Layout from './Layout';
import { Loading, Preparing } from './ui';
import PublicHome from './pages/PublicHome';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import Pending from './pages/Pending';
import Account from './pages/Account';
import Consult from './consult/Consult';
import Campuses from './pages/Campuses';
import CampusPage from './pages/CampusPage';
import CoursePage from './pages/CoursePage';
import Quote from './pages/Quote';
import Vacancy from './pages/Vacancy';
import Register from './pages/Register';
import Resources from './pages/Resources';
import Notices from './pages/Notices';
import NoticeDetail from './pages/NoticeDetail';
import Visit from './pages/Visit';
import AdminMoved from './pages/admin/AdminMoved';

/** 승인된 파트너 또는 JIC 직원만. 로그인 전이면 로그인으로, 승인 전이면 대기 화면. */
function Member({ children }: { children: ReactNode }) {
  const { session, allowed } = useAuth();
  const loc = useLocation();
  if (session === undefined) return <Loading />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!allowed) return <Pending />;
  return <>{children}</>;
}

/** 관리자 화면은 11/10 모두 관리자 포털로 옮겼다. 예전 주소로 들어온 직원에게 옮긴 곳을 알려 준다 */
function Staff({ children }: { children: ReactNode }) {
  const { session, staff } = useAuth();
  if (session === undefined) return <Loading />;
  if (!session) return <Navigate to="/login?next=/admin" replace />;
  if (!staff) return <Loading error="JIC 관리자만 볼 수 있습니다." />;
  return <>{children}</>;
}

function Root() {
  const { session, allowed } = useAuth();
  if (session === undefined) return <Loading />;
  if (!session) return <PublicHome />;
  return allowed ? <Home /> : <Pending />;
}

export default function App() {
  if (!configured) {
    return (
      <Layout>
        <Loading error="Supabase 설정이 없습니다. apps/partner/.env.example 을 .env.local 로 복사하세요." />
      </Layout>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/account" element={<Member><Account /></Member>} />
        <Route path="/consult" element={<Member><Consult /></Member>} />
        <Route path="/campuses" element={<Member><Campuses /></Member>} />
        <Route path="/campuses/:id" element={<Member><CampusPage /></Member>} />
        <Route path="/courses/:id" element={<Member><CoursePage /></Member>} />
        <Route path="/quote" element={<Member><Quote /></Member>} />
        <Route path="/vacancy" element={<Member><Vacancy /></Member>} />
        <Route path="/register" element={<Member><Register /></Member>} />
        <Route path="/resources" element={<Member><Resources /></Member>} />
        <Route path="/notices" element={<Member><Notices /></Member>} />
        <Route path="/notices/:id" element={<Member><NoticeDetail /></Member>} />
        <Route path="/visit" element={<Member><Visit /></Member>} />
        <Route path="/students" element={<Preparing title="My Students" />} />
        <Route path="/admin/*" element={<Staff><AdminMoved /></Staff>} />
        <Route path="*" element={<Preparing title="페이지를 찾을 수 없습니다" />} />
      </Routes>
    </Layout>
  );
}
