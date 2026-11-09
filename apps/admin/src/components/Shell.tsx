import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApi } from '../api';
import { supabase, useIsAdmin } from '../supabase';
import { PORTALS } from '../portals';

const MENU: { group?: string; items: { to: string; label: string }[] }[] = [
  { items: [{ to: '/', label: '대시보드' }] },
  {
    group: '학생관리',
    items: [
      { to: '/students?tab=current', label: '재학생 현황' },
      { to: '/students?tab=upcoming', label: '입학 예정' },
      { to: '/arrivals', label: '입학 배치별 명단' },
      { to: '/students?tab=graduated', label: '졸업생' },
      { to: '/cancellations', label: '중단·연기 현황' },
      { to: '/extensions', label: '연장 현황' },
      { to: '/changes', label: '변경 이력' },
      { to: '/memos', label: '체크 메모' },
      { to: '/requests', label: '변경 요청' },
    ],
  },
  { group: '통계', items: [{ to: '/stats/calendar', label: '학생수 달력' }, { to: '/stats/registrations', label: '등록 현황' }] },
  { group: '기숙사', items: [{ to: '/dorm', label: '배정 현황' }, { to: '/rooms', label: '방·침대 관리' }] },
  { group: '회계', items: [{ to: '/invoices', label: '인보이스' }, { to: '/deposits', label: '입금 매칭' }, { to: '/points', label: '포인트' }] },
  { group: '에이전시', items: [{ to: '/agencies', label: '에이전시 목록' }, { to: '/agents', label: '담당자 계정' }, { to: '/agency-portal', label: '에이전시 포털 관리' }, { to: '/agency-content', label: '에이전시 포털 콘텐츠' }] },
  { group: '기초관리', items: [{ to: '/codes', label: '코스·기숙사' }, { to: '/prices', label: '가격표' }, { to: '/batches', label: '캠퍼스·배치' }, { to: '/holidays', label: '휴일' }, { to: '/users', label: '사용자·권한' }] },
];
// 관리자만 보는 메뉴(docs/roles.md: 사용자·권한은 오피스가 열 수 없다)
const ADMIN_ONLY = new Set(['/users']);

// 인트라넷: 배포에서는 같은 주소 아래 /intranet/(npm run portal:build, 같은 로그인), 로컬 개발은 인트라넷 개발 서버
const INTRANET_URL = import.meta.env.VITE_INTRANET_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5177' : '/intranet/');
// 강사 포털(LMS): 배포는 같은 주소 아래 /teacher/(같은 로그인), 로컬 개발은 강사 포털 개발 서버
const TEACHER_URL = PORTALS.find((p) => p.key === 'teacher')?.url ?? '/teacher/';

const today = new Date();
const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} (${'일월화수목금토'[today.getDay()]})`;

export default function Shell({ children, user }: { children: ReactNode; user?: string }) {
  const { data: meta } = useApi<{ source: 'sample' | 'extract' }>('/api/meta');
  const dataLabel = meta?.source === 'sample' ? '샘플 데이터' : supabase ? '운영 데이터' : '로컬 데이터';
  const isAdmin = useIsAdmin();
  // 휴대폰 폭(767px 이하)에서는 메뉴를 '메뉴' 단추 뒤로 접는다. 다른 화면으로 가면 닫는다
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenuOpen(false), [loc.pathname, loc.search]);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">통합관리</span>
        </Link>
        <button type="button" className="btn btn-xs menu-toggle" aria-expanded={menuOpen} aria-controls="sidenav" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '메뉴 닫기' : '메뉴'}
        </button>
        <div className="topbar-right">
          <span className="topbar-date">{todayLabel}</span>
          <span>
            <strong>{user ?? '레오'}</strong>님
          </span>
          <span className={'data-badge' + (meta?.source === 'sample' ? ' sample' : '')}>{dataLabel}</span>
          <a href="/" className="btn btn-xs">
            포털 홈
          </a>
          <a href={INTRANET_URL} className="btn btn-xs">
            인트라넷
          </a>
          <a href={TEACHER_URL} className="btn btn-xs">
            강사 포털
          </a>
          {supabase && (
            <button type="button" className="btn btn-xs" onClick={() => supabase?.auth.signOut()}>
              로그아웃
            </button>
          )}
        </div>
      </header>
      <div className="layout">
        <nav id="sidenav" className={'sidenav' + (menuOpen ? ' open' : '')} aria-label="메뉴">
          {MENU.map((sec, i) => (
            <div key={i}>
              {sec.group && <span className="nav-group">{sec.group}</span>}
              {sec.items.filter((it) => isAdmin !== false || !ADMIN_ONLY.has(it.to)).map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  className={({ isActive }) => (sec.group ? 'nav-item' : 'nav-top') + (isActive && matchesQuery(it.to) ? ' active' : '')}
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

// 같은 경로(/students)에 탭만 다른 메뉴가 여러 개라 쿼리까지 비교한다.
function matchesQuery(to: string) {
  const q = to.split('?')[1];
  if (!q) return true;
  const want = new URLSearchParams(q).get('tab');
  const have = new URLSearchParams(window.location.search).get('tab') ?? 'current';
  return want === have;
}
