import { Link, useSearchParams } from 'react-router-dom';
import { fmt, useApi, weekday, type DormOverview, type DormStay } from '../api';
import { Loading, PageTitle, Panel } from '../components/ui';

const md = (d: string) => d.slice(5).replace('-', '/');

function StayTable({ rows, dateKey, empty }: { rows: DormStay[]; dateKey: 'from' | 'to'; empty: string }) {
  return (
    <table className="tbl center">
      <thead>
        <tr><th>날짜</th><th className="left">이름</th><th>국적</th><th>성별</th><th className="left">타입</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr className="empty"><td colSpan={5}>{empty}</td></tr>}
        {rows.map((r) => (
          <tr key={r.trId}>
            <td>{md(r[dateKey])} ({weekday(r[dateKey])})</td>
            <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none' }}>{r.name}</Link></td>
            <td>{r.nation}</td>
            <td>{r.gender}</td>
            <td className="left">{r.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Dorm() {
  const [params, setParams] = useSearchParams();
  const campus = params.get('campus') ?? '';
  const { data, error } = useApi<DormOverview>('/api/dorm' + (campus ? `?campus=${encodeURIComponent(campus)}` : ''));

  return (
    <>
      <PageTitle title="기숙사 배정 현황" path="홈 > 기숙사 > 배정 현황" />

      <form className="search" aria-label="검색 조건" onSubmit={(e) => e.preventDefault()}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 24px' }}>
          <label className="field">
            <span style={{ flex: '0 0 auto' }}>캠퍼스</span>
            <select value={campus} onChange={(e) => setParams(e.target.value ? { campus: e.target.value } : {})} style={{ minWidth: 160 }}>
              <option value="">전체</option>
              {data?.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {data && <span className="muted">기준일 {data.refDate} · 예정은 {md(data.until)}까지</span>}
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <section className="summary" aria-label="입실 현황">
            <div><span className="label">현재 입실</span><span className="value">{fmt(data.totals.staying)}<small> 명</small></span></div>
            <div><span className="label">입실 예정 (~{md(data.until)})</span><span className="value">{fmt(data.totals.arriving)}<small> 명</small></span></div>
            <div><span className="label">퇴실 예정 (~{md(data.until)})</span><span className="value">{fmt(data.totals.leaving)}<small> 명</small></span></div>
          </section>

          <Panel title="기숙사 타입별 현황">
            <table className="tbl center">
              <thead>
                <tr><th className="left">타입</th><th>현재</th><th>여</th><th>남</th><th>입실 예정</th><th>퇴실 예정</th></tr>
              </thead>
              <tbody>
                {data.types.map((t) => (
                  <tr key={t.type}>
                    <td className="left">{t.type}</td>
                    <td className="strong">{t.staying}</td>
                    <td>{t.female}</td>
                    <td>{t.male}</td>
                    <td style={t.arriving ? { color: 'var(--primary)', fontWeight: 700 } : undefined}>{t.arriving}</td>
                    <td className={t.leaving ? 'text-red strong' : ''}>{t.leaving}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="row">
            <Panel title={<>입실 예정 <small>({data.arriving.length})</small></>}>
              <StayTable rows={data.arriving} dateKey="from" empty="예정된 입실이 없습니다." />
            </Panel>
            <Panel title={<>퇴실 예정 <small>({data.leaving.length})</small></>}>
              <StayTable rows={data.leaving} dateKey="to" empty="예정된 퇴실이 없습니다." />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
