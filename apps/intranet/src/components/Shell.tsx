import { ADMIN_HOME } from '../base';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { setStaffName, useApi, useStaffName, useSummaryChanged, type Meta, type Summary } from '../api';
import { authMode, signOut } from '../auth';
import { dateWithDay, localDate } from '../format';

// 디자인 I1(IntranetPenalty.dc.html)의 메뉴. 아직 없는 화면은 '준비 중'으로 연결된다.
type Badge = 'pending' | 'pendingAbsences' | 'pendingOvernights' | 'lifePending' | 'followUpDue' | 'unreadNotices' | 'ridePending';
// adminOnly: 관리자만 여는 화면, manager: 강사 포털 매니저에게도 보이는 화면(docs/roles.md). 나머지는 숨긴다(주소로 열어도 서버가 막는다).
const MENU: { group?: string; items: { to: string; label: string; badge?: Badge; adminOnly?: true; manager?: true }[] }[] = [
  { items: [{ to: '/', label: '홈', manager: true }] },
  { group: '공지·결재', items: [{ to: '/notices', label: '내부 공지', badge: 'unreadNotices', manager: true }, { to: '/approvals', label: '전자결재' }, { to: '/forms', label: '양식·자료실' }] },
  {
    group: '학생 생활',
    items: [
      { to: '/student-file', label: 'Student File', manager: true },
      { to: '/accounts', label: '학생 계정' },
      { to: '/counseling', label: '상담 기록', badge: 'followUpDue' },
      { to: '/penalties', label: '패널티 승인', badge: 'pending', manager: true },
      { to: '/penalty-rules', label: '패널티 점수표', manager: true },
      { to: '/outings', label: '외출·귀가', manager: true },
      { to: '/curfew', label: '통금 확인', manager: true },
      { to: '/reports', label: '가드 리포트', manager: true },
      { to: '/departures', label: '귀국 일정', badge: 'ridePending' },
      { to: '/photos', label: '사진 관리' },
    ],
  },
  // 논아카데믹 신청: 외박·여행, 생활 요청, 학교 여행(직원이 올리고 학생이 참가 신청)
  {
    group: '신청 처리',
    items: [
      { to: '/requests/absences', label: '결석 신청', badge: 'pendingAbsences', manager: true },
      { to: '/requests/overnights', label: '외박·여행 신청', badge: 'pendingOvernights' },
      { to: '/requests/life', label: '생활 요청', badge: 'lifePending' },
      { to: '/trips', label: '학교 여행', manager: true },
    ],
  },
  { group: '직원', items: [{ to: '/guard-accounts', label: '가드 계정' }, { to: '/staff', label: '직원·부서' }, { to: '/staff-review', label: 'Staff 평가' }, { to: '/audit', label: '접근 기록', adminOnly: true }] },
];


export default function Shell({ children }: { children: ReactNode }) {
  const { data: meta } = useApi<Meta>('/api/meta');
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
          <a href={ADMIN_HOME} className="btn btn-xs">
            통합관리
          </a>
        </div>
      </header>
      <div className="layout">
        <nav className="sidenav" aria-label="메뉴">
          {MENU.map((sec) => ({ ...sec, items: sec.items.filter((it) => (meta?.role === 'manager' ? it.manager : !it.adminOnly || meta?.staffRole !== 'office')) }))
            .filter((sec) => sec.items.length)
            .map((sec, i) => (
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
