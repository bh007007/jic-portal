import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { authMode, signOut, useSession } from './auth';
import Shell from './components/Shell';
import { useApi } from './api';
import Login from './pages/Login';
import Audit from './pages/Audit';
import Counseling from './pages/Counseling';
import CounselingDetail from './pages/CounselingDetail';
import CounselingForm from './pages/CounselingForm';
import Guard from './pages/Guard';
import Home from './pages/Home';
import NoticeDetail from './pages/NoticeDetail';
import NoticeForm from './pages/NoticeForm';
import Notices from './pages/Notices';
import NotReady from './pages/NotReady';
import Outings from './pages/Outings';
import Penalties from './pages/Penalties';
import Departures from './pages/Departures';
import Reports from './pages/Reports';
import Requests from './pages/Requests';
import PenaltyRules from './pages/PenaltyRules';
import Settings from './pages/Settings';
import StudentFileDetail from './pages/StudentFileDetail';
import StudentFiles from './pages/StudentFiles';

/** 배포: 로그인한 계정이 직원(staff_users)이 아니면 안내만 한다. */
function StaffGate({ children }: { children: ReactNode }) {
  const { error } = useApi<{ source: string }>('/api/meta');
  if (error !== 'staff_only') return <>{children}</>;
  return (
    <div className="login">
      <div className="login-box">
        <div className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">인트라넷</span>
        </div>
        <p className="login-error">직원 계정으로 등록되지 않았습니다. 관리자에게 등록을 요청하세요.</p>
        <button type="button" className="btn" onClick={() => void signOut()}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

/** 배포: 가드 태블릿은 가드 공용 계정을 연결한 뒤에 연다(docs/intranet.md '배포'). */
function GuardNotReady() {
  return (
    <div className="login">
      <div className="login-box">
        <div className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">가드</span>
        </div>
        <p className="login-foot">가드 태블릿은 가드 공용 계정을 연결한 뒤 이 주소에서 씁니다.</p>
      </div>
    </div>
  );
}

export default function App() {
  const session = useSession();
  if (authMode === 'supabase' && session === 'loading') return <div className="login" />;
  if (authMode === 'supabase' && !session) return <Login />;
  const routes = (
    <Routes>
      {/* 가드 태블릿은 메뉴 없이 전체 화면 */}
      <Route path="/guard" element={authMode === 'supabase' ? <GuardNotReady /> : <Guard />} />
      <Route
        path="*"
        element={
          <Shell>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/penalties" element={<Penalties />} />
              <Route path="/penalty-rules" element={<PenaltyRules />} />
              <Route path="/outings" element={<Outings key="outings" mode="outings" />} />
              <Route path="/curfew" element={<Outings key="curfew" mode="curfew" />} />
              <Route path="/requests/absences" element={<Requests key="absences" kind="absences" />} />
              <Route path="/requests/overnights" element={<Requests key="overnights" kind="overnights" />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/counseling" element={<Counseling />} />
              <Route path="/counseling/new" element={<CounselingForm key="new" />} />
              <Route path="/counseling/:id" element={<CounselingDetail />} />
              <Route path="/counseling/:id/edit" element={<CounselingForm key="edit" />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/departures" element={<Departures />} />
              <Route path="/notices" element={<Notices />} />
              <Route path="/notices/new" element={<NoticeForm key="new" />} />
              <Route path="/notices/:id" element={<NoticeDetail />} />
              <Route path="/notices/:id/edit" element={<NoticeForm key="edit" />} />
              <Route path="/student-file" element={<StudentFiles />} />
              <Route path="/student-file/:stId" element={<StudentFileDetail />} />
              <Route path="*" element={<NotReady />} />
            </Routes>
          </Shell>
        }
      />
    </Routes>
  );
  return authMode === 'supabase' ? <StaffGate>{routes}</StaffGate> : routes;
}
