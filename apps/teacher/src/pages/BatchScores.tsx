import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { loadAttendance, loadResultsOn, loadSessions, loadStudents, loadTestTypes, validScore, type TestType } from '../data';
import { useT } from '../i18n';
import { manilaToday, supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

/**
 * 성적 여러 명 입력: 같은 날 본 시험(예: 레벨 테스트)을 반 학생 목록에 바로 넣는다(원칙 L7 휴대폰 기준).
 * 시험 날짜에 재학한 학생만 나온다. 영역이 있는 시험은 한 번에 영역 하나(또는 총점)를 넣는다.
 * 같은 날·같은 시험·같은 영역에 이미 넣은 점수는 칸 옆에 보여 준다(겹쳐 넣기 방지). 범위·단위는 DB 트리거가 다시 확인한다.
 */
export default function BatchScores() {
  const { t } = useT();
  const { me } = useAuth();
  const types = useLoad(() => loadTestTypes(), []);
  const active = (types.data ?? []).filter((x) => x.active);
  const [code, setCode] = useState('');
  const type: TestType | undefined = active.find((x) => x.code === code) ?? active[0];
  const [date, setDate] = useState(manilaToday());
  const [section, setSection] = useState('');
  const [campus, setCampus] = useState('');
  const [sessionId, setSessionId] = useState(''); // 수업으로 고르기(그 수업 학생만)
  const [kw, setKw] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(0);
  const students = useLoad(() => loadStudents(date), [date]);
  const sessions = useLoad(() => loadSessions(date), [date]);
  const roster = useLoad(() => (sessionId ? loadAttendance(sessionId) : Promise.resolve(null)), [sessionId]);
  const existing = useLoad(() => (type ? loadResultsOn(type.code, date) : Promise.resolve([])), [type?.code, date]);
  const { busy, error, setError, run } = useSave();

  // 시험·영역·날짜를 바꾸면 적던 칸을 비운다(다른 시험 점수가 섞이지 않게)
  useEffect(() => {
    setValues({});
    setSaved(0);
  }, [type?.code, section, date]);
  useEffect(() => setSessionId(''), [date]);
  useEffect(() => {
    if (type && section && !type.sections.includes(section)) setSection('');
  }, [type, section]);

  const onDate = useMemo(() => (students.data ?? []).filter((s) => s.start_date <= date && date <= s.end_date), [students.data, date]);
  const campuses = useMemo(() => [...new Set(onDate.map((s) => s.campus).filter(Boolean))].sort(), [onDate]);
  const list = useMemo(() => {
    const k = kw.trim().toLowerCase();
    const inClass = roster.data ? new Set(roster.data.map((r) => r.student_no)) : null;
    return onDate
      .filter((s) => !inClass || inClass.has(s.student_no))
      .filter((s) => !campus || s.campus === campus)
      .filter((s) => !k || `${s.name} ${s.student_no} ${s.course}`.toLowerCase().includes(k))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [onDate, campus, kw, roster.data]);
  const classes = useMemo(() => [...(sessions.data ?? [])].sort((a, b) => Number(b.mine) - Number(a.mine) || a.start_time.localeCompare(b.start_time)), [sessions.data]);
  const had = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of existing.data ?? []) {
      if (r.section !== section) continue;
      m.set(r.student_no, [...(m.get(r.student_no) ?? []), Number(r.value)]);
    }
    return m;
  }, [existing.data, section]);

  const filled = list.filter((s) => values[s.enrollment_id]?.trim());
  const bad = type ? filled.filter((s) => !validScore(type, Number(values[s.enrollment_id]))) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) return;
    if (!filled.length) return setError(t('needOneScore'));
    if (bad.length) return setError(t('badRows', { n: bad.length }));
    const rows = filled.map((s) => ({
      student_no: s.student_no,
      enrollment_id: s.enrollment_id,
      test_type: type.code,
      test_date: date,
      section,
      value: Number(values[s.enrollment_id]),
      note: note.trim(),
    }));
    const ok = await run(async () => {
      const { error: err } = await supabase.from('test_results').insert(rows);
      if (err) throw err;
    });
    if (ok) {
      setSaved(rows.length);
      setValues({});
      existing.reload();
    }
  };

  if (types.loading) return <Loading />;
  if (me && !me.canWrite) return <Navigate to="/scores" replace />;
  if (types.error) return <Loading error={types.error} />;
  if (!type) return <div className="state">{t('noTestTypes')}</div>;

  return (
    <>
      <PageHead title={t('batchScores')} sub={t('batchSub')} right={<Link to="/scores" className="btn btn-xs">{t('oneByOne')}</Link>} />
      {/* 브라우저 기본 검사 대신 틀린 칸 수를 알려 준다(빨간 칸) */}
      <form className="form" onSubmit={submit} noValidate>
        <Section title={t('test')}>
          <div className="row2">
            <label>
              {t('test')}
              <select value={type.code} onChange={(e) => setCode(e.target.value)}>
                {active.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
            </label>
            <label>
              {t('date')}
              <input type="date" value={date} max={manilaToday()} onChange={(e) => e.target.value && setDate(e.target.value)} required />
            </label>
          </div>
          {type.sections.length > 0 && (
            <div className="seg" role="tablist" aria-label={t('section')}>
              {[...type.sections, ''].map((s) => (
                <button key={s || 'total'} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>{s || t('total')}</button>
              ))}
            </div>
          )}
          <p className="muted small">{t('rangeNote', { min: type.min_value, max: type.max_value, step: type.step })}</p>
          <label>
            {t('memo')}
            <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('memoAll')} />
          </label>
        </Section>

        <Section title={<>{t('studentsOn', { date })} <span className="muted small">{t('people', { n: list.length })}</span></>}>
          {classes.length > 0 && (
            <select className="full" style={{ marginBottom: 8 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label={t('byClass')}>
              <option value="">{t('byClass')} · {t('allStudentsOn')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.mine ? '★ ' : ''}{c.start_time.slice(0, 5)} · {[c.room, c.teacher_name, c.subject].filter(Boolean).join(' · ')} ({c.students})</option>
              ))}
            </select>
          )}
          <div className="filters">
            <input type="search" placeholder={t('searchStudent')} value={kw} onChange={(e) => setKw(e.target.value)} aria-label={t('searchStudent')} />
            <select value={campus} onChange={(e) => setCampus(e.target.value)} aria-label={t('campus')}>
              <option value="">{t('allCampuses')}</option>
              {campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {students.loading ? (
            <Loading />
          ) : students.error ? (
            <Loading error={students.error} />
          ) : list.length === 0 ? (
            <p className="muted">{t('noStudent')}</p>
          ) : (
            <ul className="batch">
              {list.map((s) => {
                const v = values[s.enrollment_id] ?? '';
                const wrong = v.trim() !== '' && !validScore(type, Number(v));
                const before = had.get(s.student_no);
                return (
                  <li key={s.enrollment_id}>
                    <label htmlFor={`v-${s.enrollment_id}`}>
                      <strong>{s.name}</strong>
                      <span className="muted small">{s.student_no} · {s.campus}{s.course ? ` · ${s.course}` : ''}</span>
                      {before && <span className="small warn">{t('alreadyIn', { v: before.join(', ') })}</span>}
                    </label>
                    <input
                      id={`v-${s.enrollment_id}`}
                      type="number"
                      inputMode="decimal"
                      min={type.min_value}
                      max={type.max_value}
                      step={type.step}
                      value={v}
                      aria-invalid={wrong}
                      className={wrong ? 'bad' : undefined}
                      onChange={(e) => setValues((x) => ({ ...x, [s.enrollment_id]: e.target.value }))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="batch-foot">
          {error && <p className="err" role="alert">{error}</p>}
          {saved > 0 && !error && <p className="ok" role="status">{t('savedN', { n: saved })}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || filled.length === 0}>
            {busy ? t('saving') : t('saveN', { n: filled.length })}
          </button>
        </div>
      </form>
    </>
  );
}
