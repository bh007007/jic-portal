import { Link } from 'react-router-dom';
import { fmt, useApi, type AgentList, type AgentRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['country', 'active', 'field', 'q'] as const;

const COLUMNS: Column<AgentRow>[] = [
  ['담당자번호', (r) => r.amId],
  ['에이전시', (r) => r.agency],
  ['국가', (r) => r.country],
  ['담당자명', (r) => r.name],
  ['지점', (r) => r.branch],
  ['로그인 ID', (r) => r.loginId],
  ['언어', (r) => r.lang],
  ['대표', (r) => r.main],
  ['사용', (r) => r.active],
  ['인보이스 수신', (r) => r.invoice],
  ['재학', (r) => r.current],
  ['입학 예정', (r) => r.upcoming],
  ['누적 연수', (r) => r.total],
  ['최근 입학일', (r) => r.lastStart],
];

export default function Agents() {
  const { query, form, set, apply, submit, reset } = useSearchForm(KEYS, { field: 'name' });
  const api = '/api/agents' + (query ? '?' + query : '');
  const { data, error } = useApi<AgentList>(api);

  return (
    <>
      <PageTitle title="담당자 계정" path="홈 > 에이전시 > 담당자 계정" />

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>국가</span>
            <select value={form.country} onChange={set('country')}>
              <option value="">전체</option>
              {data?.facets.countries.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="사용 여부">
            <span>사용 여부</span>
            {[['', '전체'], ['Y', '사용'], ['N', '미사용']].map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="active" value={v} checked={form.active === v} onChange={set('active')} />
                {label}
              </label>
            ))}
          </div>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="name">이름·지점</option>
              <option value="login">로그인 ID</option>
              <option value="agency">에이전시</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
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
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>명

            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `담당자계정_${data.refDate}.csv`, COLUMNS)} />
              <select aria-label="페이지당 개수" value={String(data.size)} onChange={(e) => apply({ size: e.target.value, page: '' })}>
                <option value="20">20개씩</option>
                <option value="50">50개씩</option>
                <option value="100">100개씩</option>
              </select>
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th className="left">에이전시</th>
                  <th>국가</th>
                  <th className="left">담당자명</th>
                  <th className="left">지점</th>
                  <th className="left">로그인 ID</th>
                  <th>언어</th>
                  <th>대표</th>
                  <th>사용</th>
                  <th className="left">이메일</th>
                  <th>재학</th>
                  <th>누적 연수</th>
                  <th>최근 입학일</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={13}>조건에 맞는 담당자가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.amId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className="left"><Link to={`/agencies/${r.agId}`} style={{ textDecoration: 'none' }}>{r.agency || '-'}</Link></td>
                    <td>{r.country}</td>
                    <td className="left strong">{r.name}</td>
                    <td className="left">{r.branch}</td>
                    <td className="left">{r.loginId}</td>
                    <td>{r.lang}</td>
                    <td>{r.main ? '대표' : ''}</td>
                    <td className={r.active ? '' : 'text-red'}>{r.active ? '사용' : '미사용'}</td>
                    <td className="left muted">{r.email}</td>
                    <td className={r.current ? 'strong' : 'muted'}>{fmt(r.current)}</td>
                    <td>{fmt(r.total)}</td>
                    <td className="nowrap">{r.lastStart || '-'}</td>
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
