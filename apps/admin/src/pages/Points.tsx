import { Link } from 'react-router-dom';
import { fmt, useApi, weekday, type InvoiceRow, type PointList } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['campus', 'nation', 'has', 'within', 'clear', 'field', 'q'] as const;

const VIEWS = [
  ['balance', '재학생 잔액'],
  ['clear', '졸업 예정자 정산'],
] as const;

const WITHIN = [
  ['7', '1주 이내'],
  ['14', '2주 이내'],
  ['28', '4주 이내'],
  ['56', '8주 이내'],
] as const;

const BALANCE_COLUMNS: Column<InvoiceRow>[] = [
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ['입학일', (r) => r.start],
  ['졸업일', (r) => r.end],
  ['에이전시', (r) => r.agency],
  ['포인트 충전', (r) => r.pointIn],
  ['포인트 사용', (r) => r.pointOut],
  ['포인트 잔액', (r) => r.pointBalance],
  ['포인트 정산', (r) => (r.pointClear ? '완료' : '미처리')],
];

const CLEAR_COLUMNS: Column<InvoiceRow>[] = [
  ['졸업일', (r) => r.end],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ['기숙사', (r) => r.dorm],
  ['에이전시', (r) => r.agency],
  ['포인트 충전', (r) => r.pointIn],
  ['포인트 사용', (r) => r.pointOut],
  ['포인트 잔액', (r) => r.pointBalance],
  ['포인트 정산', (r) => (r.pointClear ? '완료' : '미처리')],
  ['방 정리', (r) => (r.roomClear ? '완료' : '미처리')],
];

export default function Points() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'name', within: '14', clear: 'N' });
  const view = params.get('view') === 'clear' ? 'clear' : 'balance';
  const api = '/api/points' + (query ? '?' + query : '');
  const { data, error } = useApi<PointList>(api);
  const ready = data && data.view === view; // 탭을 바꾼 직후 이전 탭 응답은 그리지 않는다.

  return (
    <>
      <PageTitle title="포인트" path="홈 > 회계 > 포인트" />

      <div role="tablist" aria-label="포인트 구분" className="tabs">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setParams(key === 'balance' ? {} : { view: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          {view === 'clear' && (
            <>
              <label className="field">
                <span>졸업 예정</span>
                <select value={form.within} onChange={set('within')}>
                  {WITHIN.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <div className="field" role="radiogroup" aria-label="포인트 정산">
                <span>정산</span>
                {[['N', '미처리'], ['all', '전체']].map(([v, label]) => (
                  <label key={v}>
                    <input type="radio" name="clear" value={v} checked={form.clear === v} onChange={set('clear')} />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {ready && data.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>국적</span>
            <select value={form.nation} onChange={set('nation')}>
              <option value="">전체</option>
              {ready && data.facets.nations.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="포인트 잔액">
            <span>잔액</span>
            {[['', '전체'], ['Y', '잔액 있음'], ['N', '잔액 없음']].map(([v, label]) => (
              <label key={v || 'all'}>
                <input type="radio" name="has" value={v} checked={form.has === v} onChange={set('has')} />
                {label}
              </label>
            ))}
          </div>
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
          <button type="button" className="btn btn-lg" onClick={() => setParams(view === 'balance' ? {} : { view })}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!ready ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>명
              <span className="muted">
                {view === 'clear' && ` · ${data.until}까지 졸업 · 포인트 정산 미처리 ${fmt(data.totals.notCleared)}`}
                {` · 잔액 있는 학생 ${fmt(data.totals.withBalance)} · 충전 ${fmt(data.totals.pointIn)} P · 사용 ${fmt(data.totals.pointOut)} P · 잔액 ${fmt(data.totals.pointIn - data.totals.pointOut)} P`}
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton
                run={() =>
                  view === 'clear'
                    ? downloadList(api, `포인트정산_${data.until}까지졸업_${data.refDate}.csv`, CLEAR_COLUMNS)
                    : downloadList(api, `포인트잔액_재학생_${data.refDate}.csv`, BALANCE_COLUMNS)
                }
              />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            {view === 'clear' ? <ClearTable data={data} /> : <BalanceTable data={data} />}
          </div>

          <Pagination page={data.page} pages={data.pages} onPage={(p) => apply({ page: String(p) })} />
        </>
      )}
    </>
  );
}

const StudentLink = ({ r }: { r: InvoiceRow }) => (
  <Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link>
);

const PointCells = ({ r }: { r: InvoiceRow }) => (
  <>
    <td className={'num' + (r.pointIn ? '' : ' muted')}>{r.hasInvoice ? fmt(r.pointIn) : '-'}</td>
    <td className={'num' + (r.pointOut ? '' : ' muted')}>{r.hasInvoice ? fmt(r.pointOut) : '-'}</td>
    <td className={'num' + (r.pointBalance ? ' strong' : ' muted')}>{r.hasInvoice ? fmt(r.pointBalance) : '-'}</td>
  </>
);

const Done = ({ done }: { done: boolean }) => <span className={done ? 'text-blue' : 'text-red'}>{done ? '완료' : '미처리'}</span>;

function BalanceTable({ data }: { data: PointList }) {
  return (
    <table className="tbl center big" style={{ minWidth: 1100 }}>
      <thead>
        <tr>
          <th style={{ width: 52 }}>No</th>
          <th>학생번호</th>
          <th className="left">이름</th>
          <th>국적</th>
          <th>캠퍼스</th>
          <th>입학일</th>
          <th>졸업일</th>
          <th className="left">에이전시</th>
          <th className="num">충전</th>
          <th className="num">사용</th>
          <th className="num">잔액</th>
          <th>정산</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.length === 0 && (
          <tr className="empty"><td colSpan={12}>조건에 맞는 재학생이 없습니다.</td></tr>
        )}
        {data.rows.map((r, i) => (
          <tr key={r.trId}>
            <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
            <td>{r.stId}</td>
            <td className="left nowrap"><StudentLink r={r} /></td>
            <td>{r.nation}</td>
            <td>{r.campus}</td>
            <td className="nowrap">{r.start}</td>
            <td className="nowrap">{r.end}</td>
            <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
            <PointCells r={r} />
            <td className="nowrap"><Done done={r.pointClear} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClearTable({ data }: { data: PointList }) {
  return (
    <table className="tbl center big" style={{ minWidth: 1200 }}>
      <thead>
        <tr>
          <th style={{ width: 52 }}>No</th>
          <th>졸업일</th>
          <th>학생번호</th>
          <th className="left">이름</th>
          <th>국적</th>
          <th>캠퍼스</th>
          <th className="left">기숙사</th>
          <th className="left">에이전시</th>
          <th className="num">충전</th>
          <th className="num">사용</th>
          <th className="num">잔액</th>
          <th>포인트 정산</th>
          <th>방 정리</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.length === 0 && (
          <tr className="empty"><td colSpan={13}>조건에 맞는 졸업 예정자가 없습니다.</td></tr>
        )}
        {data.rows.map((r, i) => (
          <tr key={r.trId}>
            <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
            <td className="nowrap">{r.end} ({weekday(r.end)})</td>
            <td>{r.stId}</td>
            <td className="left nowrap"><StudentLink r={r} /></td>
            <td>{r.nation}</td>
            <td>{r.campus}</td>
            <td className="left">{r.dorm}</td>
            <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
            <PointCells r={r} />
            <td className="nowrap"><Done done={r.pointClear} /></td>
            <td className="nowrap"><Done done={r.roomClear} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
