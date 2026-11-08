import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t } from './i18n';

export function PageHead({ title, side }: { title: string; side?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {side && <div className="side">{side}</div>}
    </div>
  );
}

export function Box({ title, extra, children, className, foot }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; foot?: ReactNode }) {
  return (
    <section className={'box ' + (className ?? '')}>
      {title && (
        <div className="box-head">
          <h2>{title}</h2>
          {extra}
        </div>
      )}
      {children}
      {foot && <div className="box-foot">{foot}</div>}
    </section>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="state">{error ? `불러오지 못했습니다: ${error}` : t('common.loading')}</div>;
}

export function Msg({ kind, children }: { kind: 'ok' | 'err' | 'warn'; children: ReactNode }) {
  return (
    <div className={'msg ' + kind} role={kind === 'err' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** 값이 없으면 '내용 입력 전'(원칙 C8: 확인된 내용만 표시). */
export function Text({ value }: { value?: string | null }) {
  return value ? <span className="pre">{value}</span> : <span className="muted">{t('common.empty')}</span>;
}

/** 외부 링크. 주소가 아직 없으면 버튼 대신 안내. */
export function OutLink({ href, children, className = 'btn' }: { href?: string | null; children: ReactNode; className?: string }) {
  if (!href) return <span className="muted">주소 입력 전</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}

export function Preparing({ title }: { title: string }) {
  return (
    <>
      <PageHead title={title} />
      <div className="state">
        {t('common.preparing')}입니다. <Link to="/">홈으로</Link>
      </div>
    </>
  );
}

export const TAG_COLOR: Record<string, string> = { 중요: 'var(--red)', 변경: 'var(--amber)', 안내: 'var(--ink-2)' };
