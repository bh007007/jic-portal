import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { closeDay, loadClosings, loadHolidays, loadSessions, reopenDay, type LmsSession } from '../data';
import { useT } from '../i18n';
import { manilaToday } from '../supabase';
import { Loading, PageHead, useLoad, useSave } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hhmm = (t: string) => t.slice(0, 5);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

/**
 * 출석 체크 1단계: 날짜별 수업 목록(원칙 L1·L7). 업체 '정규 출석'처럼 시간대 순서, 캠퍼스 거르기, 내 수업만.
 * 수업을 누르면 학생별 체크(AttendanceSession). 매니저·직원은 캠퍼스·날짜별로 마감한다(업체 '출석 마감').
 */
export default function Attendance() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const [params, setParams] = useSearchParams();
  const today = manilaToday();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? (params.get('day') as string) : today;
  const campus = params.get('campus') ?? '';
  const sessions = useLoad(() => loadSessions(day), [day]);
  const closings = useLoad(() => loadClosings(day), [day]);
  const holidays = useLoad(() => loadHolidays(day, day), [day]);
  const save = useSave();

  const all = sessions.data ?? [];
  const hasMine = all.some((s) => s.mine);
  const mineParam = params.get('mine');
  const mineOnly = mineParam ? mineParam === '1' : hasMine && !me?.isManager && !me?.roles.includes('checker');
  const campuses = [...new Set(all.map((s) => s.campus))].sort();
  const list = all.filter((s) => (!campus || s.campus === campus) && (!mineOnly || s.mine));
  const byTime = new Map<string, LmsSession[]>();
  for (const s of list) byTime.set(hhmm(s.start_time), [...(byTime.get(hhmm(s.start_time)) ?? []), s]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };
  const dayName = new Date(day + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' });
  const closedOf = (c: string) => (closings.data ?? []).find((x) => x.campus === c);

  async function toggleClose(c: string) {
    const isClosed = Boolean(closedOf(c));
    if (!window.confirm(t(isClosed ? 'confirmReopen' : 'confirmClose', { day, campus: c }))) return;
    if (await save.run(() => (isClosed ? reopenDay(day, c) : closeDay(day, c)))) {
      closings.reload();
      sessions.reload();
    }
  }

  return (
    <>
      <PageHead title={t('attendance')} sub={`${day} (${dayName})`} right={<span className="head-links">{me?.canSchedule && <Link to={`/schedule${day !== today ? `?day=${day}` : ''}`} className="more">{t('schedule')}</Link>}<Link to="/attendance/summary" className="more">{t('seeSummary')}</Link></span>} />
      {(holidays.data ?? []).map((h) => (
        <p key={h.day + h.campus} className="holiday">{t('holidayOn', { name: h.name })}{h.campus ? ` · ${h.campus}` : ''}</p>
      ))}
      <div className="day-nav">
        <button type="button" className="btn" aria-label={t('prevDay')} onClick={() => set({ day: plus(day, -1) })}>‹</button>
        <input type="date" value={day} max={plus(today, 7)} onChange={(e) => e.target.value && set({ day: e.target.value === today ? null : e.target.value })} />
        <button type="button" className="btn" aria-label={t('nextDay')} onClick={() => set({ day: plus(day, 1) })}>›</button>
        {day !== today && <button type="button" className="btn" onClick={() => set({ day: null })}>{t('today')}</button>}
      </div>
      <div className="filters">
        <select value={campus} onChange={(e) => set({ campus: e.target.value })} aria-label={t('campus')}>
          <option value="">{t('allCampuses')}</option>
          {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={mineOnly} onChange={(e) => set({ mine: e.target.checked ? '1' : '0' })} />
          {t('mineOnly')}
        </label>
      </div>

      {me?.isManager && day <= today && campuses.length > 0 && (
        <div className="close-bar">
          {(campus ? [campus] : campuses).map((c) => {
            const cl = closedOf(c);
            return (
              <div key={c}>
                {cl && <span className="muted small">{t('closedBy', { campus: c, name: cl.closed_name, time: timeOf(cl.closed_at) })}</span>}
                <button type="button" className={cl ? 'btn btn-xs' : 'btn btn-xs btn-primary'} disabled={save.busy} onClick={() => toggleClose(c)}>
                  {t(cl ? 'reopenDay' : 'closeDay', { campus: c })}
                </button>
              </div>
            );
          })}
          {save.error && <p className="err">{save.error}</p>}
        </div>
      )}

      {sessions.loading || sessions.error ? (
        <Loading error={sessions.error} />
      ) : list.length === 0 ? (
        <div className="state">{t(all.length && mineOnly ? 'noMine' : 'noSessions')}</div>
      ) : (
        [...byTime].map(([time, rows]) => (
          <section key={time} className="sec">
            <div className="sec-head">
              <h2>{time}</h2>
              <span className="muted small">{t('people', { n: rows.reduce((a, s) => a + s.students, 0) })}</span>
            </div>
            <ul className="cards">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link className="card-link" to={`/attendance/${s.id}`}>
                    <span className="card-top">
                      <strong>{[s.room, s.teacher_name].filter(Boolean).join(' · ') || '-'}</strong>
                      <span className={s.closed ? 'muted' : s.checked < s.students ? 'warn' : 'ok'}>
                        {s.closed ? t('closed') : t('checkedOf', { c: s.checked, n: s.students })}
                      </span>
                    </span>
                    <span className="muted small">
                      {[s.campus, t(s.kind === 'G' ? 'kind_G' : 'kind_1'), t('minutesN', { n: s.minutes }), s.subject, s.sub_teacher_name,
                        s.absent ? t('absentN', { n: s.absent }) : '', s.late ? t('lateN', { n: s.late }) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
