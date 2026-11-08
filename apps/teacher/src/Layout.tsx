import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL, useAuth } from './auth';
import { supabase } from './supabase';

// JIC 포털 첫 화면: 배포는 같은 주소의 '/', 로컬은 관리자 앱 개발 서버
const PORTAL_HOME = import.meta.env.VITE_PORTAL_HOME ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/' : '/');

// 원칙 L7: 강사 화면은 휴대폰 기준. 아래쪽 메뉴 5개, 관리 화면은 '관리'에 모은다.
const NAV: [string, string][] = [
  ['/', '홈'],
  ['/students', '학생'],
  ['/scores', '성적'],
  ['/materials', '자료실'],
  ['/more', '더보기'],
];

export default function Layout({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return (
    <div className="shell">
      <header className="top">
        <a href={PORTAL_HOME} className="brand" title="JIC 포털 첫 화면">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">강사 포털</span>
        </a>
        <div className="top-right">
          {me && (
            <span className="who">
              {me.name}
              <span className="muted"> · {me.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') || '역할 없음'}</span>
            </span>
          )}
          <button type="button" className="btn btn-xs" onClick={() => supabase.auth.signOut()}>로그아웃</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="bottom" aria-label="메뉴">
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
