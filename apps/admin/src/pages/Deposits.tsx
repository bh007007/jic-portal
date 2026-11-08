import { Link } from 'react-router-dom';
import { fmt, useApi, weekday, type DepositList, type DepositRow, type InvoiceRow, type UnpaidList } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, PayText, SizeSelect, STATUS_LABEL, currencyText } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['scope', 'campus', 'currency', 'pay', 'agency', 'sort', 'from', 'to', 'match', 'confirm', 'field', 'q'] as const;
type SearchForm = ReturnType<typeof useSearchForm<(typeof KEYS)[number]>>;

const SCOPES = [
  ['upcoming', '입학 예정'],
  ['current', '재학'],
  ['graduated', '졸업'],
  ['all', '전체'],
] as const;

const UNPAID_COLUMNS: Column<InvoiceRow>[] = [
  ['입학일', (r) => r.start],
  ['배치', (r) => r.batch],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['구분', (r) => STATUS_LABEL[r.status] ?? r.status],
  ['통화', (r) => r.currency],
  ['납부 상태', (r) => r.pay],
  ['입금 매칭 합계', (r) => r.paid],
  ['납부 기한', (r) => r.dueDate],
];

const MATCH = [
  ['', '전체'],
  ['none', '매칭 없음'],
  ['open', '잔액 남음'],
  ['done', '잔액 0'],
] as const;

const LEDGER_COLUMNS: Column<DepositRow>[] = [
  ['입금번호', (r) => r.dpId],
  ['입금일', (r) => r.date],
  ['입금자명', (r) => r.name],
  ['매칭 에이전시', (r) => r.agency],
  ['통화', (r) => r.currency],
  ['입금액', (r) => r.amount],
  ['수수료', (r) => r.fee],
  ['합계', (r) => r.total],
  ['매칭 건수', (r) => r.matches],
  ['매칭액', (r) => r.matched],
  ['매칭 통화', (r) => r.matchedCurrency],
  ['잔액', (r) => r.balance],
  ['확인', (r) => r.confirmed],
  ['메모', (r) => r.memo],
];

export default function Deposits() {
  const sf = useSearchForm(KEYS, { field: 'name', scope: 'upcoming' });
  const view = sf.params.get('view') === 'ledger' ? 'ledger' : 'unpaid';
  return (
    <>
      <PageTitle title="입금 매칭" path="홈 > 회계 > 입금 매칭" />
      {/* 탭마다 응답 모양이 달라 화면을 나눠 새로 불러온다. */}
      {view === 'ledger' ? <Ledger sf={sf} /> : <Unpaid sf={sf} />}
    </>
  );
}

function ViewTabs({ sf, view, counts }: { sf: SearchForm; view: string; counts?: { unpaid: number; ledger: number } }) {
  const tabs = [
    ['unpaid', '미납·부분납 연수'],
    ['ledger', '입금 원장'],
  ] as const;
  return (
    <div role="tablist" aria-label="입금 매칭 구분" className="tabs">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => sf.setParams(key === 'unpaid' ? {} : { view: key })}>
          {label} {counts ? `(${fmt(counts[key])})` : ''}
        </button>
      ))}
      <div className="fill" />
    </div>
  );
}

