import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './auth';
import { useT, type Key } from './i18n';
import { PORTAL_HOME } from './links';
import { supabase } from './supabase';

// 원칙 L7: 강사 화면은 휴대폰 기준. 아래쪽 메뉴 5개, 관리 화면은 '더보기'에 모은다.
const NAV: [string, Key][] = [
  ['/', 'nav_home'],
  ['/students', 'nav_students'],
  ['/scores', 'nav_scores'],
  ['/materials', 'nav_materials'],
  ['/more', 'nav_more'],
];

export default function Layout({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const { t, lang, setLang } = useT();
  return (
    <div className="shell">
      <header className="top">
        <a href={PORTAL_HOME} className="brand" title={t('portalHome')}>
          <span className="brand-mark">JIC</span>
          <span className="brand-name">{t('appName')}</span>
        </a>
        <div className="top-right">
          {me && (
            <span className="who">
              {me.name}
              <span className="muted"> · {me.roles.map((r) => t(('role_' + r) as Key)).join(', ') || t('noRole')}</span>
            </span>
          )}
          <button type="button" className="btn btn-xs" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} aria-label="Language">{lang === 'ko' ? 'EN' : '한국어'}</button>
          <button type="button" className="btn btn-xs" onClick={() => supabase.auth.signOut()}>{t('logout')}</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="bottom" aria-label="Menu">
        {NAV.map(([to, key]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t(key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
