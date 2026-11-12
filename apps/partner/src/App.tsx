import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import CoursesIndex from './pages/CoursesIndex';
import Newsletter from './pages/Newsletter';
import Tuition from './pages/Tuition';
import Play from './pages/content/Play';
import Evidence from './pages/content/Evidence';
import Playbook from './pages/content/Playbook';
import Faq from './pages/content/Faq';
import { AboutSection, SchoolStats, Teachers } from './pages/content/About';
import { Activities, Calendar, Day } from './pages/content/Life';
import Camps from './pages/content/Camps';
import CampusCompare from './pages/CampusCompare';
import Contacts from './pages/content/Contacts';
import { Arrivals, StudentDetail, StudentList } from './pages/students/MyStudents';
import { PENDING_ROUTES, staffCanSee } from './menu';
import { t } from './i18n';

/** 승인된 파트너 또는 JIC 직원만. 로그인 전이면 로그인으로, 승인 전이면 대기 화면. 지점 직원 아이디는 상담·자료·공지만(CL-032). */
function Member({ children }: { children: ReactNode }) {
  const { session, allowed, agencyStaff } = useAuth();
  const loc = useLocation();
  if (session === undefined) return <Loading />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!allowed) return <Pending />;
  if (agencyStaff && !staffCanSee(loc.pathname)) return <OwnerOnly />;
  return <>{children}</>;
}

function OwnerOnly() {
  return (
    <div className="state">
      지점 대표 아이디만 볼 수 있는 화면입니다. 직원 아이디는 상담·자료·공지를 볼 수 있습니다.
      <div style={{ marginTop: 12 }}><Link className="btn" to="/">홈으로</Link></div>
    </div>
  );
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
        <Route path="/signup/staff" element={<Signup staff />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/account" element={<Member><Account /></Member>} />
        <Route path="/consult" element={<Member><Consult /></Member>} />
        <Route path="/campuses" element={<Member><Campuses /></Member>} />
        {/* CL-077·079(11/12): 캠퍼스 › 캠퍼스 한눈에 보기, 캠프는 캠퍼스 목록 안 */}
        <Route path="/campuses/compare" element={<Member><CampusCompare /></Member>} />
        <Route path="/campuses/camp" element={<Member><Camps /></Member>} />
        <Route path="/campuses/:id" element={<Member><CampusPage /></Member>} />
        <Route path="/courses" element={<Member><CoursesIndex /></Member>} />
        <Route path="/courses/:id" element={<Member><CoursePage /></Member>} />
        <Route path="/newsletter" element={<Member><Newsletter /></Member>} />
        <Route path="/tuition" element={<Member><Tuition /></Member>} />
        {/* 화면 콘텐츠(관리자 포털 '파트너 포털 관리', CL-045). 게시 전이면 각 화면이 '준비 중' */}
        <Route path="/play" element={<Member><Play /></Member>} />
        <Route path="/evidence" element={<Member><Evidence /></Member>} />
        <Route path="/playbook" element={<Member><Playbook /></Member>} />
        <Route path="/faq" element={<Member><Faq /></Member>} />
        <Route path="/about/baguio" element={<Member><AboutSection section="왜 바기오·주변" titleKey="menu.baguio" /></Member>} />
        <Route path="/about/why-jic" element={<Member><AboutSection section="왜 JIC" titleKey="menu.whyJic" /></Member>} />
        <Route path="/about/teachers" element={<Member><Teachers /></Member>} />
        <Route path="/about/school" element={<Member><SchoolStats /></Member>} />
        <Route path="/day" element={<Member><Day /></Member>} />
        {/* 예전 주소(코스·생활 › 캠프, CL-077 삭제) */}
        <Route path="/camps" element={<Navigate to="/campuses/camp" replace />} />
        <Route path="/life/calendar" element={<Member><Calendar /></Member>} />
        <Route path="/life/activities" element={<Member><Activities /></Member>} />
        <Route path="/contacts" element={<Member><Contacts /></Member>} />
        {/* CL-037 메뉴 중 아직 화면이 없는 곳(인보이스 등): 준비 중 또는 2차 */}
        {PENDING_ROUTES.map((it) => (
          <Route key={it.to} path={it.to} element={<Member><Preparing title={t(it.key)} /></Member>} />
        ))}
        <Route path="/quote" element={<Member><Quote /></Member>} />
        <Route path="/vacancy" element={<Member><Vacancy /></Member>} />
        <Route path="/register" element={<Member><Register /></Member>} />
        <Route path="/resources" element={<Member><Resources /></Member>} />
        <Route path="/notices" element={<Member><Notices /></Member>} />
        <Route path="/notices/:id" element={<Member><NoticeDetail /></Member>} />
        <Route path="/visit" element={<Member><Visit /></Member>} />
        {/* My Students(CL-051): 2차 연동 전까지 예시 데이터로 화면 모양만 */}
        <Route path="/students" element={<Member><StudentList /></Member>} />
        <Route path="/students/arrivals" element={<Member><Arrivals /></Member>} />
        <Route path="/students/:id" element={<Member><StudentDetail /></Member>} />
        <Route path="/admin/*" element={<Staff><AdminMoved /></Staff>} />
        <Route path="*" element={<Preparing title="페이지를 찾을 수 없습니다" />} />
      </Routes>
    </Layout>
  );
}
