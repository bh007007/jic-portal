import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadAttendanceSummary, loadStudentAttendance, loadStudents, type AttendanceSummaryRow, type LmsStudent, type StudentAttendanceRow } from '../data';
import { useAuth } from '../auth';
import { useT, type Key } from '../i18n';
import { canUseIntranet, intranetUrl } from '../links';

type T = ReturnType<typeof useT>['t'];
import { manilaToday } from '../supabase';
import { Loading, PageHead, fmtDate, useLoad } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** 결석 사유 줄: 무단·사유 인정·신청 종류별·미체크(0은 뺀다) */
export function reasonLine(t: T, r: Pick<AttendanceSummaryRow, 'unexcused' | 'excused' | 'req_sick' | 'req_official' | 'req_personal' | 'unchecked'>) {
  return [
    r.unexcused ? t('unexcusedN', { n: r.unexcused }) : '',
    r.excused ? t('excusedN', { n: r.excused }) : '',
    r.req_sick ? t('sickN', { n: r.req_sick }) : '',
    r.req_official ? t('officialN', { n: r.req_official }) : '',
    r.req_personal ? t('personalN', { n: r.req_personal }) : '',
    r.unchecked ? t('notCheckedN', { n: r.unchecked }) : '',
  ].filter(Boolean).join(' · ');
}

/** 한 학생의 수업별 출석 줄(결석·지각만 또는 전부). 학생 상세와 합계 화면에서 같이 쓴다. */
export function AttendanceRows({ rows, issuesOnly }: { rows: StudentAttendanceRow[]; issuesOnly?: boolean }) {
  const { t } = useT();
  const list = issuesOnly ? rows.filter((r) => r.result !== 'AT') : rows;
  if (!list.length) return <p className="muted small">{t(issuesOnly ? 'allPresent' : 'noAttendance')}</p>;
  return (
    <ul className="rows">
      {list.map((r, i) => {
        const why = r.result === 'AB'
          ? r.excused ? t('excused') : r.request_kind && r.request_status === 'approved' ? t(('abs_' + r.request_kind) as Key) : t('unexcusedWord')
          : r.result === 'TA' && r.late_min ? t('lateMinN', { n: r.late_min }) : '';
        return (
          <li key={r.day + r.start_time + i}>
            <span>{fmtDate(r.day)} {r.start_time} · {r.subject || r.room || r.campus}</span>
            <span className={r.result === 'AB' ? (why === t('unexcusedWord') ? 'err' : 'warn') : r.result === 'TA' ? 'warn' : r.result ? 'ok' : 'muted'}>
              {t(('att_' + (r.result ?? 'none')) as Key)}
            </span>
            <span className="muted small">
              {[why, r.teacher_name, r.request_kind && !(r.result === 'AB' && !r.excused && r.request_status === 'approved') ? `${t('absenceReq')} ${t(('abs_' + r.request_kind) as Key)} · ${t(('st_' + r.request_status) as Key)}` : ''].filter(Boolean).join(' · ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Detail({ no, from, to, issuesOnly }: { no: string; from: string; to: string; issuesOnly: boolean }) {
  const rows = useLoad(() => loadStudentAttendance(no, from, to), [no, from, to]);
  if (rows.loading || rows.error) return <Loading error={rows.error} />;
  return <div className="att-detail"><AttendanceRows rows={rows.data ?? []} issuesOnly={issuesOnly} /></div>;
}

/**
 * 출석 확인 · 사유별 합계 / 무단결석 목록(메뉴 검토표 LMS, 원칙 L4). 기간·캠퍼스별 학생 합계: 출석·결석·지각, 결석 사유(사유 인정·승인된 결석 신청 종류·무단).
 * 학생을 누르면 수업별 결석·지각이 펼쳐진다. 무단결석의 패널티 승인은 인트라넷에서 한다(무단결석 패널티 후보).
 */
export default function AttendanceSummary() {
  const { me } = useAuth();
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const today = manilaToday();
  const range = params.get('range') ?? '7';
  const campus = params.get('campus') ?? '';
  const only = params.get('unexcused') === '1';
  const from = range === 'month' ? today.slice(0, 8) + '01' : plus(today, range === '14' ? -13 : -6);
  const to = today;
  const [open, setOpen] = useState('');

  const summary = useLoad(() => loadAttendanceSummary(from, to, campus), [from, to, campus]);
  const names = useLoad(async () => {
    const [a, b] = await Promise.all([loadStudents(from), loadStudents(to)]);
    return new Map<string, LmsStudent>([...a, ...b].map((s) => [s.student_no, s]));
  }, [from, to]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };
  const all = summary.data ?? [];
  const list = all.filter((r) => !only || r.unexcused > 0);
  const campuses = [...new Set(all.map((r) => r.campus))].sort();
  const tabs: [string, Key][] = [['7', 'range7'], ['14', 'range14'], ['month', 'rangeMonth']];

  return (
    <>
      <PageHead title={t(only ? 'unexcusedTitle' : 'attSummary')} sub={`${from} ~ ${to}`} right={<Link to="/attendance" className="more">{t('attendance')}</Link>} />
      <div className="seg" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => set({ range: k === '7' ? null : k })}>{t(l)}</button>
        ))}
      </div>
      <div className="filters" style={{ marginTop: 8 }}>
        <select value={campus} onChange={(e) => set({ campus: e.target.value })} aria-label={t('campus')}>
          <option value="">{t('allCampuses')}</option>
          {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={only} onChange={(e) => set({ unexcused: e.target.checked ? '1' : null })} />
          {t('unexcusedOnly')}
        </label>
      </div>
      <p className="muted small">
        {t('unexcusedDef')}
        {canUseIntranet(me) && <> <a href={intranetUrl('penalties')}>{t('penaltiesInIntranet')}</a></>}
      </p>

      {summary.loading || summary.error ? (
        <Loading error={summary.error} />
      ) : list.length === 0 ? (
        <div className="state">{t(only ? 'noUnexcused' : 'noSummary')}</div>
      ) : (
        <ul className="cards">
          {list.map((r) => {
            const st = names.data?.get(r.student_no);
            const isOpen = open === r.student_no;
            return (
              <li key={r.student_no}>
                <button type="button" className="card-link card-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : r.student_no)}>
                  <span className="card-top">
                    <strong>{st?.name || r.student_no}</strong>
                    <span className={r.unexcused ? 'err' : r.absent ? 'warn' : 'muted'}>{t('sumLine', { at: r.present, ab: r.absent, ta: r.late })}</span>
                  </span>
                  <span className="muted small">{[r.student_no, r.campus, reasonLine(t, r)].filter(Boolean).join(' · ')}</span>
                </button>
                {isOpen && (
                  <>
                    <Detail no={r.student_no} from={from} to={to} issuesOnly />
                    <p className="small" style={{ margin: '0 12px 10px' }}><Link to={`/students/${r.student_no}`}>{st?.name || r.student_no} ›</Link></p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
