import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadStudents } from '../data';
import { useT } from '../i18n';
import { manilaToday } from '../supabase';
import { Loading, PageHead, fmtDate, useLoad } from '../ui';

/** 재학·30일 안 입학 학생. 업체 원본에서 화면에 쓰는 열만 함수(lms_students)로 받는다. */
export default function Students() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const campus = params.get('campus') ?? '';
  const tab = params.get('tab') === 'arriving' ? 'arriving' : 'current';
  const [kw, setKw] = useState(params.get('q') ?? '');
  const { data, error, loading } = useLoad(() => loadStudents(), []);
  const today = manilaToday();

  const campuses = useMemo(() => [...new Set((data ?? []).map((s) => s.campus).filter(Boolean))].sort(), [data]);
  const list = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return (data ?? [])
      .filter((s) => (tab === 'current' ? s.start_date <= today : s.start_date > today))
      .filter((s) => !campus || s.campus === campus)
      .filter((s) => !k || `${s.name} ${s.student_no} ${s.nation} ${s.course}`.toLowerCase().includes(k))
      .sort((a, b) => (tab === 'current' ? a.name.localeCompare(b.name) : a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)));
  }, [data, tab, campus, kw, today]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title={t('students')} sub={data ? t('people', { n: list.length }) : undefined} />
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'current'} onClick={() => set({ tab: '' })}>{t('current')}</button>
        <button type="button" role="tab" aria-selected={tab === 'arriving'} onClick={() => set({ tab: 'arriving' })}>{t('arriving30')}</button>
      </div>
      <div className="filters">
        <input type="search" placeholder={t('searchStudent')} value={kw} onChange={(e) => setKw(e.target.value)} aria-label={t('searchStudent')} />
        <select value={campus} onChange={(e) => set({ campus: e.target.value })} aria-label={t('campus')}>
          <option value="">{t('allCampuses')}</option>
          {campuses.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {loading || error ? (
        <Loading error={error} />
      ) : list.length === 0 ? (
        <div className="state">{t('noStudent')}</div>
      ) : (
        <ul className="cards">
          {list.map((s) => (
            <li key={s.enrollment_id}>
              <Link to={`/students/${s.student_no}`} className="card-link">
                <span className="card-top">
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.student_no}</span>
                </span>
                <span className="small">{s.nation} · {s.campus} · {s.course}</span>
                <span className="muted small">{fmtDate(s.start_date)} ~ {fmtDate(s.end_date)}{s.batch ? ` · ${s.batch}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
