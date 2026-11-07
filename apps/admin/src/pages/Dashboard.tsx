import { Link } from 'react-router-dom';
import { fmt, pct, useApi, weekday, type Dashboard as DashboardData } from '../api';
import { Loading, PageTitle, Panel } from '../components/ui';

const CAMPUSES = ['Premium', 'Challenger', 'MCO'];
const SYNC_ROWS: [string, string][] = [
  ['학생', 'students'],
  ['연수', 'enrollments'],
  ['인보이스', 'invoices'],
  ['기숙사 배정', 'dorm_assignments'],
  ['에이전시', 'agencies'],
  ['담당자 계정', 'agents'],
];

const md = (d: string) => (d ? d.slice(5).replace('-', '/') : '');

function stamp(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Dashboard() {
  const { data, error } = useApi<DashboardData>('/api/dashboard');

  if (!data) {
    return (
      <>
        <PageTitle title="대시보드" path="홈" />
        <Loading error={error} />
      </>
    );
  }

  const campusCount = (name: string) => data.current.byCampus.find((c) => c.name === name)?.count ?? 0;
  const campuses = [...CAMPUSES, ...data.current.byCampus.map((c) => c.name).filter((n) => !CAMPUSES.includes(n))];
  const [b1, b2] = data.batches;
  const maxNation = Math.max(1, ...data.nations.map((n) => n.count));
  const pickupDates = data.pickup.batches.map((b) => md(b.date)).join('·');

  return (
    <>
      <PageTitle title="대시보드" path="홈" />

      <section className="summary" aria-label="현황 요약">
        <div>
          <span className="label">재학생</span>
          <span className="value">{fmt(data.current.total)}<small> 명</small></span>
          <span className="sub">{campuses.filter((c) => campusCount(c) > 0).map((c) => `${c} ${campusCount(c)}`).join(' / ')}</span>
        </div>
        <div>
          <span className="label">입학 예정 {b1 ? `(${md(b1.date)})` : ''}</span>
          <span className="value">{fmt(b1?.count ?? 0)}<small> 명</small></span>
          <span className="sub">{b2 ? `${md(b2.date)} 입학 ${b2.count}명` : '-'}</span>
        </div>
        <div>
          <span className="label">졸업 예정 (~{md(data.graduating.until)})</span>
          <span className="value">{fmt(data.graduating.total)}<small> 명</small></span>
          <span className="sub">방 정리·정산 미처리 {data.graduating.notCleared}</span>
        </div>
        <div>
          <span className="label">에이전시</span>
          <span className="value">{fmt(data.agencies)}<small> 개</small></span>
          <span className="sub">담당자 계정 {fmt(data.agents)}</span>
        </div>
      </section>

      <div className="row">
        <Panel title="처리 필요">
          <table className="tbl center">
            <thead>
              <tr>
                <th style={{ width: 56 }}>구분</th>
                <th>내용</th>
                <th style={{ width: 56 }}>건수</th>
                <th style={{ width: 60 }}><span className="sr-only">이동</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="muted">픽업</td>
                <td className="left">{pickupDates} 입학생 항공편 미입력</td>
                <td className={'strong' + (data.pickup.missing ? ' text-red' : '')}>{data.pickup.missing}</td>
                <td><Link className="btn btn-xs" to="/arrivals">보기</Link></td>
              </tr>
              <tr>
                <td className="muted">픽업</td>
                <td className="left">BESA 그룹 픽업 대상 확인</td>
                <td className="strong">{data.pickup.besa}</td>
                <td><Link className="btn btn-xs" to="/arrivals">보기</Link></td>
              </tr>
              <tr>
                <td className="muted">졸업</td>
                <td className="left">~{md(data.graduating.until)} 졸업 예정자 방 정리·포인트 정산</td>
                <td className={'strong' + (data.graduating.notCleared ? ' text-red' : '')}>{data.graduating.notCleared}</td>
                <td><Link className="btn btn-xs" to="/students?tab=current">보기</Link></td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="입학 일정" extra={<Link className="more" to="/arrivals">더보기 +</Link>}>
          <table className="tbl center">
            <thead>
              <tr><th>배치</th><th>입학일</th><th>인원(명)</th></tr>
            </thead>
            <tbody>
              {data.batches.map((b) => (
                <tr key={b.batch + b.date}>
                  <td>{b.batch ? <Link to={`/arrivals?batch=${encodeURIComponent(b.batch)}`} style={{ textDecoration: 'none' }}>{b.batch}</Link> : '-'}</td>
                  <td>{b.date} ({weekday(b.date)})</td>
                  <td className="strong">{b.count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2} scope="row">합계</th>
                <td className="strong">{data.batches.reduce((s, b) => s + b.count, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      </div>

      <div className="row">
        <Panel title="재학생 국적별 현황" extra={<span className="more">기준일 {data.refDate}</span>}>
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 140 }}>국적</th><th style={{ width: 80 }}>인원(명)</th><th>비율</th></tr>
            </thead>
            <tbody>
              {data.nations.map((n) => (
                <tr key={n.name}>
                  <td style={{ textAlign: 'center' }}>{n.name}</td>
                  <td style={{ textAlign: 'center' }}>{n.count}</td>
                  <td>
                    <div className="bar-cell">
                      <div className="bar"><div style={{ width: (n.count / maxNation) * 100 + '%', background: n.name === '기타' ? '#b8bdc6' : undefined }} /></div>
                      <span>{pct(n.count, data.current.total)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">합계</th>
                <td style={{ textAlign: 'center' }} className="strong">{data.current.total}</td>
                <td className="num muted">100%</td>
              </tr>
            </tfoot>
          </table>
        </Panel>

        <div className="col" style={{ flex: '2 1 320px' }}>
          <Panel title="캠퍼스별 재학생">
            <table className="tbl center">
              <thead>
                <tr><th>캠퍼스</th><th>재학(명)</th><th>비율</th></tr>
              </thead>
              <tbody>
                {campuses.map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className={campusCount(c) ? 'strong' : ''}>{campusCount(c)}</td>
                    <td className="muted">{campusCount(c) ? pct(campusCount(c), data.current.total) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="데이터 갱신 현황">
            <table className="tbl center">
              <thead>
                <tr><th>구분</th><th>건수</th><th>최종 갱신</th></tr>
              </thead>
              <tbody>
                {SYNC_ROWS.map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{fmt(data.sync.counts[key] ?? 0)}</td>
                    <td className="muted">{stamp(data.sync.extractedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
