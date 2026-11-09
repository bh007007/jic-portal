import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { decideAbsences, loadAbsenceDetails, loadAbsences, type AbsenceDetail, type LmsAbsence } from '../data';
import { useT, type Key } from '../i18n';
import { canUseIntranet, intranetUrl } from '../links';
import { manilaToday } from '../supabase';
import { AbsenceRow, Loading, PageHead, useLoad, useSave } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** 필리핀 시각(UTC+8) 'YYYY-MM-DD HH:MM' */
const manilaTime = (iso: string) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const full = { gridColumn: '1 / -1' } as const;

/**
 * 결석 신청(원칙 L4). 학생 포털에서 낸 신청을 날짜별로 본다. 강사·체커·스케줄러에게는 종류·처리 상태만 보이고 사유 글은 보이지 않는다.
 * 직원·매니저는 여기서 사유와 신청 시각을 보고 승인·반려한다(설계서 L1·L4: 결석 승인은 LMS 에서 매니저가). 인트라넷 '결석 신청 처리'와 같은 DB 함수라
 * 어느 쪽에서 처리해도 같다. 승인되면 출석 확인·무단결석 목록에 인정 결석으로 잡힌다. 처리 메모는 학생 포털에도 보인다.
 * 기한(수업 30분 전, 원칙 S4)은 교시별 시각이 아직 없어 계산하지 않고, 신청 시각과 '결석일 당일·뒤 신청'만 표시해 매니저가 판단한다.
 */
export default function Absences() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const canDecide = canUseIntranet(me);
  const [params, setParams] = useSearchParams();
  const today = manilaToday();
  const defaultTab = canDecide ? 'pending' : 'today';
  const range = params.get('range') ?? defaultTab;
  const [from, to] =
    range === 'pending' ? [plus(today, -14), plus(today, 16)] : // lms_absences 는 31일까지
    range === 'tomorrow' ? [plus(today, 1), plus(today, 1)] :
    range === 'week' ? [today, plus(today, 6)] :
    [today, today];
  const list = useLoad(() => loadAbsences(from, to), [from, to]);
  const rows = (list.data ?? []).filter((a) => range !== 'pending' || a.status === 'pending');
  // 사유·신청 시각은 같은 기간으로 한 번에 읽는다(직원·매니저만 읽힌다). 처리하면 목록과 함께 다시 읽는다
  const details = useLoad(() => (canDecide ? loadAbsenceDetails(from, to) : Promise.resolve([] as AbsenceDetail[])), [canDecide, from, to]);
  const byId = new Map((details.data ?? []).map((d) => [d.id, d]));
  const save = useSave();
  const [memo, setMemo] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const byDate = new Map<string, LmsAbsence[]>();
  for (const a of rows) byDate.set(a.absence_date, [...(byDate.get(a.absence_date) ?? []), a]);
  const dayName = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' });
  const tabs: [string, Key][] = [...(canDecide ? ([['pending', 'pendingTab']] as [string, Key][]) : []), ['today', 'today'], ['tomorrow', 'tomorrow'], ['week', 'days7']];

  async function decide(a: LmsAbsence, approve: boolean) {
    setMsg('');
    let n = 0;
    if (await save.run(async () => { n = await decideAbsences([a.id], approve, memo[a.id] ?? ''); })) {
      setMsg(n ? t(approve ? 'approvedOne' : 'rejectedOne', { name: a.name || a.student_no }) : t('alreadyDecided'));
      list.reload();
      details.reload();
    }
  }

  return (
    <>
      <PageHead
        title={t('absences')}
        sub={t(canDecide ? 'absencesSubDecide' : 'absencesSub')}
        right={canDecide ? <a href={intranetUrl('requests/absences')} className="more">{t('openInIntranet')}</a> : undefined}
      />
      <div className="seg" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => setParams(k === defaultTab ? {} : { range: k }, { replace: true })}>{t(l)}</button>
        ))}
      </div>
      {msg && <p className="ok small">{msg}</p>}
      {save.error && <p className="err">{save.error}</p>}
      {list.loading || list.error ? (
        <Loading error={list.error} />
      ) : byDate.size === 0 ? (
        <div className="state">{t(range === 'pending' ? 'noPendingAbsence' : 'noAbsence')}</div>
      ) : (
        [...byDate].map(([d, items]) => (
          <section key={d} className="sec">
            <div className="sec-head">
              <h2>{d} ({dayName(d)})</h2>
              <span className="muted small">{t('people', { n: items.length })}</span>
            </div>
            <ul className="rows">
              {items.map((a) => {
                if (!canDecide) return <AbsenceRow key={a.id} a={a} />;
                const det = byId.get(a.id);
                const sent = det ? manilaTime(det.created_at) : '';
                const late: Key | null = det ? (sent.slice(0, 10) > a.absence_date ? 'sentAfter' : sent.slice(0, 10) === a.absence_date ? 'sentSameDay' : null) : null;
                return (
                  <li key={a.id}>
                    <AbsenceRow a={a} bare />
                    {det && (
                      <div className="small" style={full}>
                        <p className="pre" style={{ margin: '4px 0' }}>{det.reason}</p>
                        <span className="muted">{t('sentAt', { at: sent })}</span>
                        {late && <span className="warn"> · {t(late)}</span>}
                        {det.staff_comment && <span className="muted"> · {t('memoLabel')}: {det.staff_comment}</span>}
                      </div>
                    )}
                    {a.status === 'pending' && (
                      <div className="row2" style={{ ...full, marginTop: 6 }}>
                        <input aria-label={t('memoPlaceholder')} placeholder={t('memoPlaceholder')} maxLength={300} value={memo[a.id] ?? ''} onChange={(e) => setMemo({ ...memo, [a.id]: e.target.value })} />
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary" disabled={save.busy} onClick={() => decide(a, true)}>{t('approve')}</button>
                          <button type="button" className="btn" disabled={save.busy} onClick={() => decide(a, false)}>{t('reject')}</button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
