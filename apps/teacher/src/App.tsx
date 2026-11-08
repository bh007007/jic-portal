import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { configured, supabase } from './supabase';
import Layout from './Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Scores from './pages/Scores';
import Materials from './pages/Materials';
import More from './pages/More';
import TestTypes from './pages/TestTypes';
import Staff from './pages/Staff';
import Absences from './pages/Absences';
import NotReady from './pages/NotReady';

export default function App() {
  const { loading, session, me, error } = useAuth();
  if (!configured) return <div className="state">Supabase 주소가 설정되지 않았습니다(apps/teacher/.env.example 참고).</div>;
  if (loading) return <div className="state">불러오는 중…</div>;
  if (!session) return <Login />;
  if (error) return <div className="state">계정 정보를 불러오지 못했습니다: {error}</div>;
  if (!me || me.roles.length === 0) {
    return (
      <div className="state">
        <p>강사 포털 계정이 아닙니다. 강사·체커·스케줄러·매니저 역할이 있어야 합니다(관리자에게 요청).</p>
        <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>
      </div>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:no" element={<StudentDetail />} />
        <Route path="/scores" element={<Scores />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/more" element={<More />} />
        <Route path="/tests" element={me.isManager ? <TestTypes /> : <Navigate to="/more" replace />} />
        <Route path="/staff" element={me.isManager ? <Staff /> : <Navigate to="/more" replace />} />
        <Route path="/absences" element={<Absences />} />
        <Route path="/attendance" element={<NotReady title="출석 체크" />} />
        <Route path="*" element={<NotReady title="없는 화면" />} />
      </Routes>
    </Layout>
  );
}
