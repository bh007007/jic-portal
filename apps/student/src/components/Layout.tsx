import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { IconBack, IconForm, IconHome, IconUser } from './icons';

export function Header({ sample }: { sample: boolean }) {
  const { t, nextLang } = useI18n();
  return (
    <header className="app-header">
      <Link to="/" className="app-brand">
        <span className="app-brand-mark">JIC</span>
        <span className="app-brand-name">{t('app.name')}</span>
        {sample && <span className="sample-tag">{t('data.sample')}</span>}
      </Link>
      <button type="button" className="lang-btn" aria-label={t('lang.change')} onClick={nextLang}>
        {t('lang.label')}
      </button>
    </header>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const items = [
    { to: '/', label: t('nav.home'), icon: <IconHome />, end: true },
    { to: '/requests', label: t('nav.requests'), icon: <IconForm size={22} w={1.8} />, end: false },
    { to: '/me', label: t('nav.me'), icon: <IconUser size={22} w={1.8} />, end: true },
  ];
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end}>
          {it.icon}
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** 하위 화면 제목 줄(뒤로 가기 + 제목) */
export function SubTitle({ title, back = -1 }: { title: string; back?: string | -1 }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = () => {
    if (back === -1 && window.history.length > 1) navigate(-1);
    else navigate(back === -1 ? '/' : back);
  };
  return (
    <div className="sub-title">
      <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={goBack}>
        <IconBack />
      </button>
      <h1>{title}</h1>
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return <p className="state-msg">{t('common.loading')}</p>;
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <p className="state-msg">
      {t('common.error')}{' '}
      <button type="button" className="link-btn" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </p>
  );
}

export function Section({ title, action, children, labelId }: { title: ReactNode; action?: ReactNode; children: ReactNode; labelId: string }) {
  return (
    <section className="list-section" aria-labelledby={labelId}>
      <div className="list-head">
        <h2 id={labelId}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
