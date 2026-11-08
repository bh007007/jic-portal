import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { errText } from './supabase';

/** 비동기 읽기. reload() 로 다시 읽는다. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fn()
      .then((data) => alive && setState({ data, error: '', loading: false }))
      .catch((e) => alive && setState({ data: null, error: errText(e), loading: false }));
    return () => {
      alive = false;
    };
  }, [tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function Loading({ error }: { error?: string }) {
  return <div className="state">{error ? `불러오지 못했습니다: ${error}` : '불러오는 중…'}</div>;
}

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Section({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** 저장 버튼 상태와 오류 문구를 같이 다룬다. */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export const fmtDate = (d: string) => (d ? d.slice(0, 10) : '-');
