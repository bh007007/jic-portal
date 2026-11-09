import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { cefrOf, loadAbsences, loadCefr, loadResults, loadStudentAttendance, loadStudents, loadTestTypes, type TestResult } from '../data';
import { AttendanceRows } from './AttendanceSummary';
import { useT, type Key } from '../i18n';
import ScoreForm from '../ScoreForm';
import ScoreChart from '../ScoreChart';
import { manilaToday, supabase } from '../supabase';
import { Loading, PageHead, Section, fmtDate, useLoad, useSave } from '../ui';

/** 학생 한 명: 연수 정보, 성적 기록(시험 종류별), 성적 입력. 연락처·여권·금액은 강사 포털에 없다. */
export default function StudentDetail() {
  const { no = '' } = useParams();
  const { me } = useAuth();
  const { t } = useT();
  const students = useLoad(() => loadStudents(), []);
  const types = useLoad(() => loadTestTypes(), []);
  const cefr = useLoad(() => loadCefr(), []);
  const results = useLoad(() => loadResults(no), [no]);
  // 결석 신청: 지난 3주 ~ 다음 1주(lms_absences 는 31일까지). 사유 글은 함수가 주지 않는다(원칙 L4)
  const today = manilaToday();
  const shift = (n: number) => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  const absences = useLoad(() => loadAbsences(shift(-23), shift(7)), [today]);
  // 출석: 최근 4주(수업 × 학생). 결석·지각만 줄로 보이고 합계는 위에
  const attendance = useLoad(() => loadStudentAttendance(no, shift(-27), today), [no, today]);
  const att = attendance.data ?? [];
  const del = useSave();

  const mine = (students.data ?? []).filter((s) => s.student_no === no).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const s = mine[0];
  if (students.loading || types.loading) return <Loading />;
  if (students.error) return <Loading error={students.error} />;
  if (!s) return <div className="state">{t('notCurrent')} <Link to="/students">{t('studentList')}</Link></div>;

  const typeOf = (c: string) => types.data?.find((x) => x.code === c);
  const typeName = (c: string) => typeOf(c)?.name ?? c;
  const myAbsences = (absences.data ?? []).filter((a) => a.student_no === no).sort((a, b) => b.absence_date.localeCompare(a.absence_date));
  const byType = new Map<string, TestResult[]>();
  for (const r of results.data ?? []) byType.set(r.test_type, [...(byType.get(r.test_type) ?? []), r]);

  const remove = async (r: TestResult) => {
    if (!window.confirm(t('confirmDeleteScore', { name: typeName(r.test_type), section: r.section || t('total'), value: r.value, date: r.test_date }))) return;
    if (await del.run(async () => {
      const { error } = await supabase.from('test_results').delete().eq('id', r.id);
      if (error) throw error;
    })) results.reload();
  };

  return (
    <>
      <PageHead title={s.name} sub={`${s.student_no} · ${s.nation}${s.gender ? ' · ' + s.gender : ''}`} right={<Link to="/students" className="btn btn-xs">{t('list')}</Link>} />
      <Section title={t('enrollment')}>
        <dl className="kv">
          <dt>{t('campus')}</dt><dd>{s.campus || '-'}</dd>
          <dt>{t('course')}</dt><dd>{s.course || '-'}</dd>
          <dt>{t('dorm')}</dt><dd>{s.dorm || '-'}</dd>
          <dt>{t('period')}</dt><dd>{fmtDate(s.start_date)} ~ {fmtDate(s.end_date)}</dd>
          <dt>{t('batch')}</dt><dd>{s.batch || '-'}</dd>
        </dl>
      </Section>

      <Section title={t('attendance4w')} extra={<Link to="/attendance/summary" className="more">{t('seeSummary')}</Link>}>
        {attendance.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : attendance.error ? (
          <p className="err">{attendance.error}</p>
        ) : att.length === 0 ? (
          <p className="muted">{t('noAttendance')}</p>
        ) : (
          <>
            <p className={att.some((r) => r.result === 'AB' && !r.excused && !(r.request_kind && r.request_status === 'approved')) ? 'err' : 'muted'}>
              {t('sumLine', { at: att.filter((r) => r.result === 'AT').length, ab: att.filter((r) => r.result === 'AB').length, ta: att.filter((r) => r.result === 'TA').length })}
            </p>
            <AttendanceRows rows={att.slice(0, 40)} issuesOnly />
          </>
        )}
      </Section>

      <Section title={t('absencesNear')} extra={<Link to="/absences" className="more">{t('byDate')}</Link>}>
        {absences.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : absences.error ? (
          <p className="err">{absences.error}</p>
        ) : myAbsences.length === 0 ? (
          <p className="muted">{t('noAbsence')}</p>
        ) : (
          <ul className="rows">
            {myAbsences.map((a) => (
              <li key={a.id}>
                <span>{fmtDate(a.absence_date)}{a.absence_date === today ? ` · ${t('today')}` : ''}</span>
                <span className={a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'err' : 'muted'}>{t(('st_' + a.status) as Key)}</span>
                <span className="muted small">{a.periods.length ? t('periodsLabel', { p: a.periods.join('·') }) : t('allDay')} · {t(('abs_' + a.kind) as Key)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {me?.canWrite && (
        <Section title={t('enterScores')}>
          <ScoreForm student={s} types={types.data ?? []} onSaved={results.reload} />
        </Section>
      )}

      <Section title={t('scoreRecords')} extra={<span className="muted small">{t('cefrNote')}</span>}>
        {results.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : byType.size === 0 ? (
          <p className="muted">{t('noRecords')}</p>
        ) : (
          [...byType].map(([code, rows]) => {
            const type = typeOf(code);
            return (
              <div key={code} className="result-block">
                <h3>{typeName(code)}</h3>
                {type && <ScoreChart type={type} results={rows} maps={cefr.data ?? []} />}
                <table className="tbl">
                  <thead>
                    <tr><th>{t('date')}</th><th>{t('section')}</th><th className="num">{t('score')}</th><th>CEFR</th><th>{t('by')}</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{fmtDate(r.test_date)}</td>
                        <td>{r.section || t('total')}</td>
                        <td className="num strong">{r.value}</td>
                        <td>{(!r.section && cefrOf(cefr.data ?? [], r.test_type, Number(r.value))) || <span className="muted">-</span>}</td>
                        <td className="small muted">{r.teacher_name}{r.note ? ` · ${r.note}` : ''}</td>
                        <td>
                          {(r.teacher_id === me?.session.user.id || me?.isManager) && (
                            <button type="button" className="link-btn" onClick={() => remove(r)} disabled={del.busy}>{t('delete')}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
        {del.error && <p className="err">{del.error}</p>}
      </Section>
    </>
  );
}
