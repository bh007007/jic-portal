import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errText } from './supabase';
import { useT, type Key } from './i18n';
import type { LmsAbsence } from './data';

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
  const { t } = useT();
  return <div className="state">{error ? `${t('loadFail')}: ${error}` : t('loading')}</div>;
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

/** 결석 신청 한 줄(홈·결석 신청 화면 공용): 이름, 처리 상태, 캠퍼스·교시·종류. 사유 글은 없다. */
/** 결석 신청 한 줄. bare 면 <li> 없이 칸만(처리 화면이 아래에 사유·버튼을 붙인다) */
export function AbsenceRow({ a, bare }: { a: LmsAbsence; bare?: boolean }) {
  const { t } = useT();
  const periods = a.periods.length ? t('periodsLabel', { p: a.periods.join('·') }) : t('allDay');
  const cells = (
    <>
      <Link to={`/students/${a.student_no}`}>{a.name || a.student_no}</Link>
      <span className={a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'err' : 'muted'}>{t(('st_' + a.status) as Key)}</span>
      <span className="muted small">{a.campus} · {periods} · {t(('abs_' + a.kind) as Key)}</span>
    </>
  );
  return bare ? cells : <li>{cells}</li>;
}
