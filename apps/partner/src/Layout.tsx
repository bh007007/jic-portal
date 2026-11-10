import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { LANGS, t } from './i18n';
import { supabase } from './supabase';
import { adminUrl } from './adminPortal';
import { MENU, type MenuItem } from './menu';


export default function Layout({ children }: { children: ReactNode }) {
  const { session, member, staff, allowed } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 로그인 전에는 메뉴를 눌러도 로그인으로 보낸다(대시보드만 공개, 원칙 P2)
  const go = (to: string) => (allowed || to === '/' ? to : `/login?next=${encodeURIComponent(to)}`);
  const item = (it: MenuItem) => (
    <NavLink key={it.to} to={go(it.to)} className={({ isActive }) => (isActive && allowed ? 'active' : '')}>
      {t(it.key)}
      {!it.ready && <span className="chip">{t(it.phase2 ? 'common.phase2' : 'common.preparing')}</span>}
    </NavLink>
  );
  const who = member ? `${member.agency_name}${member.branch ? ' ' + member.branch : ''}` : staff ? 'JIC 관리자' : session?.user.email;

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <>
      <header className="top">
        <div className="top-bar">
          {session ? (
            <>
              <span><strong style={{ color: 'var(--ink)' }}>{who}</strong></span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
        <div className="top-main">
          <Link to="/" className="logo">
            <span className="logo-mark">JIC</span>
            <span className="logo-name">{t('brand.name')}</span>
          </Link>
          {/* CL-037 메뉴 구조. 묶음은 마우스를 올리거나 단추에 포커스하면 펼쳐진다 */}
          <nav className="nav" aria-label="주 메뉴">
            {MENU.map((g) => {
              if (g.to) {
                return (
                  <NavLink key={g.key} to={go(g.to)} end={g.to === '/'} className={({ isActive }) => (isActive && allowed ? 'active' : '')}>
                    {t(g.key)}
                    {g.phase2 && <span className="chip">{t('common.phase2')}</span>}
                  </NavLink>
                );
              }
              const paths = (g.items ?? []).flatMap((it) => ('sub' in it ? it.sub.map((x) => x.to) : [it.to]));
              const here = allowed && paths.some((p) => pathname === p || pathname.startsWith(p + '/'));
              return (
                <div key={g.key} className={'nav-group' + (here ? ' active' : '')}>
                  <button type="button" className="nav-head" aria-haspopup="true">{t(g.key)}</button>
                  <div className="nav-drop">
                    {(g.items ?? []).map((it) =>
                      'sub' in it ? (
                        <div key={it.key} className="nav-sub">
                          <span className="nav-sub-title">{t(it.key)}</span>
                          {it.sub.map(item)}
                        </div>
                      ) : (
                        item(it)
                      ),
                    )}
                  </div>
                </div>
              );
            })}
            {/* 관리 화면은 관리자 포털 '파트너 포털 관리' 메뉴(11/10 이전, CL-025) */}
            {staff && <a href={adminUrl('agency-portal')}>{t('nav.admin')} ↗</a>}
          </nav>
        </div>
      </header>
      <main className="wrap main">{children}</main>
      <footer className="foot">
        <div className="wrap">
          <span>{t('footer.org')}</span>
          <span>{session ? <Link to="/notices" style={{ color: 'inherit' }}>{t('nav.notices')}</Link> : null}</span>
        </div>
      </footer>
    </>
  );
}
