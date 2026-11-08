import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { loadAbsences, loadRecentResults, loadStudents } from '../data';
import { useT } from '../i18n';
import { manilaToday } from '../supabase';
import { AbsenceRow, PageHead, Section, fmtDate, useLoad } from '../ui';

export default function Home() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const today = manilaToday();
  const students = useLoad(() => loadStudents(), []);
  const recent = useLoad(() => loadRecentResults(8), []);
  const absences = useLoad(() => loadAbsences(), []);
  const current = (students.data ?? []).filter((s) => s.start_date <= today);
  const arriving = (students.data ?? []).filter((s) => s.start_date > today);
  const nameOf = new Map((students.data ?? []).map((s) => [s.student_no, s.name]));
  const byCampus = new Map<string, number>();
  for (const s of current) byCampus.set(s.campus || '-', (byCampus.get(s.campus || '-') ?? 0) + 1);
  const dayName = new Date(today + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' });

  return (
    <>
      <PageHead title={`${today} (${dayName})`} sub={t('hello', { name: me?.name ?? '' })} />

      <Section title={t('todayClass')}>
        <p className="muted">{t('todayClassNote')}</p>
      </Section>

      <Section title={t('todayAbsences')} extra={<Link to="/absences" className="more">{t('byDate')}</Link>}>
        {absences.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : absences.error ? (
          <p className="err">{absences.error}</p>
        ) : (absences.data ?? []).length === 0 ? (
          <p className="muted">{t('noAbsenceToday')}</p>
        ) : (
          <ul className="rows">{(absences.data ?? []).map((a) => <AbsenceRow key={a.id} a={a} />)}</ul>
        )}
      </Section>

      <Section title={t('students')} extra={<Link to="/students" className="more">{t('seeAll')}</Link>}>
        {students.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : students.error ? (
          <p className="err">{students.error}</p>
        ) : (
          <div className="stats">
            <div>
              <span className="label">{t('current')}</span>
              <strong>{current.length}</strong>
              <span className="muted small">{[...byCampus].map(([c, n]) => `${c} ${n}`).join(' · ')}</span>
            </div>
            <div>
              <span className="label">{t('arriving30')}</span>
              <strong>{arriving.length}</strong>
            </div>
          </div>
        )}
      </Section>

      <Section title={t('recentScores')} extra={<Link to="/scores" className="more">{t('enterScores')}</Link>}>
        {recent.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : (recent.data ?? []).length === 0 ? (
          <p className="muted">{t('noScores')}</p>
        ) : (
          <ul className="rows">
            {(recent.data ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/students/${r.student_no}`}>{nameOf.get(r.student_no) || r.student_no}</Link>
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
