import { useApi, type DepartureList } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { dateWithDay, md } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['from', 'to', 'campus', 'ride'] as const;
const AIRPORT: Record<string, string> = { MANILA: '마닐라', CLARK: '클락', OTHER: '기타' };

/** 학생 앱에서 등록한 귀국 항공편(공항 이동 배차용)과, 졸업 14일 이내인데 아직 등록하지 않은 학생. */
export default function Departures() {
  const f = useSearchForm(KEYS);
  const view = f.params.get('view') || 'registered';
  const { data, error, reload } = useApi<DepartureList>('/api/departures?' + f.query);
  return (
    <>
      <PageTitle title="귀국 일정" path="홈 > 학생 생활 > 귀국 일정" />
      <Tabs
        label="보기"
        value={view}
        onChange={(k) => f.apply({ view: k === 'registered' ? '' : k })}
        items={[
          { key: 'registered', label: `등록 (${data?.counts.registered ?? 0})` },
          { key: 'missing', label: `미등록, 졸업 14일 이내 (${data?.counts.missing ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          {view === 'registered' && (
            <div className="field range">
              <span>출발일</span>
              <input type="date" aria-label="시작일" value={f.form.from || data?.from || ''} onChange={f.set('from')} />
              <span className="nowrap">~</span>
              <input type="date" aria-label="종료일" value={f.form.to || data?.to || ''} onChange={f.set('to')} />
            </div>
          )}
          <label className="field">
            <span>캠퍼스</span>
            <select value={f.form.campus} onChange={f.set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {view === 'registered' && (
            <label className="field">
              <span>차량</span>
              <select value={f.form.ride} onChange={f.set('ride')}>
                <option value="">전체</option>
                <option value="1">공항 이동 차량 요청만</option>
              </select>
            </label>
          )}
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={f.reset}>
            초기화
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            조회
          </button>
        </div>
      </form>
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : view === 'missing' ? (
        <>
          <div className="toolbar">
            <span>
              {dateWithDay(data.today)}부터 14일 안에 연수가 끝나는 재학생 중 귀국 항공편을 등록하지 않은 학생 <strong className="text-primary">{data.missing.length}</strong>명
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>연수 종료</th>
                  <th>남은 날</th>
                </tr>
              </thead>
              <tbody>
                {data.missing.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={4}>모두 등록했습니다.</td>
                  </tr>
                ) : (
                  data.missing.map((r) => (
                    <tr key={r.trId}>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} /> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td>{dateWithDay(r.end)}</td>
                      <td className={r.daysLeft <= 3 ? 'text-red strong' : ''}>{r.daysLeft === 0 ? '오늘' : `${r.daysLeft}일`}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar">
            <span>
              {dateWithDay(data.from)} ~ {dateWithDay(data.to)} 출발 <strong className="text-primary">{data.registered.length}</strong>명 · 공항 이동 차량 요청 {data.counts.rides}명
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>출발일</th>
                  <th>시각</th>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>연수 종료</th>
                  <th>항공편</th>
                  <th>공항</th>
                  <th>차량</th>
                  <th className="left">메모</th>
                </tr>
              </thead>
              <tbody>
                {data.registered.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={9}>이 기간에 출발하는 학생이 없습니다.</td>
                  </tr>
                ) : (
                  data.registered.map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{dateWithDay(d.date)}</td>
                      <td>{d.time}</td>
                      <td className="left">
                        <StudentLink stId={d.stId} name={d.name} /> <span className="muted small">{d.stId}</span>
                      </td>
                      <td>{d.campus}</td>
                      <td>{d.end ? md(d.end) : '-'}</td>
                      <td>{d.flight}</td>
                      <td>{AIRPORT[d.airport] ?? d.airport}</td>
                      <td>{d.needsRide ? <span className="text-amber strong">요청</span> : <span className="muted">-</span>}</td>
                      <td className="left memo-text">{d.note || <span className="muted">-</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
