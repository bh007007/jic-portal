import { Link, useSearchParams } from 'react-router-dom';
import { ABSENCE_KIND, ABSENCE_STATUS, loadAbsences, periodText, type LmsAbsence } from '../data';
import { manilaToday } from '../supabase';
import { Loading, PageHead, useLoad } from '../ui';

const plus = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const WEEK = '일월화수목금토';

/**
 * 결석 신청(원칙 L4: 출석 현황에서 사유 표시). 학생 포털에서 낸 신청을 날짜별로 본다. 사유 글은 보이지 않고 종류·처리 상태만.
 * 승인·반려는 인트라넷 › 신청 처리에서 한다(결정 대기). 출석 원본이 생기면 출석 체크 화면에 같이 보인다.
 */
export default function Absences() {
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

  return (
    <>
      <PageHead title="결석 신청" sub="학생 포털에서 낸 신청 · 승인은 인트라넷" />
      <div className="seg" role="tablist">
        {[['today', '오늘'], ['tomorrow', '내일'], ['week', '7일']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => setParams(k === 'today' ? {} : { range: k }, { replace: true })}>{l}</button>
        ))}
      </div>
      {loading || error ? (
        <Loading error={error} />
      ) : byDate.size === 0 ? (
        <div className="state">이 기간에 결석 신청이 없습니다.</div>
      ) : (
        [...byDate].map(([d, list]) => (
          <section key={d} className="sec">
            <div className="sec-head">
              <h2>{d} ({WEEK[new Date(d + 'T00:00:00').getDay()]})</h2>
              <span className="muted small">{list.length}명</span>
            </div>
            <ul className="rows">
              {list.map((a) => (
                <li key={a.id}>
                  <Link to={`/students/${a.student_no}`}>{a.name || a.student_no}</Link>
                  <span className={a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'err' : 'muted'}>{ABSENCE_STATUS[a.status]}</span>
                  <span className="muted small">{a.campus} · {periodText(a.periods)} · {ABSENCE_KIND[a.kind]}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
