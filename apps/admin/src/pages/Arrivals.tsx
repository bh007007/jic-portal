import { Link, useSearchParams } from 'react-router-dom';
import { fmt, useApi, weekday, type ArrivalRow, type Arrivals as Data, type NameCount } from '../api';
import { saveCsv, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Panel, PayText } from '../components/ui';

const COLUMNS: Column<ArrivalRow>[] = [
  ['배치', (r) => r.batch],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['성별', (r) => r.gender],
  ['캠퍼스', (r) => r.campus],
  ['코스', (r) => r.course],
  ['기숙사', (r) => r.dorm],
  ['입학일', (r) => r.start],
  ['졸업일', (r) => r.end],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['픽업', (r) => r.pickType],
  ['공항', (r) => r.place],
  ['터미널', (r) => r.terminal],
  ['항공사', (r) => r.airline],
  ['편명', (r) => r.flight],
  ['도착 일시', (r) => r.arrival],
  ['픽업 비고', (r) => r.remark],
  ['납부', (r) => r.pay],
];

/** 배치 구성 표 하나. limit 를 넘는 항목은 '그 밖'으로 묶는다. */
function CountTable({ title, items, limit }: { title: string; items: NameCount[]; limit?: number }) {
  const shown = limit && items.length > limit ? items.slice(0, limit) : items;
  const rest = items.slice(shown.length).reduce((s, i) => s + i.count, 0);
  return (
    <table className="tbl center">
      <thead>
        <tr><th className="left">{title}</th><th>인원</th></tr>
      </thead>
      <tbody>
        {shown.map((i) => <tr key={i.name}><td className="left">{i.name}</td><td>{i.count}</td></tr>)}
        {rest > 0 && <tr><td className="left muted">그 밖 {items.length - shown.length}곳</td><td className="muted">{rest}</td></tr>}
      </tbody>
    </table>
  );
}

export default function Arrivals() {
  const [params, setParams] = useSearchParams();
  const batch = params.get('batch') ?? '';
  const { data, error } = useApi<Data>('/api/arrivals' + (batch ? '?batch=' + encodeURIComponent(batch) : ''));

  return (
    <>
      <PageTitle title="입학 배치별 명단" path="홈 > 학생관리 > 입학 배치별 명단" />

      <div className="search">
        <div className="search-grid">
          <label className="field">
            <span>입학 배치</span>
            <select value={data?.batch ?? batch} onChange={(e) => setParams(e.target.value ? { batch: e.target.value } : {})}>
              {data?.batches.map((b) => (
                <option key={b.batch} value={b.batch}>
                  {b.batch} · {b.date} ({weekday(b.date)}) · {b.count}명{b.date <= data.refDate ? ' · 입국 완료' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="summary">
            <div>
              <span className="label">입국일</span>
              <span className="value" style={{ fontSize: 20 }}>{data.date ? `${data.date} (${weekday(data.date)})` : '-'}</span>
              <span className="sub">배치 {data.batch || '-'}</span>
            </div>
            <div>
              <span className="label">인원</span>
              <span className="value">{fmt(data.total)} <small>명</small></span>
            </div>
            <div>
              <span className="label">픽업</span>
              <span className="sub" style={{ fontSize: 13, color: 'var(--ink)' }}>
                {data.byType.map((t) => (
                  <span key={t.name} className={t.name === '미입력' ? 'text-red' : ''} style={{ marginRight: 10 }}>{t.name} {t.count}</span>
                ))}
              </span>
            </div>
            <div>
              <span className="label">공항</span>
              <span className="sub" style={{ fontSize: 13, color: 'var(--ink)' }}>
                {data.byPlace.length ? data.byPlace.map((p) => <span key={p.name} style={{ marginRight: 10 }}>{p.name} {p.count}</span>) : '-'}
              </span>
            </div>
          </div>

          {data.total > 0 && (
            <Panel title={<>배치 구성 <small>나이는 입국일 기준 만 나이</small></>}>
              <div className="mix">
                <table className="tbl center">
                  <thead>
                    <tr><th className="left">국적</th><th>여</th><th>남</th><th>계</th></tr>
                  </thead>
                  <tbody>
                    {data.composition.nations.map((n) => (
                      <tr key={n.name}><td className="left">{n.name}</td><td>{n.female}</td><td>{n.male}</td><td className="strong">{n.total}</td></tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th className="left">합계</th>
                      <th>{data.composition.nations.reduce((s, n) => s + n.female, 0)}</th>
                      <th>{data.composition.nations.reduce((s, n) => s + n.male, 0)}</th>
                      <th>{data.total}</th>
                    </tr>
                  </tfoot>
                </table>
                <CountTable title="코스" items={data.composition.courses} />
                <CountTable title="기숙사" items={data.composition.dorms} />
                <CountTable title="나이" items={data.composition.ages} />
                <CountTable title="에이전시" items={data.composition.agencies} limit={8} />
              </div>
            </Panel>
          )}

          <div className="toolbar">
            <span>총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>명 <span className="muted">· 도착 시각 순</span></span>
            <span className="toolbar-right">
              <DownloadButton run={() => saveCsv(`입학명단_${data.batch}_${data.date}.csv`, COLUMNS, data.rows)} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>No</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>성별</th>
                  <th>캠퍼스</th>
                  <th className="left">코스</th>
                  <th className="left">기숙사</th>
                  <th className="left">에이전시</th>
                  <th>픽업</th>
                  <th>공항</th>
                  <th className="left">터미널</th>
                  <th className="left">항공편</th>
                  <th>도착 일시</th>
                  <th className="left">픽업 비고</th>
                  <th>납부</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={15}>이 배치에 입학하는 학생이 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{i + 1}</td>
                    <td className="left nowrap"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.gender}</td>
                    <td>{r.campus}</td>
                    <td className="left">{r.course}</td>
                    <td className="left">{r.dorm}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td className={r.pickType === '미입력' ? 'text-red nowrap' : 'nowrap'}>{r.pickType}</td>
                    <td>{r.place}</td>
                    <td className="left">{r.terminal}</td>
                    <td className="left nowrap">{[r.airline, r.flight].filter(Boolean).join(' ')}</td>
                    <td className="nowrap">{r.arrival}</td>
                    <td className="left" style={{ fontSize: 12 }}>{r.remark}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
