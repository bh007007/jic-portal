import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { LANGS, t } from './i18n';
import { supabase } from './supabase';
import { adminUrl } from './adminPortal';
import { menuFor, type MenuItem } from './menu';

/**
 * 에이전트 모드 배치(CL-041 디자인 원칙 2.6, CL-049): 왼쪽 사이드바 232px(차콜) + 본문 위 고정 막대.
 * 메뉴 구조·순서·이름은 CL-037 그대로(D9). 사이드바 묶음은 펼친 채로 보인다.
 * 900px 아래에서는 사이드바가 옆으로 숨고 '메뉴' 단추로 연다(태블릿·모바일 세부 배치는 메뉴 확정 뒤, CL-042).
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { session, member, staff, allowed, agencyStaff } = useAuth();
  const menu = menuFor(agencyStaff);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 화면을 옮기면 (좁은 화면에서) 열린 사이드바를 닫는다
  useEffect(() => document.body.classList.remove('nav-open'), [pathname]);
  // 로그인 전에는 메뉴를 눌러도 로그인으로 보낸다(대시보드만 공개, 원칙 P2)
  const go = (to: string) => (allowed || to === '/' ? to : `/login?next=${encodeURIComponent(to)}`);
  const item = (it: MenuItem) => (
    <NavLink key={it.to} to={go(it.to)} className={({ isActive }) => (isActive && allowed ? 'active' : '')}>
      {t(it.key)}
      {!it.ready && <span className="tag">{t(it.phase2 ? 'common.phase2' : 'common.preparing')}</span>}
    </NavLink>
  );
  const who = member
    ? `${member.agency_name}${member.branch ? ' ' + member.branch : ''}${member.role === 'staff' ? ` · ${member.contact_name || '직원'}(직원)` : ''}`
    : staff ? 'JIC 관리자' : session?.user.email;

  // 상담 모드(CL-049): 사이드바·위 막대 없이 상담 화면만(학생이 봐도 되는 것만). 단계 막대와 '상담 끝내기'는 상담 화면이 그린다
  if (pathname === '/consult' && allowed) return <div className="consult-mode">{children}</div>;

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="logo">JIC</span>
          <span>
            <b>{t('brand.name')}</b>
            <small>JIC English Academy</small>
          </span>
        </Link>
        {/* CL-037 메뉴 구조 */}
        <nav className="snav" aria-label="주 메뉴">
          {menu.map((g) => {
            if (g.to) {
              return (
                <NavLink key={g.key} to={go(g.to)} end={g.to === '/'} className={({ isActive }) => (isActive && allowed ? 'active' : '')}>
                  {t(g.key)}
                  {g.phase2 && <span className="tag">{t('common.phase2')}</span>}
                </NavLink>
              );
            }
            return (
              <div key={g.key}>
                <div className="snav-group">{t(g.key)}</div>
                {(g.items ?? []).map((it) =>
                  'sub' in it ? (
                    <div key={it.key} className="snav-sub">
                      <span className="snav-sub-title">{t(it.key)}</span>
                      {it.sub.map(item)}
                    </div>
                  ) : (
                    item(it)
                  ),
                )}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          {/* 관리 화면은 관리자 포털 '파트너 포털 관리' 메뉴(11/10 이전, CL-025) */}
          {staff && <a href={adminUrl('agency-portal')}>{t('nav.admin')} ↗</a>}
          <span>{t('footer.org')}</span>
        </div>
      </aside>
      <div className="scrim" onClick={() => document.body.classList.remove('nav-open')} />
      <div className="main">
        <header className="top">
          <div className="top-row">
            <button type="button" className="btn btn-sm menu-toggle" aria-label="메뉴 열기" onClick={() => document.body.classList.add('nav-open')}>메뉴</button>
            {session && <span className="who">{who}</span>}
            <div className="top-right">
              {session ? (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t('top.lang')}
                    <select defaultValue="ko" aria-label={t('top.lang')}>
                      {LANGS.map((l) => (
                        <option key={l.code} value={l.code} disabled={!l.ready}>
                          {l.label}{l.ready ? '' : ` (${t('common.preparing')})`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {member && <Link to="/account">{t('top.account')}</Link>}
                  <button type="button" className="link" onClick={logout}>{t('top.logout')}</button>
                </>
              ) : (
                <>
                  <Link to="/login">{t('top.login')}</Link>
                  <Link to="/signup">{t('top.signup')}</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
