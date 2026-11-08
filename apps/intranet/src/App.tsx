import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
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
import Reports from './pages/Reports';
import Requests from './pages/Requests';
import PenaltyRules from './pages/PenaltyRules';
import Settings from './pages/Settings';
import StudentFileDetail from './pages/StudentFileDetail';
import StudentFiles from './pages/StudentFiles';

export default function App() {
  return (
    <Routes>
      {/* 가드 태블릿은 메뉴 없이 전체 화면 */}
      <Route path="/guard" element={<Guard />} />
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
}
