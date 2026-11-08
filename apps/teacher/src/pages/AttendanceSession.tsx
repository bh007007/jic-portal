import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  loadAbsences, loadAttendance, loadSessionDay, loadSessions, loadStudents, markAllPresent, markAttendance,
  type AttResult, type AttendanceRow, type LmsAbsence, type LmsSession, type LmsStudent,
} from '../data';
import { useT, type Key } from '../i18n';
import { errText, manilaToday } from '../supabase';
import { Loading, PageHead, Section } from '../ui';

const RESULTS: AttResult[] = ['AT', 'AB', 'TA'];
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

interface Loaded {
  session: LmsSession;
  rows: AttendanceRow[];
  students: Map<string, LmsStudent>;
  absences: Map<string, LmsAbsence>;
}

async function loadAll(id: string): Promise<Loaded | null> {
  const day = await loadSessionDay(id);
  if (!day) return null;
  const [sessions, rows, students, absences] = await Promise.all([loadSessions(day), loadAttendance(id), loadStudents(day), loadAbsences(day, day)]);
  const session = sessions.find((s) => s.id === id);
  if (!session) return null;
  return {
    session,
    rows,
    students: new Map(students.map((s) => [s.student_no, s])),
    absences: new Map(absences.filter((a) => a.status !== 'rejected').map((a) => [a.student_no, a])),
  };
}

/**
 * 출석 체크 2단계: 한 수업의 학생별 출석·결석·지각(업체 정규 출석의 결과 AT·AB·TA, 지각 분, 사유 인정).
 * 누르면 바로 저장한다(휴대폰, 원칙 L7). 결석 신청(인정·처리 전)은 이름 아래에 보인다(원칙 L4). 사유 인정은 매니저·직원만.
 */
export default function AttendanceSession() {
  const { id = '' } = useParams();
  const { me } = useAuth();
  const { t } = useT();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string>(''); // 저장 중인 학생번호('*' = 모두 출석)
  const [error, setError] = useState('');
  const [lateDraft, setLateDraft] = useState<Record<string, string>>({});

  const reload = () =>
    loadAll(id).then(setData).catch((e) => setLoadError(errText(e)));
  useEffect(() => {
    setData(undefined);
    setLoadError('');
    reload();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <Loading error={loadError} />;
  if (data === undefined) return <Loading />;
  if (data === null) return <div className="state">{t('noSession')} <Link to="/attendance">{t('backToList')}</Link></div>;

  const { session: s, rows, students, absences } = data;
  const today = manilaToday();
  const canMark = Boolean(me?.isManager || me?.roles.includes('checker') || s.mine);
  const editable = canMark && !s.closed && s.day <= today;
  const unchecked = rows.filter((r) => !r.result).length;
  const sorted = [...rows].sort((a, b) => (students.get(a.student_no)?.name || a.student_no).localeCompare(students.get(b.student_no)?.name || b.student_no));

  async function patch(r: AttendanceRow, p: Partial<Pick<AttendanceRow, 'result' | 'late_min' | 'excused'>>) {
    setBusy(r.student_no);
    setError('');
    try {
      const saved = await markAttendance(s.id, r.student_no, p);
      setData((d) => (d ? { ...d, rows: d.rows.map((x) => (x.student_no === r.student_no ? saved : x)) } : d));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  }
  async function markAll() {
    setBusy('*');
    setError('');
    try {
      await markAllPresent(s.id);
      await reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  }
  function saveLate(r: AttendanceRow) {
    const v = lateDraft[r.student_no];
    if (v === undefined) return;
    const n = v.trim() === '' ? null : Math.round(Number(v));
    if (n !== null && !(n >= 1 && n <= 300)) return setError(t('e_check'));
    if (n === r.late_min) return;
    patch(r, { late_min: n });
  }

  const head = [s.room, s.teacher_name].filter(Boolean).join(' · ') || '-';
  const sub = [s.day, s.start_time.slice(0, 5), t('minutesN', { n: s.minutes }), s.campus, t(s.kind === 'G' ? 'kind_G' : 'kind_1'), s.subject, s.sub_teacher_name].filter(Boolean).join(' · ');

  return (
    <>
      <PageHead title={head} sub={sub} right={<Link to={`/attendance?day=${s.day}`} className="more">{t('backToList')}</Link>} />
      {s.closed ? <p className="muted">{t('closedNote')}</p> : s.day > today ? <p className="muted">{t('futureNote')}</p> : !canMark ? <p className="muted">{t('readOnlyNote')}</p> : null}

      <Section
        title={t('checkedOf', { c: rows.length - unchecked, n: rows.length })}
        extra={editable && unchecked > 0 ? (
          <button type="button" className="btn btn-xs btn-primary" disabled={busy !== ''} onClick={markAll}>{t('markAll', { n: unchecked })}</button>
        ) : undefined}
      >
        {error && <p className="err">{error}</p>}
        <ul className="att">
          {sorted.map((r) => {
            const st = students.get(r.student_no);
            const ab = absences.get(r.student_no);
            const saving = busy === r.student_no || busy === '*';
            return (
              <li key={r.student_no}>
                <div className="att-who">
                  <Link to={`/students/${r.student_no}`}>{st?.name || r.student_no}</Link>
                  <span className="muted small">
                    {[r.student_no, st?.nation, st?.course].filter(Boolean).join(' · ')}
                  </span>
                  {ab && (
                    <span className={ab.status === 'approved' ? 'ok small' : 'warn small'}>
                      {t('absenceReq')}: {t(('abs_' + ab.kind) as Key)} · {ab.periods.length ? t('periodsLabel', { p: ab.periods.join('·') }) : t('allDay')} · {t(('st_' + ab.status) as Key)}
                    </span>
                  )}
                  {r.checked_at && <span className="muted small">{t('checkedBy', { name: r.checked_name, time: timeOf(r.checked_at) })}</span>}
                </div>
                <div className="att-ctl">
                  <div className="seg att-seg" role="radiogroup" aria-label={st?.name || r.student_no}>
                    {RESULTS.map((res) => (
                      <button
                        key={res}
                        type="button"
                        role="radio"
                        aria-checked={r.result === res}
                        aria-selected={r.result === res}
                        className={'att-' + res}
                        disabled={!editable || saving}
                        onClick={() => r.result !== res && patch(r, { result: res })}
                      >
                        {t(('att_' + res) as Key)}
                      </button>
                    ))}
                  </div>
                  {r.result === 'TA' && (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={300}
                      placeholder={t('lateMin')}
                      aria-label={t('lateMin')}
                      disabled={!editable || saving}
                      value={lateDraft[r.student_no] ?? (r.late_min ?? '')}
                      onChange={(e) => setLateDraft((d) => ({ ...d, [r.student_no]: e.target.value }))}
                      onBlur={() => saveLate(r)}
                    />
                  )}
                  {me?.isManager ? (
                    <label className="check small">
                      <input type="checkbox" checked={r.excused} disabled={s.closed || saving} onChange={(e) => patch(r, { excused: e.target.checked })} />
                      {t('excused')}
                    </label>
                  ) : r.excused ? (
                    <span className="ok small">{t('excused')}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
