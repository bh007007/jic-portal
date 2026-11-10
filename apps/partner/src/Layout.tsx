import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { LANGS, t, type MsgKey } from './i18n';
import { supabase } from './supabase';
import { adminUrl } from './adminPortal';

const NAV: [string, MsgKey][] = [
  ['/consult', 'nav.consult'],
  ['/campuses', 'nav.campuses'],
  ['/quote', 'nav.quote'],
  ['/vacancy', 'nav.vacancy'],
  ['/register', 'nav.register'],
  ['/resources', 'nav.resources'],
  ['/notices', 'nav.notices'],
  ['/visit', 'nav.visit'],
];

export default function Layout({ children }: { children: ReactNode }) {
  const { session, member, staff, allowed } = useAuth();
  const navigate = useNavigate();
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
          <nav className="nav" aria-label="주 메뉴">
            {NAV.map(([to, key]) => (
              <NavLink key={to} to={allowed ? to : `/login?next=${encodeURIComponent(to)}`} className={({ isActive }) => (isActive && allowed ? 'active' : '')}>
                {t(key)}
              </NavLink>
            ))}
            <span className="off">
              {t('nav.students')} <span className="chip">{t('common.preparing')}</span>
            </span>
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
