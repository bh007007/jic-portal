import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  CAMPUS_NAMES, copySessions, createSession, deleteSession, loadClassrooms, loadHolidays, loadSessions, loadStaff, loadStudents,
} from '../data';
import { useT } from '../i18n';
import { manilaToday } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay(); // 0 일요일
/** d 다음 평일 n일(토·일 빼고) */
function nextWeekdays(d: string, n: number) {
  const out: string[] = [];
  for (let x = plus(d, 1); out.length < n; x = plus(x, 1)) if (weekday(x) !== 0 && weekday(x) !== 6) out.push(x);
  return out;
}

/**
 * 수업 관리(스케줄러·매니저·관리자). 업체 반복 시간표를 옮기기 전 1차 방법: 날짜별로 수업을 만들고(시각·강사·교실·학생), 하루를 다음 날·다음 주·평일 N일로 복사한다.
 * 복사는 DB 함수(lms_copy_sessions)가 휴일·마감된 날·이미 있는 수업을 건너뛰고 그날 재학생만 옮긴다. 출석 결과 입력은 '출석 체크' 화면.
 */
export default function Schedule() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const [params, setParams] = useSearchParams();
  const today = manilaToday();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? (params.get('day') as string) : today;
  const campus = params.get('campus') ?? '';
  const sessions = useLoad(() => loadSessions(day, campus), [day, campus]);
  const holidays = useLoad(() => loadHolidays(day, day), [day]);
  const staff = useLoad(() => loadStaff(), []);
  const rooms = useLoad(() => loadClassrooms(), []);
  const students = useLoad(() => loadStudents(day), [day]);
  const save = useSave();
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ start_time: '09:00', minutes: 50, campus: campus || 'Premium', kind: 'G' as '1' | 'G', subject: '', teacher_id: '', sub_teacher_id: '', classroom_id: '' });
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [kw, setKw] = useState('');
  const [copyMode, setCopyMode] = useState('next');
  const [copyN, setCopyN] = useState(5);

  if (me && !me.canSchedule) return <Navigate to="/attendance" replace />;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };
  const dayName = new Date(day + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' });
  const teachers = (staff.data ?? []).filter((s) => s.active && (!form.campus || !s.campus || s.campus === form.campus));
  const campusRooms = (rooms.data ?? []).filter((r) => r.active && r.campus === form.campus);
  const onDay = (students.data ?? []).filter((s) => s.start_date <= day && s.campus === form.campus);
  const k = kw.trim().toLowerCase();
  const shown = onDay.filter((s) => !k || `${s.name} ${s.student_no} ${s.course}`.toLowerCase().includes(k));
  const chosen = onDay.filter((s) => picked[s.enrollment_id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    const ok = await save.run(() =>
      createSession(
        {
          day, start_time: form.start_time, minutes: Number(form.minutes) || 50, campus: form.campus, kind: form.kind, subject: form.subject.trim(),
          teacher_id: form.teacher_id || null, sub_teacher_id: form.sub_teacher_id || null, classroom_id: form.classroom_id || null,
        },
        chosen,
      ),
    );
    if (ok) {
      setMsg(t('created'));
      setPicked({});
      setOpen(false);
      sessions.reload();
    }
  }
  async function runCopy() {
    setMsg('');
    const targets = copyMode === 'next' ? [plus(day, 1)] : copyMode === 'week' ? [plus(day, 7)] : nextWeekdays(day, Math.max(1, Math.min(20, copyN)));
    let n = 0;
    if (await save.run(async () => { n = await copySessions(day, targets, campus); })) setMsg(t('copiedN', { n }));
  }
  async function remove(id: string, time: string, room: string) {
    if (!window.confirm(t('confirmDeleteSession', { time, room }))) return;
    if (await save.run(() => deleteSession(id))) sessions.reload();
  }

  return (
    <>
      <PageHead title={t('schedule')} sub={`${day} (${dayName})`} right={<Link to="/classrooms" className="more">{t('classroomsMenu')}</Link>} />
      {(holidays.data ?? []).map((h) => (
        <p key={h.day + h.campus} className="holiday">{t('holidayOn', { name: h.name })}{h.campus ? ` · ${h.campus}` : ''}</p>
      ))}
      <div className="day-nav">
        <button type="button" className="btn" aria-label={t('prevDay')} onClick={() => set({ day: plus(day, -1) })}>‹</button>
        <input type="date" value={day} onChange={(e) => e.target.value && set({ day: e.target.value === today ? null : e.target.value })} />
        <button type="button" className="btn" aria-label={t('nextDay')} onClick={() => set({ day: plus(day, 1) })}>›</button>
        {day !== today && <button type="button" className="btn" onClick={() => set({ day: null })}>{t('today')}</button>}
      </div>
      <select value={campus} onChange={(e) => set({ campus: e.target.value })} aria-label={t('campus')} className="full">
        <option value="">{t('allCampuses')}</option>
        {CAMPUS_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {msg && <p className="ok small">{msg}</p>}
      {save.error && <p className="err">{save.error}</p>}

      <Section title={t('classesOn', { day })}>
        {sessions.loading || sessions.error ? (
          <Loading error={sessions.error} />
        ) : (sessions.data ?? []).length === 0 ? (
          <p className="muted">{t('noSessions')}</p>
        ) : (
          <ul className="rows">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id}>
                <Link to={`/attendance/${s.id}`}>{s.start_time.slice(0, 5)} · {[s.room, s.teacher_name].filter(Boolean).join(' · ') || s.campus}</Link>
                {s.closed ? <span className="muted small">{t('closed')}</span> : (
                  <button type="button" className="link-btn" disabled={save.busy} onClick={() => remove(s.id, s.start_time.slice(0, 5), s.room)}>{t('deleteSession')}</button>
                )}
                <span className="muted small">{[s.campus, t(s.kind === 'G' ? 'kind_G' : 'kind_1'), t('minutesN', { n: s.minutes }), s.subject, t('people', { n: s.students })].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('copyDay')}>
        <div className="row2">
          <select value={copyMode} onChange={(e) => setCopyMode(e.target.value)} aria-label={t('copyDay')}>
            <option value="next">{t('copyNextDay')} ({plus(day, 1)})</option>
            <option value="week">{t('copyNextWeek')} ({plus(day, 7)})</option>
            <option value="weekdays">{t('copyWeekdays', { n: copyN })}</option>
          </select>
          {copyMode === 'weekdays' ? (
            <input type="number" min={1} max={20} value={copyN} onChange={(e) => setCopyN(Number(e.target.value) || 1)} aria-label={t('copyWeekdays', { n: '' })} />
          ) : <span />}
        </div>
        <button type="button" className="btn btn-primary full" style={{ marginTop: 8 }} disabled={save.busy || !(sessions.data ?? []).length} onClick={runCopy}>{t('copyRun')}</button>
      </Section>

      <Section title={t('addSession')} extra={<button type="button" className="btn btn-xs" onClick={() => setOpen((o) => !o)}>{open ? t('close') : t('addSession')}</button>}>
        {open && (
          <form className="form" onSubmit={submit}>
            <div className="row3">
              <label>{t('startTime')}<input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
              <label>{t('minutes')}<input type="number" min={10} max={300} required value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} /></label>
              <label>{t('kindLabel')}
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as '1' | 'G' })}>
                  <option value="G">{t('kind_G')}</option>
                  <option value="1">{t('kind_1')}</option>
                </select>
              </label>
            </div>
            <div className="row2">
              <label>{t('campus')}
                <select value={form.campus} onChange={(e) => { setForm({ ...form, campus: e.target.value, classroom_id: '' }); setPicked({}); }}>
                  {CAMPUS_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>{t('subject')}<input value={form.subject} maxLength={80} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
            </div>
            <div className="row2">
              <label>{t('teacher')}
                <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                  <option value="">{t('none')}</option>
                  {teachers.map((s) => <option key={s.id} value={s.id}>{s.nickname || s.name}</option>)}
                </select>
              </label>
              <label>{t('classroom')}
                <select value={form.classroom_id} onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}>
                  <option value="">{t('none')}</option>
                  {campusRooms.map((r) => <option key={r.id} value={r.id}>{r.num}</option>)}
                </select>
              </label>
            </div>
            <label>{t('subTeacher')}
              <select value={form.sub_teacher_id} onChange={(e) => setForm({ ...form, sub_teacher_id: e.target.value })}>
                <option value="">{t('none')}</option>
                {teachers.filter((s) => s.id !== form.teacher_id).map((s) => <option key={s.id} value={s.id}>{s.nickname || s.name}</option>)}
              </select>
            </label>
            <label>{t('pickStudents', { n: chosen.length })}
              <input type="search" placeholder={t('searchStudent')} value={kw} onChange={(e) => setKw(e.target.value)} />
            </label>
            {onDay.length === 0 ? (
              <p className="muted small">{t('noStudentsOn')}</p>
            ) : (
              <ul className="pick-check">
                {shown.map((s) => (
                  <li key={s.enrollment_id}>
                    <label className="check">
                      <input type="checkbox" checked={!!picked[s.enrollment_id]} onChange={(e) => setPicked({ ...picked, [s.enrollment_id]: e.target.checked })} />
                      <span>{s.name} <span className="muted small">{s.student_no} · {s.course}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button type="submit" className="btn btn-primary btn-lg full" disabled={save.busy}>{save.busy ? t('saving') : t('createSession')}</button>
          </form>
        )}
      </Section>
    </>
  );
}
