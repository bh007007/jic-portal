import { Link } from 'react-router-dom';
import { fmt, useApi, type ExtensionList, type ExtensionRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, PayText, SizeSelect, STATUS_LABEL, currencyText } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['year', 'nation', 'campus', 'field', 'q'] as const;

const TABS = [
  ['all', '전체'],
  ['active', '연장 중'],
  ['upcoming', '연장 예정'],
  ['done', '끝남'],
] as const;

const PHASE_LABEL: Record<ExtensionRow['phase'], string> = { active: '연장 중', upcoming: '연장 예정', done: '끝남' };
const PHASE_CLASS: Record<ExtensionRow['phase'], string> = { active: 'text-blue', upcoming: 'text-amber', done: 'muted' };

const COLUMNS: Column<ExtensionRow>[] = [
  ['구분', (r) => PHASE_LABEL[r.phase]],
  ['등록일', (r) => r.registered],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ['연수 시작', (r) => r.start],
  ['원래 종료', (r) => r.origEnd],
  ['연장 시작', (r) => r.extStart],
  ['연장 종료', (r) => r.extEnd],
  ['연장 주', (r) => r.extWeeks],
  ['차수', (r) => `${r.order}/${r.count}`],
  ['총 주', (r) => r.weeks],
  ['연수 상태', (r) => STATUS_LABEL[r.status] ?? r.status],
  ['통화', (r) => r.currency],
  ['연장 금액', (r) => r.price],
  ['연장 입금', (r) => r.paid],
  ['납부', (r) => r.pay],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['메모', (r) => r.memo],
];

export default function Extensions() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'name' });
  const tab = (TABS.find(([k]) => k === params.get('tab')) ?? TABS[0])[0];
  const api = '/api/extensions' + (query ? '?' + query : '');
  const { data, error } = useApi<ExtensionList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)![1];

  return (
    <>
      <PageTitle title="연장 현황" path="홈 > 학생관리 > 연장 현황" />

      <div role="tablist" aria-label="구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'all' ? {} : { tab: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>등록 연도</span>
            <select value={form.year} onChange={set('year')}>
              <option value="">전체</option>
              {data?.facets.years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
          <label className="field">
            <span>국적</span>
            <select value={form.nation} onChange={set('nation')}>
              <option value="">전체</option>
              {data?.facets.nations.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {data?.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="name">이름</option>
              <option value="no">학생번호</option>
              <option value="agency">에이전시</option>
              <option value="memo">메모</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'all' ? {} : { tab })}>초기화</button>
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
                {' · '}학생 {fmt(data.totals.students)}명 · 연장 {fmt(data.totals.weeks)}주 · {tab === 'all' || tab === 'done' ? '등록일 최근 순' : '연장 시작 순'}
              </span>
              <span className="muted" style={{ display: 'block', marginTop: 2, fontSize: 12 }}>
                연장 금액 {currencyText(data.totals.priceByCurrency)}
                {' · '}연장 입금 {currencyText(data.totals.paidByCurrency)}
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `연장현황_${tabLabel}_${data.refDate}.csv`, COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1480 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>구분</th>
                  <th>등록일</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th>원래 종료</th>
                  <th>연장 기간</th>
                  <th>주</th>
                  <th>차수</th>
                  <th>연수 상태</th>
                  <th className="num">연장 금액</th>
                  <th className="num">연장 입금</th>
                  <th>납부</th>
                  <th className="left">에이전시</th>
                  <th className="left" style={{ minWidth: 180 }}>메모</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty">
                    <td colSpan={17}>{data.hasData ? '조건에 맞는 연장 기록이 없습니다.' : '연장 기록이 없습니다.'}</td>
                  </tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.ttId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className={'nowrap ' + PHASE_CLASS[r.phase]}>{PHASE_LABEL[r.phase]}</td>
                    <td className="nowrap">{r.registered || <span className="muted">-</span>}</td>
                    <td>{r.stId}</td>
                    <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    <td className="nowrap">{r.origEnd}</td>
                    <td className="nowrap">{r.extStart} ~ {r.extEnd}</td>
                    <td>{r.extWeeks}</td>
                    <td className="muted">{r.order}/{r.count}</td>
                    <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="num">{r.price ? `${r.currency} ${fmt(r.price)}` : <span className="muted">-</span>}</td>
                    <td className="num">{r.paid ? `${r.currency} ${fmt(r.paid)}` : <span className="muted">-</span>}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td className="left memo-text" style={{ fontSize: 12 }}>{r.memo || <span className="muted">-</span>}</td>
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
