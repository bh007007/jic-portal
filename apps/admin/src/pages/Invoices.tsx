import { Link } from 'react-router-dom';
import { fmt, useApi, type InvoiceList, type InvoiceRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, PayText, SizeSelect, currencyText } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['campus', 'nation', 'pay', 'currency', 'agency', 'field', 'q'] as const;

const TABS = [
  ['current', '재학'],
  ['upcoming', '입학 예정'],
  ['graduated', '졸업'],
  ['all', '전체 연수'],
] as const;

const COLUMNS: Column<InvoiceRow>[] = [
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ['입학일', (r) => r.start],
  ['졸업일', (r) => r.end],
  ['주', (r) => r.weeks],
  ['배치', (r) => r.batch],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['통화', (r) => r.currency],
  ['납부 상태', (r) => r.pay],
  ['인보이스 총액', (r) => r.total],
  ['입금 매칭 합계', (r) => r.paid],
  ['미입금', (r) => r.remaining],
  ['현지 청구', (r) => r.localBilled],
  ['현지 납부', (r) => r.localPaid],
  ['포인트 충전', (r) => r.pointIn],
  ['포인트 사용', (r) => r.pointOut],
  ['포인트 잔액', (r) => r.pointBalance],
  ['연수 상태', (r) => r.state],
];

export default function Invoices() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'name' });
  const tab = params.get('tab') ?? 'current';
  const api = '/api/invoices' + (query ? '?' + query : '');
  const { data, error } = useApi<InvoiceList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)?.[1] ?? '';

  return (
    <>
      <PageTitle title="인보이스" path="홈 > 회계 > 인보이스" />

      <div role="tablist" aria-label="연수 구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}>
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
              {data?.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>국적</span>
            <select value={form.nation} onChange={set('nation')}>
              <option value="">전체</option>
              {data?.facets.nations.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="납부 상태">
            <span>납부 상태</span>
            {['', '미납', '부분납', '완납'].map((v) => (
              <label key={v || 'all'}>
                <input type="radio" name="pay" value={v} checked={form.pay === v} onChange={set('pay')} />
                {v || '전체'}
              </label>
            ))}
          </div>
          <label className="field">
            <span>통화</span>
            <select value={form.currency} onChange={set('currency')}>
              <option value="">전체</option>
              {data?.facets.currencies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>에이전시</span>
            <select value={form.agency} onChange={set('agency')}>
              <option value="">전체</option>
              {data?.facets.agencies.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.count})</option>)}
            </select>
          </label>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="name">이름</option>
              <option value="no">학생번호</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'current' ? {} : { tab })}>초기화</button>
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
              <span className="muted">
                {' · '}
                {data.totals.byPay.map((p) => `${p.name} ${fmt(p.count)}`).join(' · ')}
              </span>
              <span className="muted" style={{ display: 'block', marginTop: 2, fontSize: 12 }}>
                인보이스 총액 {currencyText(data.totals.totalByCurrency)}
                {' · '}입금 매칭 {currencyText(data.totals.paidByCurrency)}
                {' · '}
                <span className={data.totals.remainingByCurrency.length ? 'text-red' : ''}>미입금 {currencyText(data.totals.remainingByCurrency)}</span>
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `인보이스_${tabLabel}_${data.refDate}.csv`, COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1520 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th>입학일</th>
                  <th>졸업일</th>
                  <th>주</th>
                  <th className="left">에이전시</th>
                  <th>통화</th>
                  <th>납부</th>
                  <th className="num">인보이스 총액</th>
                  <th className="num">입금 매칭 합계</th>
                  <th className="num">미입금</th>
                  <th className="num">포인트 충전</th>
                  <th className="num">포인트 사용</th>
                  <th className="num">포인트 잔액</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={17}>조건에 맞는 연수가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td>{r.stId}</td>
                    <td className="left nowrap"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    <td className="nowrap">{r.start}</td>
                    <td className="nowrap">{r.end}</td>
                    <td>{r.weeks}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td>{r.currency || '-'}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                    <td className={'num' + (r.total ? '' : ' muted')}>{r.hasInvoice ? fmt(r.total) : '-'}</td>
                    <td className={'num' + (r.paid ? '' : ' muted')}>{r.hasInvoice ? fmt(r.paid) : '-'}</td>
                    <td className={'num' + (r.remaining ? ' text-red' : ' muted')}>{r.hasInvoice ? fmt(r.remaining) : '-'}</td>
                    <td className={'num' + (r.pointIn ? '' : ' muted')}>{r.hasInvoice ? fmt(r.pointIn) : '-'}</td>
                    <td className={'num' + (r.pointOut ? '' : ' muted')}>{r.hasInvoice ? fmt(r.pointOut) : '-'}</td>
                    <td className={'num' + (r.pointBalance ? ' strong' : ' muted')}>{r.hasInvoice ? fmt(r.pointBalance) : '-'}</td>
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
