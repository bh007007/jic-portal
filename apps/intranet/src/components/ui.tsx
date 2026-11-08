import type { ReactNode } from 'react';

export function PageTitle({ title, path, actions }: { title: string; path: string; actions?: ReactNode }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <span>{path}</span>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="state-msg">
      {error ? `불러오지 못했습니다 (${error}). ` : '불러오는 중…'}
      {error && onRetry && (
        <button type="button" className="btn btn-xs" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

/** 탭 줄: [{ key, label }] */
export function Tabs({ items, value, onChange, label }: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
      <div className="fill" />
    </div>
  );
}
