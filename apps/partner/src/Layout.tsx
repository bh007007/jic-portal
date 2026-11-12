import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { LANGS, t } from './i18n';
import { supabase } from './supabase';
import { adminUrl } from './adminPortal';
import { entryOf, menuFor, type MenuEntry, type MenuItem } from './menu';

/**
 * 에이전트 모드 배치(CL-041 디자인 원칙 2.6, CL-049): 왼쪽 사이드바 232px(차콜) + 본문 위 고정 막대.
 * 메뉴 내용은 CL-037, 보여 주는 방식은 CL-078(11/12): 사이드바는 1단계만, 2단계는 본문 위 탭(시제품 V74 방식).
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
  // 지금 화면이 속한 사이드바 메뉴(탭·상세 화면 포함)
  const current = entryOf(pathname, menu);
  const tag = (it: MenuItem) => !it.ready && <span className="tag">{t(it.phase2 ? 'common.phase2' : 'common.preparing')}</span>;
  const item = (e: MenuEntry) => (
    <Link key={e.to} to={go(e.to)} className={current?.key === e.key && allowed ? 'active' : ''} aria-current={current?.key === e.key && allowed ? 'page' : undefined}>
      {t(e.key)}
      {tag(e)}
    </Link>
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
        {/* CL-078: 사이드바는 1단계만 */}
        <nav className="snav" aria-label="주 메뉴">
          {menu.map((g, i) => (
            <div key={g.key ?? `gap-${i}`}>
              {g.key ? <div className="snav-group">{t(g.key)}</div> : i > 0 && <div className="snav-gap" />}
              {g.items.map(item)}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          {/* 관리 화면은 관리자 포털 '파트너 포털 관리' 메뉴(11/10 이전, CL-025) */}
          {staff && <a href={adminUrl()}>{t('nav.admin')} ↗</a>}
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
        <main className="content">
          {/* CL-078: 2단계는 페이지 안 탭 */}
          {allowed && current?.tabs && current.tabs.length > 1 && (
            <nav className="page-tabs" aria-label={t(current.key)}>
              {current.tabs.map((x) => (
                <NavLink key={x.to} to={x.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
                  {t(x.key)}
                  {tag(x)}
                </NavLink>
              ))}
            </nav>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
