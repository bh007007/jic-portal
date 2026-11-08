import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { setStaffName, useApi, useStaffName, useSummaryChanged, type Summary } from '../api';
import { authMode, signOut } from '../auth';
import { dateWithDay, localDate } from '../format';

// 디자인 I1(IntranetPenalty.dc.html)의 메뉴. 아직 없는 화면은 '준비 중'으로 연결된다.
type Badge = 'pending' | 'pendingAbsences' | 'pendingOvernights' | 'lifePending' | 'followUpDue' | 'unreadNotices' | 'ridePending';
const MENU: { group?: string; items: { to: string; label: string; badge?: Badge }[] }[] = [
  { items: [{ to: '/', label: '홈' }] },
  { group: '공지·결재', items: [{ to: '/notices', label: '내부 공지', badge: 'unreadNotices' }, { to: '/approvals', label: '전자결재' }, { to: '/forms', label: '양식·자료실' }] },
  {
    group: '학생 생활',
    items: [
      { to: '/student-file', label: 'Student File' },
      { to: '/counseling', label: '상담 기록', badge: 'followUpDue' },
      { to: '/penalties', label: '패널티 승인', badge: 'pending' },
      { to: '/penalty-rules', label: '패널티 점수표' },
      { to: '/outings', label: '외출·귀가' },
      { to: '/curfew', label: '통금 확인' },
      { to: '/reports', label: '가드 리포트' },
      { to: '/departures', label: '귀국 일정', badge: 'ridePending' },
      { to: '/photos', label: '사진 관리' },
    ],
  },
  // 외박은 논아카데믹 신청의 첫 종류다. 여행·기타 신청이 생기면 같은 묶음에 더한다.
  {
    group: '신청 처리',
    items: [
      { to: '/requests/absences', label: '결석 신청', badge: 'pendingAbsences' },
      { to: '/requests/overnights', label: '외박 신청', badge: 'pendingOvernights' },
      { to: '/requests/life', label: '생활 요청', badge: 'lifePending' },
    ],
  },
  { group: '직원', items: [{ to: '/staff', label: '직원·부서' }, { to: '/staff-review', label: 'Staff 평가' }, { to: '/audit', label: '접근 기록' }] },
];

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://127.0.0.1:5173';

export default function Shell({ children }: { children: ReactNode }) {
  const { data: meta } = useApi<{ source: 'sample' | 'extract'; actor: string | null }>('/api/meta');
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
          {authMode === 'supabase' ? <LoggedIn name={meta?.actor ?? null} /> : <StaffName />}
          <span className={'data-badge' + (meta?.source === 'sample' ? ' sample' : '')}>{meta?.source === 'sample' ? '샘플 데이터' : authMode === 'supabase' ? '업체 데이터' : '로컬 데이터'}</span>
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
                  {it.badge && summary && summary[it.badge] > 0 && <span className="nav-count">{summary[it.badge]}</span>}
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

/** 배포: 로그인한 직원 이름(staff_users.name, 처리자로 남는다)과 로그아웃 */
function LoggedIn({ name }: { name: string | null }) {
  return (
    <span>
      {name && (
        <>
          <strong>{name}</strong>님{' '}
        </>
      )}
      <button type="button" className="link-btn small" onClick={() => void signOut()}>
        로그아웃
      </button>
    </span>
  );
}

/** 로컬 전용: 상담 기록 작성·열람자로 남길 직원 이름. 배포에서는 로그인한 직원 이름이 들어간다. */
function StaffName() {
  const name = useStaffName();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (name && !editing)
    return (
      <span>
        <strong>{name}</strong>님{' '}
        <button
          type="button"
          className="link-btn small"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          변경
        </button>
      </span>
    );
  const save = (e: FormEvent) => {
    e.preventDefault();
    setStaffName(value);
    setEditing(false);
  };
  return (
    <form className="staff-form" onSubmit={save}>
      <input className="cell-input" aria-label="직원 이름" placeholder="직원 이름" maxLength={40} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="btn btn-xs">
        저장
      </button>
    </form>
  );
}
