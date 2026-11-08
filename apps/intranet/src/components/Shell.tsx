import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApi, useSummaryChanged, type Summary } from '../api';
import { dateWithDay, localDate } from '../format';

// 디자인 I1(IntranetPenalty.dc.html)의 메뉴. 아직 없는 화면은 '준비 중'으로 연결된다.
const MENU: { group?: string; items: { to: string; label: string; badge?: 'pending' }[] }[] = [
  { items: [{ to: '/', label: '홈' }] },
  { group: '공지·결재', items: [{ to: '/notices', label: '내부 공지' }, { to: '/approvals', label: '전자결재' }, { to: '/forms', label: '양식·자료실' }] },
  {
    group: '학생 생활',
    items: [
      { to: '/student-file', label: 'Student File' },
      { to: '/counseling', label: '상담 기록' },
      { to: '/penalties', label: '패널티 승인', badge: 'pending' },
      { to: '/penalty-rules', label: '패널티 점수표' },
      { to: '/outings', label: '외출·귀가' },
      { to: '/curfew', label: '통금 확인' },
      { to: '/photos', label: '사진 관리' },
    ],
  },
  { group: '신청 처리', items: [{ to: '/requests', label: '논아카데믹 신청' }] },
  { group: '직원', items: [{ to: '/staff', label: '직원·부서' }, { to: '/staff-review', label: 'Staff 평가' }] },
];

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://127.0.0.1:5173';

export default function Shell({ children }: { children: ReactNode }) {
  const { data: meta } = useApi<{ source: 'sample' | 'extract' }>('/api/meta');
  const { data: summary, reload: reloadSummary } = useApi<Summary>('/api/summary', 60000);
  useSummaryChanged(reloadSummary);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">인트라넷</span>
        </Link>
        <div className="topbar-right">
          <span>{dateWithDay(localDate(Date.now()))}</span>
          <span className={'data-badge' + (meta?.source === 'sample' ? ' sample' : '')}>{meta?.source === 'sample' ? '샘플 데이터' : '로컬 데이터'}</span>
          <a href={ADMIN_URL} className="btn btn-xs">
            통합관리
          </a>
        </div>
      </header>
      <div className="layout">
        <nav className="sidenav" aria-label="메뉴">
          {MENU.map((sec, i) => (
            <div key={i}>
              {sec.group && <span className="nav-group">{sec.group}</span>}
              {sec.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => (sec.group ? 'nav-item' : 'nav-top') + (isActive ? ' active' : '')}>
                  {it.label}
                  {it.badge === 'pending' && summary && summary.pending > 0 && <span className="nav-count">{summary.pending}</span>}
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
