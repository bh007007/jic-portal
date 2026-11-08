import { Link } from 'react-router-dom';
import { fmt, useApi, weekday, type BatchList, type BatchRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, Panel, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['campus', 'year'] as const;

const TABS = [
  ['upcoming', '예정 배치'],
  ['past', '지난 배치'],
  ['all', '전체'],
] as const;

export default function Batches() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS);
  const tab = params.get('tab') ?? 'upcoming';
  const api = '/api/batches' + (query ? '?' + query : '');
  const { data, error } = useApi<BatchList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)?.[1] ?? '';
  const campus = params.get('campus') ?? '';
  // 캠퍼스를 고르면 그 캠퍼스 열만 보여 준다.
  const campusCols = data ? (campus ? [campus] : data.campuses) : [];

  const columns = (): Column<BatchRow>[] => [
    ['배치', (r) => r.batch],
    ['입국일', (r) => r.date],
    ['수업 시작', (r) => r.start],
    [campus ? '전체 인원' : '인원', (r) => r.total],
    ...campusCols.map((c): Column<BatchRow> => [c, (r) => r.byCampus[c] ?? 0]),
    [campus ? '취소(전체)' : '취소', (r) => r.cancelled],
    ['구분', (r) => (r.upcoming ? '예정' : '입국 완료')],
  ];

  return (
    <>
      <PageTitle title="캠퍼스·배치" path="홈 > 기초관리 > 캠퍼스·배치" />

      {data && (
        <Panel title="캠퍼스">
          <table className="tbl center">
            <thead>
              <tr>
                <th className="left">캠퍼스</th>
                <th>재학</th>
                <th>입학 예정</th>
                <th>누적 연수</th>
                <th>다음 배치</th>
              </tr>
            </thead>
            <tbody>
              {data.campusStats.map((c) => (
                <tr key={c.name}>
                  <td className="left strong">{c.name}</td>
                  <td>{fmt(c.current)}</td>
                  <td>{fmt(c.upcoming)}</td>
                  <td>{fmt(c.total)}</td>
                  <td>{c.nextBatch || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div role="tablist" aria-label="배치 구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'upcoming' ? {} : { tab: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>연도</span>
            <select value={form.year} onChange={set('year')}>
              <option value="">전체</option>
              {data?.facets.years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'upcoming' ? {} : { tab })}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>개 배치
              <span className="muted"> · {campus ? `${campus} ` : ''}인원 {fmt(data.people)}명 (취소 제외)</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `배치_${tabLabel}${campus ? '_' + campus : ''}_${data.refDate}.csv`, columns())} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 760 + campusCols.length * 90 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>배치</th>
                  <th>입국일</th>
                  <th>수업 시작</th>
                  <th>{campus ? '전체 인원' : '인원'}</th>
                  {campusCols.map((c) => <th key={c}>{c}</th>)}
                  <th>{campus ? '취소(전체)' : '취소'}</th>
                  <th>구분</th>
                  <th>명단</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={8 + campusCols.length}>조건에 맞는 배치가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.batch}>
                    <td className="muted">{(data.page - 1) * data.size + i + 1}</td>
                    <td className="strong">{r.batch}</td>
                    <td className="nowrap">{r.date} ({weekday(r.date)})</td>
                    <td className="nowrap">{r.start || '-'}</td>
                    <td className="strong">{fmt(r.total)}</td>
                    {campusCols.map((c) => <td key={c} className={r.byCampus[c] ? '' : 'muted'}>{fmt(r.byCampus[c] ?? 0)}</td>)}
                    <td className={r.cancelled ? '' : 'muted'}>{fmt(r.cancelled)}</td>
                    <td className={r.upcoming ? 'text-blue' : 'muted'}>{r.upcoming ? '예정' : '입국 완료'}</td>
                    <td>{r.linkable ? <Link to={`/arrivals?batch=${encodeURIComponent(r.batch)}`}>보기</Link> : <span className="muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={data.page} pages={data.pages} onPage={(p) => apply({ page: String(p) })} />
        </>
      )}
    </>
  );
}
