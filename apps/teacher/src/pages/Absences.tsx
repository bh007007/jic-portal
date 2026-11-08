import { useSearchParams } from 'react-router-dom';
import { loadAbsences, type LmsAbsence } from '../data';
import { useT, type Key } from '../i18n';
import { manilaToday } from '../supabase';
import { AbsenceRow, Loading, PageHead, useLoad } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/**
 * 결석 신청(원칙 L4: 출석 현황에서 사유 표시). 학생 포털에서 낸 신청을 날짜별로 본다. 사유 글은 보이지 않고 종류·처리 상태만.
 * 승인·반려는 인트라넷 › 신청 처리에서 한다(결정 대기). 출석 원본이 생기면 출석 체크 화면에 같이 보인다.
 */
export default function Absences() {
  const { t, lang } = useT();
  const [params, setParams] = useSearchParams();
  const today = manilaToday();
  const range = params.get('range') ?? 'today';
  const [from, to] =
    range === 'tomorrow' ? [plus(today, 1), plus(today, 1)] :
    range === 'week' ? [today, plus(today, 6)] :
    [today, today];
  const { data, error, loading } = useLoad(() => loadAbsences(from, to), [from, to]);

  const byDate = new Map<string, LmsAbsence[]>();
  for (const a of data ?? []) byDate.set(a.absence_date, [...(byDate.get(a.absence_date) ?? []), a]);
  const dayName = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' });
  const tabs: [string, Key][] = [['today', 'today'], ['tomorrow', 'tomorrow'], ['week', 'days7']];

  return (
    <>
      <PageHead title={t('absences')} sub={t('absencesSub')} />
      <div className="seg" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => setParams(k === 'today' ? {} : { range: k }, { replace: true })}>{t(l)}</button>
        ))}
      </div>
      {loading || error ? (
        <Loading error={error} />
      ) : byDate.size === 0 ? (
        <div className="state">{t('noAbsence')}</div>
      ) : (
        [...byDate].map(([d, list]) => (
          <section key={d} className="sec">
            <div className="sec-head">
              <h2>{d} ({dayName(d)})</h2>
              <span className="muted small">{t('people', { n: list.length })}</span>
            </div>
            <ul className="rows">{list.map((a) => <AbsenceRow key={a.id} a={a} />)}</ul>
          </section>
        ))
      )}
    </>
  );
}
