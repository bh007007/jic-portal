import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Dorm from './pages/Dorm';
import NotReady from './pages/NotReady';

export default function App() {
  return (
    <Shell>
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
