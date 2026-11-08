import { Link } from 'react-router-dom';
import { fmt, useApi, type MemoList, type MemoRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['batch', 'campus', 'pick', 'kind', 'field', 'q'] as const;

const TABS = [
  ['upcoming', '입학 예정'],
  ['current', '재학'],
  ['all', '전체'],
] as const;

const COLUMNS: Column<MemoRow>[] = [
  ['캠퍼스', (r) => r.campus],
  ['배치', (r) => r.batch],
  ['입국일', (r) => r.depart],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['픽업', (r) => r.pickType],
  ['에이전시 메모', (r) => r.agencyMemo],
  ['마케팅 메모', (r) => r.marketingMemo],
  ['아카데미 메모', (r) => r.academyMemo],
  ['상태', (r) => r.state],
];

const Memo = ({ text }: { text: string }) => (text ? <span className="memo-text">{text}</span> : <span className="muted">-</span>);

export default function Memos() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'memo' });
  const tab = params.get('tab') ?? 'upcoming';
  const api = '/api/memos' + (query ? '?' + query : '');
  const { data, error } = useApi<MemoList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)?.[1] ?? '';

  return (
    <>
      <PageTitle title="체크 메모" path="홈 > 학생관리 > 체크 메모" />

      <div role="tablist" aria-label="학생 구분" className="tabs">
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
            <span>배치</span>
            <select value={form.batch} onChange={set('batch')}>
              <option value="">전체</option>
              {data?.facets.batches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {data?.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>픽업</span>
            <select value={form.pick} onChange={set('pick')}>
              <option value="">전체</option>
              {data?.facets.pickTypes.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="메모 종류">
            <span>메모 종류</span>
            {[['', '전체'], ['agency', '에이전시'], ['marketing', '마케팅'], ['academy', '아카데미']].map(([v, l]) => (
              <label key={v || 'all'}>
                <input type="radio" name="kind" value={v} checked={form.kind === v} onChange={set('kind')} />
                {l}
              </label>
            ))}
          </div>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="memo">메모</option>
              <option value="name">이름</option>
              <option value="no">학생번호</option>
              <option value="agency">에이전시</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
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
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>건
              <span className="muted"> · {tab === 'upcoming' ? '입국일 빠른 순' : '입국일 최근 순'} · 메모 수정은 업체 포털에서</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `체크메모_${tabLabel}_${data.refDate}.csv`, COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>캠퍼스</th>
                  <th>배치</th>
                  <th>입국일</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th className="left">에이전시</th>
                  <th>픽업</th>
                  <th className="left" style={{ minWidth: 200 }}>에이전시 메모</th>
                  <th className="left" style={{ minWidth: 200 }}>마케팅 메모</th>
                  <th className="left" style={{ minWidth: 200 }}>아카데미 메모</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={12}>조건에 맞는 메모가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{(data.page - 1) * data.size + i + 1}</td>
                    <td>{r.campus}</td>
                    <td>{r.batch}</td>
                    <td className="nowrap">{r.depart}</td>
                    <td>{r.stId}</td>
                    <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td className="nowrap">{r.pickType}</td>
                    <td className="left" style={{ fontSize: 12 }}><Memo text={r.agencyMemo} /></td>
                    <td className="left" style={{ fontSize: 12 }}><Memo text={r.marketingMemo} /></td>
                    <td className="left" style={{ fontSize: 12 }}><Memo text={r.academyMemo} /></td>
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
