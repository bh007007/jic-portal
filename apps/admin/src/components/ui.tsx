import { useState, type ReactNode } from 'react';

/** 엑셀(CSV) 다운로드 버튼. run 이 끝날 때까지 다시 누를 수 없다. */
export function DownloadButton({ run }: { run: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onClick = async () => {
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (e) {
      setError('내려받지 못했습니다: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="download">
      {error && <span className="text-red" role="alert">{error}</span>}
      <button type="button" className="btn" onClick={onClick} disabled={busy}>
        {busy ? '내려받는 중…' : '엑셀 다운로드'}
      </button>
    </span>
  );
}

export function PageTitle({ title, path }: { title: string; path: string }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <span>{path}</span>
    </div>
  );
}

export function Panel({ title, extra, children, className }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'panel ' + (className ?? '')}>
      <div className="panel-head">
        <h2>{title}</h2>
        {extra}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="state-msg">{error ? `불러오지 못했습니다: ${error}` : '불러오는 중…'}</div>;
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <nav className="pagination" aria-label="페이지">
      <button type="button" aria-label="처음" disabled={page === 1} onClick={() => onPage(1)}>«</button>
      <button type="button" aria-label="이전" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      {nums.map((n) => (
        <button type="button" key={n} aria-current={n === page ? 'page' : undefined} className={n === page ? 'on' : ''} onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      <button type="button" aria-label="다음" disabled={page === pages} onClick={() => onPage(page + 1)}>›</button>
      <button type="button" aria-label="마지막" disabled={page === pages} onClick={() => onPage(pages)}>»</button>
    </nav>
  );
}

/** 목록 도구줄의 페이지당 개수. */
export function SizeSelect({ size, onChange }: { size: number; onChange: (size: string) => void }) {
  return (
    <select aria-label="페이지당 개수" value={String(size)} onChange={(e) => onChange(e.target.value)}>
      <option value="20">20개씩</option>
      <option value="50">50개씩</option>
      <option value="100">100개씩</option>
    </select>
  );
}

/** 통화별 금액: "JPY 304,000 · USD 3,360" */
export function currencyText(list: { currency: string; amount: number }[]) {
  return list.length ? list.map((c) => `${c.currency} ${c.amount.toLocaleString('ko-KR')}`).join(' · ') : '-';
}

export const STATUS_LABEL: Record<string, string> = { current: '재학', upcoming: '입학 예정', graduated: '졸업', cancelled: '취소', other: '기타' };

const PAY_CLASS: Record<string, string> = { 완납: 'text-blue', 부분납: 'text-amber', 미납: 'muted' };
export function PayText({ pay }: { pay: string }) {
  return <span className={PAY_CLASS[pay] ?? ''}>{pay || '-'}</span>;
}
