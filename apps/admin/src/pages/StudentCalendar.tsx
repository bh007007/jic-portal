import { Link, useSearchParams } from 'react-router-dom';
import { fmt, useApi, type CalendarDay, type CalendarStudent, type StudentCalendar as Calendar } from '../api';
import { saveCsv, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Panel } from '../components/ui';
import { useHolidays } from '../holidays';

const KIND_LABEL = { in: '재원', arrive: '입국', leave: '귀국' } as const;

const COLUMNS: Column<CalendarStudent>[] = [
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['성별', (r) => r.gender],
  ['캠퍼스', (r) => r.campus],
  ['코스', (r) => r.course],
  ['기숙사', (r) => r.dorm],
  ['기숙사 밖', (r) => r.offsite],
  ['입국일', (r) => r.depart],
  ['귀국일', (r) => r.ret],
  ['배치', (r) => r.batch],
  ['에이전시', (r) => r.agency],
];

const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

export default function StudentCalendar() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error } = useApi<Calendar>('/api/stats/calendar' + (query ? '?' + query : ''));

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };
  const choose = (day: string, kind: 'in' | 'arrive' | 'leave') => apply({ day, kind: kind === 'in' ? '' : kind });

  // 달력 칸: 첫 주 앞의 빈칸(일요일 시작) + 날짜
  const lead = data ? new Date(data.month + '-01T00:00:00').getDay() : 0;
  const cells: (CalendarDay | null)[] = data ? [...Array(lead).fill(null), ...data.days] : [];
  while (cells.length % 7) cells.push(null);
  const sel = data?.selected;
  const holidays = useHolidays(data?.days[0]?.date ?? '', data?.days[data.days.length - 1]?.date ?? '', data?.campus ?? '');

  return (
    <>
      <PageTitle title="학생수 달력" path="홈 > 통계 > 학생수 달력" />

      <div className="toolbar">
        <span className="cal-nav">
          <button type="button" className="btn" aria-label="이전 달" disabled={!data} onClick={() => data && apply({ month: data.prev, day: '', kind: '' })}>‹</button>
          <strong>{data ? monthLabel(data.month) : ''}</strong>
          <button type="button" className="btn" aria-label="다음 달" disabled={!data} onClick={() => data && apply({ month: data.next, day: '', kind: '' })}>›</button>
          {data && data.month !== data.refDate.slice(0, 7) && (
            <button type="button" className="btn btn-xs" onClick={() => apply({ month: '', day: '', kind: '' })}>이번 달</button>
          )}
        </span>
        <span className="toolbar-right">
          <select aria-label="캠퍼스" value={params.get('campus') ?? ''} onChange={(e) => apply({ campus: e.target.value })}>
            <option value="">전체 캠퍼스</option>
            {data?.campuses.map((c) => <option key={c}>{c}</option>)}
          </select>
        </span>
      </div>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="summary">
            <div>
              <span className="label">재원 (최대 / 최소)</span>
              <span className="value">{fmt(data.totals.max)}<small> / {fmt(data.totals.min)}명</small></span>
            </div>
            <div>
              <span className="label">입국</span>
              <span className="value">{fmt(data.totals.arrive)}<small>명</small></span>
            </div>
            <div>
              <span className="label">귀국</span>
              <span className="value">{fmt(data.totals.leave)}<small>명</small></span>
            </div>
          </div>

          <div className="grid-box">
            <table className="cal" aria-label={`${monthLabel(data.month)} 학생수`}>
              <thead>
                <tr>{'일월화수목금토'.split('').map((w, i) => <th key={w} className={i === 0 ? 'text-red' : i === 6 ? 'text-blue' : ''}>{w}</th>)}</tr>
              </thead>
              <tbody>
                {Array.from({ length: cells.length / 7 }, (_, w) => (
                  <tr key={w}>
                    {cells.slice(w * 7, w * 7 + 7).map((d, i) =>
                      d ? (
                        <td key={d.date} className={(d.date === data.refDate ? 'today' : '') + (sel?.date === d.date ? ' on' : '')}>
                          <div className="cal-day">
                            <span className={i === 0 || holidays.has(d.date) ? 'text-red' : i === 6 ? 'text-blue' : ''}>{Number(d.date.slice(8))}</span>
                            {holidays.has(d.date) && (
                              <span className="cal-holiday text-red" title={holidays.get(d.date)!.map((h) => (h.campus ? `${h.name} (${h.campus})` : h.name)).join(', ')}>
                                {holidays.get(d.date)!.map((h) => h.name).join(', ')}
                              </span>
                            )}
                          </div>
                          <button type="button" className="cal-in" onClick={() => choose(d.date, 'in')} aria-label={`${d.date} 재원 ${d.inSchool}명`}>
                            {fmt(d.inSchool)}
                          </button>
                          <div className="cal-moves">
                            {d.arrive > 0 && <button type="button" className="text-blue" onClick={() => choose(d.date, 'arrive')}>입국 {d.arrive}</button>}
                            {d.leave > 0 && <button type="button" className="text-amber" onClick={() => choose(d.date, 'leave')}>귀국 {d.leave}</button>}
                          </div>
                          {!data.campus && (
                            <div className="cal-campus muted">
                              {data.campuses.filter((c) => d.byCampus[c]).map((c) => `${c.slice(0, 1)} ${d.byCampus[c]}`).join(' · ')}
                            </div>
                          )}
                        </td>
                      ) : (
                        <td key={'e' + w + i} className="blank" />
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            재원 = 입국일 ≤ 날짜 &lt; 귀국일 (캔슬·연기 제외). 캠퍼스는 첫 코스 캠퍼스{data.campuses.length ? ` (${data.campuses.map((c) => `${c.slice(0, 1)} ${c}`).join(', ')})` : ''}.
          </p>

          {sel && (
            <Panel
              title={<>{sel.date} {KIND_LABEL[sel.kind]} <small>{fmt(sel.rows.length)}명{sel.kind === 'in' ? ` · 기숙사 밖 ${sel.rows.filter((r) => r.offsite).length}명` : ''}</small></>}
              extra={
                <span className="toolbar-right">
                  <DownloadButton run={() => saveCsv(`학생수_${sel.date}_${KIND_LABEL[sel.kind]}${data.campus ? '_' + data.campus : ''}.csv`, COLUMNS, sel.rows)} />
                  <button type="button" className="btn" onClick={() => apply({ day: '', kind: '' })}>닫기</button>
                </span>
              }
            >
              <table className="tbl center" style={{ minWidth: 1080 }}>
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>No</th>
                    <th>학생번호</th>
                    <th className="left">이름</th>
                    <th>국적</th>
                    <th>캠퍼스</th>
                    <th className="left">코스</th>
                    <th className="left">기숙사</th>
                    <th>입국일</th>
                    <th>귀국일</th>
                    <th>배치</th>
                    <th className="left">에이전시</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.rows.length === 0 && <tr className="empty"><td colSpan={11}>해당 학생이 없습니다.</td></tr>}
                  {sel.rows.map((r, i) => (
                    <tr key={r.trId}>
                      <td className="muted">{i + 1}</td>
                      <td>{r.stId}</td>
                      <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                      <td>{r.nation}</td>
                      <td>{r.campus}</td>
                      <td className="left">{r.course}</td>
                      <td className="left">{r.dorm}{r.offsite ? <span className="muted"> (기숙사 밖)</span> : ''}</td>
                      <td className="nowrap">{r.depart}</td>
                      <td className="nowrap">{r.ret}</td>
                      <td>{r.batch}</td>
                      <td className="left">{r.agency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
