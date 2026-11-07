import { Link } from 'react-router-dom';
import { fmt, useApi, type AgencyList, type AgencyRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['country', 'active', 'q'] as const;

const ACTIVE = [
  ['', '전체'],
  ['current', '재학생 있음'],
  ['upcoming', '입학 예정 있음'],
  ['none', '실적 없음'],
] as const;

const AGENCY_COLUMNS: Column<AgencyRow>[] = [
  ['에이전시번호', (r) => r.agId],
  ['에이전시명', (r) => r.name],
  ['영문명', (r) => r.nameEn],
  ['국가', (r) => r.country],
  ['담당자(사용)', (r) => r.agents],
  ['재학', (r) => r.current],
  ['입학 예정', (r) => r.upcoming],
  ['누적 연수', (r) => r.total],
  ['최근 입학일', (r) => r.lastStart],
  ['등록일', (r) => r.registered],
];

export default function Agencies() {
  const { query, form, set, apply, submit, reset } = useSearchForm(KEYS);
  const api = '/api/agencies' + (query ? '?' + query : '');
  const { data, error } = useApi<AgencyList>(api);

  return (
    <>
      <PageTitle title="에이전시 목록" path="홈 > 에이전시 > 에이전시 목록" />

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>국가</span>
            <select value={form.country} onChange={set('country')}>
              <option value="">전체</option>
              {data?.facets.countries.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="학생 실적">
            <span>학생</span>
            {ACTIVE.map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="active" value={v} checked={form.active === v} onChange={set('active')} />
                {label}
              </label>
            ))}
          </div>
          <label className="field">
            <span>에이전시명</span>
            <input type="text" value={form.q} onChange={set('q')} placeholder="한글·영문" />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={reset}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>곳
              <span className="muted"> · 전체 {fmt(data.totals.agencies)}곳 중 재학생 있는 곳 {fmt(data.totals.withCurrent)}곳</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `에이전시_${data.refDate}.csv`, AGENCY_COLUMNS)} />
              <select aria-label="페이지당 개수" value={String(data.size)} onChange={(e) => apply({ size: e.target.value, page: '' })}>
                <option value="20">20개씩</option>
                <option value="50">50개씩</option>
                <option value="100">100개씩</option>
              </select>
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th className="left">에이전시명</th>
                  <th>국가</th>
                  <th>담당자</th>
                  <th>재학</th>
                  <th>입학 예정</th>
                  <th>누적 연수</th>
                  <th>최근 입학일</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={9}>조건에 맞는 에이전시가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.agId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className="left">
                      <Link to={`/agencies/${r.agId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link>
                      {r.demo && <span className="muted"> (데모)</span>}
                      {r.nameEn && r.nameEn !== r.name && <div className="muted" style={{ fontSize: 12 }}>{r.nameEn}</div>}
                    </td>
                    <td>{r.country}</td>
                    <td>{r.agents}</td>
                    <td className={r.current ? 'strong' : 'muted'}>{fmt(r.current)}</td>
                    <td className={r.upcoming ? '' : 'muted'}>{fmt(r.upcoming)}</td>
                    <td>{fmt(r.total)}</td>
                    <td className="nowrap">{r.lastStart || '-'}</td>
                    <td className="nowrap muted">{r.registered}</td>
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
