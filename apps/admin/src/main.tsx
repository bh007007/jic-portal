import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Hub from './pages/Hub';
import { ADMIN_PATH } from './portals';
import './styles.css';

// 주소 구조: / = JIC 포털 첫 화면(4개 포털), /admin/… = 관리자 포털. /intranet/… 은 인트라넷(따로 빌드, Pages Function).
// 예전 관리자 주소(/students 등)는 /admin 아래로 옮겨 즐겨찾기가 끊기지 않게 한다.
const { pathname, search, hash } = window.location;
const isHub = pathname === '/' || pathname === '/index.html';
const inAdmin = pathname === ADMIN_PATH || pathname.startsWith(ADMIN_PATH + '/');
if (!isHub && !inAdmin) window.location.replace(ADMIN_PATH + pathname + search + hash);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isHub ? (
      <Hub />
    ) : (
      <BrowserRouter basename={ADMIN_PATH} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);
