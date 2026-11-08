import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { useT } from './i18n';
import { configured, supabase } from './supabase';
import Layout from './Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Scores from './pages/Scores';
import BatchScores from './pages/BatchScores';
import Materials from './pages/Materials';
import More from './pages/More';
import TestTypes from './pages/TestTypes';
import Staff from './pages/Staff';
import Absences from './pages/Absences';
import Attendance from './pages/Attendance';
import AttendanceSession from './pages/AttendanceSession';
import Notices from './pages/Notices';
import NotReady from './pages/NotReady';

export default function App() {
  const { loading, session, me, error } = useAuth();
  const { t } = useT();
  if (!configured) return <div className="state">{t('notConfigured')}</div>;
  if (loading) return <div className="state">{t('loading')}</div>;
  if (!session) return <Login />;
  // 계정 정보를 못 읽으면(세션 만료·계정 삭제) 막히지 않게 로그아웃 버튼을 같이 둔다
  if (error) {
    return (
      <div className="state">
        <p>{t('meFail')}: {error}</p>
        <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>{t('logout')}</button>
      </div>
    );
  }
  if (!me || me.roles.length === 0) {
    return (
      <div className="state">
        <p>{t('notTeacher')}</p>
        <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>{t('logout')}</button>
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
        <Route path="/scores/batch" element={<BatchScores />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/more" element={<More />} />
        <Route path="/tests" element={me.isManager ? <TestTypes /> : <Navigate to="/more" replace />} />
        <Route path="/staff" element={me.isManager ? <Staff /> : <Navigate to="/more" replace />} />
        <Route path="/absences" element={<Absences />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/attendance/:id" element={<AttendanceSession />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="*" element={<NotReady title={t('noPage')} />} />
      </Routes>
    </Layout>
  );
}