function Unpaid({ sf }: { sf: SearchForm }) {
  const { query, form, set, apply, submit, setParams } = sf;
  const api = '/api/unpaid' + (query ? '?' + query : '');
  const { data, error } = useApi<UnpaidList>(api);
  const scopeLabel = SCOPES.find(([k]) => k === (data?.scope ?? form.scope))?.[1] ?? '';

  return (
    <>
      <ViewTabs sf={sf} view="unpaid" counts={data?.views} />

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <div className="field" role="radiogroup" aria-label="구분">
            <span>구분</span>
            {SCOPES.map(([v, label]) => (
              <label key={v}>
                <input type="radio" name="scope" value={v} checked={form.scope === v} onChange={set('scope')} />
                {label}{data ? ` (${fmt(data.scopeCounts[v])})` : ''}
              </label>
            ))}
          </div>
          <div className="field" role="radiogroup" aria-label="납부 상태">
            <span>납부 상태</span>
            {[['', '미납·부분납'], ['미납', '미납'], ['부분납', '부분납']].map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="pay" value={v} checked={form.pay === v} onChange={set('pay')} />
                {label}
              </label>
            ))}
          </div>
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {data?.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
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
          <label className="field">
            <span>정렬</span>
            <select value={form.sort} onChange={set('sort')}>
              <option value="">입학일 빠른 순</option>
              <option value="desc">입학일 늦은 순</option>
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
          <button type="button" className="btn btn-lg" onClick={() => setParams({})}>초기화</button>
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
                {' · '}
                <span className={data.totals.overdue ? 'text-red' : ''}>납부 기한 지남 {fmt(data.totals.overdue)}</span>
                {' · '}입금 매칭 합계 {currencyText(data.totals.paidByCurrency)}
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `미납부분납_${scopeLabel}_${data.refDate}.csv`, UNPAID_COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1320 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>입학일</th>
                  <th>배치</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th className="left">에이전시</th>
                  <th>구분</th>
                  <th>통화</th>
                  <th>납부</th>
                  <th className="num">입금 매칭 합계</th>
                  <th>납부 기한</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={13}>조건에 맞는 미납·부분납 연수가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className="nowrap">{r.start} ({weekday(r.start)})</td>
                    <td>{r.batch}</td>
                    <td>{r.stId}</td>
                    <td className="left nowrap"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td className="nowrap">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td>{r.currency || '-'}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                    <td className={'num' + (r.paid ? '' : ' muted')}>{r.hasInvoice ? fmt(r.paid) : '-'}</td>
                    <td className={'nowrap' + (r.dueDate && r.dueDate < data.refDate ? ' text-red' : '')}>{r.dueDate || '-'}</td>
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

function Ledger({ sf }: { sf: SearchForm }) {
  const { query, form, set, apply, submit, setParams } = sf;
  const api = '/api/deposits' + (query ? '?' + query : '');
  const { data, error } = useApi<DepositList>(api);

  if (data && !data.available) {
    return (
      <>
        <ViewTabs sf={sf} view="ledger" counts={data.views} />
        <div className="state-msg">이 환경에는 입금 원장 데이터가 없습니다. 미납·부분납 연수 탭은 연수의 납부 상태로 보여 줍니다.</div>
      </>
    );
  }

  return (
    <>
      <ViewTabs sf={sf} view="ledger" counts={data?.views} />

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <div className="field">
            <span>입금일</span>
            <input type="date" aria-label="입금일 시작" value={form.from} onChange={set('from')} />
            <span className="muted">~</span>
            <input type="date" aria-label="입금일 끝" value={form.to} onChange={set('to')} />
          </div>
          <label className="field">
            <span>통화</span>
            <select value={form.currency} onChange={set('currency')}>
              <option value="">전체</option>
              {data?.facets.currencies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="매칭">
            <span>매칭</span>
            {MATCH.map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="match" value={v} checked={form.match === v} onChange={set('match')} />
                {label}
              </label>
            ))}
          </div>
          <div className="field" role="radiogroup" aria-label="확인">
            <span>확인</span>
            {[['', '전체'], ['Y', '확인'], ['N', '미확인']].map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="confirm" value={v} checked={form.confirm === v} onChange={set('confirm')} />
                {label}
              </label>
            ))}
          </div>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="name">입금자명</option>
              <option value="agency">에이전시</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams({ view: 'ledger' })}>초기화</button>
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
                {' · '}매칭 없음 {fmt(data.totals.none)} · 잔액 남음 {fmt(data.totals.open)} · 잔액 0 {fmt(data.totals.done)}
                {' · '}입금액 합계 {currencyText(data.totals.amountByCurrency)}
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `입금원장_${data.refDate}.csv`, LEDGER_COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1280 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>입금일</th>
                  <th className="left">입금자명</th>
                  <th className="left">매칭 에이전시</th>
                  <th>통화</th>
                  <th className="num">입금액</th>
                  <th className="num">수수료</th>
                  <th className="num">합계</th>
                  <th>매칭 건수</th>
                  <th className="num">매칭액</th>
                  <th className="num">잔액</th>
                  <th>확인</th>
                  <th className="left">메모</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={13}>조건에 맞는 입금이 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.dpId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className="nowrap">{r.date}</td>
                    <td className="left">{r.name || '-'}</td>
                    <td className="left">{r.agency || <span className="muted">-</span>}</td>
                    <td>{r.currency}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td className={'num' + (r.fee ? '' : ' muted')}>{fmt(r.fee)}</td>
                    <td className="num">{fmt(r.total)}</td>
                    <td className={r.matches ? '' : 'text-red'}>{fmt(r.matches)}</td>
                    <td className={'num' + (r.matched ? '' : ' muted')}>
                      {fmt(r.matched)}
                      {r.matchedCurrency && r.matchedCurrency !== r.currency ? ` ${r.matchedCurrency}` : ''}
                    </td>
                    <td className={'num' + (r.balance ? ' strong' : ' muted')}>{fmt(r.balance)}</td>
                    <td className={r.confirmed ? 'text-blue' : 'muted'}>{r.confirmed ? '확인' : '미확인'}</td>
                    <td className="left" style={{ fontSize: 12 }}>{r.memo}</td>
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
