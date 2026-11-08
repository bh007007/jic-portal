import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadRecentResults, loadStudents, loadTestTypes } from '../data';
import { useT } from '../i18n';
import { useAuth } from '../auth';
import ScoreForm from '../ScoreForm';
import { Loading, PageHead, Section, fmtDate, useLoad } from '../ui';

/** 성적 입력: 학생을 찾아 고른 뒤 바로 입력(휴대폰 기준). 아래에 최근 입력 30건. */
export default function Scores() {
  const { t } = useT();
  const { me } = useAuth();
  const canWrite = Boolean(me?.canWrite);
  const students = useLoad(() => loadStudents(), []);
  const types = useLoad(() => loadTestTypes(), []);
  const recent = useLoad(() => loadRecentResults(30), []);
  const [kw, setKw] = useState('');
  const [pick, setPick] = useState('');

  const matches = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return [];
    return (students.data ?? []).filter((s) => `${s.name} ${s.student_no}`.toLowerCase().includes(k)).slice(0, 8);
  }, [students.data, kw]);
  const chosen = (students.data ?? []).find((s) => s.enrollment_id === pick);
  const nameOf = (no: string) => (students.data ?? []).find((s) => s.student_no === no)?.name ?? '';

  if (students.loading || types.loading) return <Loading />;
  if (students.error || types.error) return <Loading error={students.error || types.error} />;

  return (
    <>
      <PageHead title={t(canWrite ? 'enterScores' : 'scoreRecords')} right={canWrite ? <Link to="/scores/batch" className="btn btn-xs">{t('manyAtOnce')}</Link> : undefined} />
      {!canWrite && <p className="muted">{t('scoresReadOnly')}</p>}
      {canWrite && <Section title={t('pickStudent')}>
        {chosen ? (
          <div className="picked">
            <span><strong>{chosen.name}</strong> <span className="muted small">{chosen.student_no} · {chosen.campus} · {chosen.course}</span></span>
            <button type="button" className="btn btn-xs" onClick={() => { setPick(''); setKw(''); }}>{t('change')}</button>
          </div>
        ) : (
          <>
            <input type="search" className="full" placeholder={t('searchNameNo')} value={kw} onChange={(e) => setKw(e.target.value)} aria-label={t('searchNameNo')} />
            <ul className="pick-list">
              {matches.map((s) => (
                <li key={s.enrollment_id}>
                  <button type="button" onClick={() => setPick(s.enrollment_id)}>
                    <strong>{s.name}</strong> <span className="muted small">{s.student_no} · {s.campus}</span>
                  </button>
                </li>
              ))}
              {kw.trim() && matches.length === 0 && <li className="muted small">{t('noMatch')}</li>}
            </ul>
          </>
        )}
      </Section>}

      {canWrite && chosen && (
        <Section title={t('points')}>
          <ScoreForm student={chosen} types={types.data ?? []} onSaved={recent.reload} />
        </Section>
      )}

      <Section title={t('recent30')}>
        {(recent.data ?? []).length === 0 ? (
          <p className="muted">{t('noScores')}</p>
        ) : (
          <ul className="rows">
            {(recent.data ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/students/${r.student_no}`}>{nameOf(r.student_no) || r.student_no}</Link>
                <span>{r.test_type.toUpperCase()}{r.section ? ` ${r.section}` : ''} <strong>{r.value}</strong></span>
                <span className="muted small">{fmtDate(r.test_date)} · {r.teacher_name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
