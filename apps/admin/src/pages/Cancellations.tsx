import { Link } from 'react-router-dom';
import { fmt, useApi, type StopList, type StopRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, PayText, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['state', 'year', 'nation', 'campus', 'field', 'q'] as const;

const TABS = [
  ['stopped', '중단·연기'],
  ['cancel', '입학 전 캔슬'],
] as const;

const STATES = [
  ['CANCEL_TRAIN', '연수 중 취소'],
  ['POSTPONE', '연기'],
  ['EXPEL', '퇴교'],
] as const;

const STATE_CLASS: Record<string, string> = { CANCEL_TRAIN: 'text-red', EXPEL: 'text-red', POSTPONE: 'text-amber', CANCEL: 'muted' };

const COLUMNS: Column<StopRow>[] = [
  ['상태', (r) => r.stateLabel],
  ['처리일', (r) => r.stopDate],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['성별', (r) => r.gender],
  ['캠퍼스', (r) => r.campus],
  ['배치', (r) => r.batch],
  ['입국일', (r) => r.depart],
  ['주', (r) => r.weeks],
  ['귀국일', (r) => r.ret],
  ['납부', (r) => r.pay],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
  ['사유', (r) => r.reason],
];

export default function Cancellations() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'name' });
  const tab = params.get('tab') === 'cancel' ? 'cancel' : 'stopped';
  const api = '/api/cancellations' + (query ? '?' + query : '');
  const { data, error } = useApi<StopList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)![1];

  return (
    <>
      <PageTitle title="중단·연기 현황" path="홈 > 학생관리 > 중단·연기 현황" />

      <div role="tablist" aria-label="구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'stopped' ? {} : { tab: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          {tab === 'stopped' && (
            <div className="field" role="radiogroup" aria-label="상태">
              <span>상태</span>
              <label>
                <input type="radio" name="state" value="" checked={form.state === ''} onChange={set('state')} />
                전체
              </label>
              {STATES.map(([v, l]) => (
                <label key={v}>
                  <input type="radio" name="state" value={v} checked={form.state === v} onChange={set('state')} />
                  {l} {data ? <span className="muted">({fmt(data.stateCounts[v] ?? 0)})</span> : ''}
                </label>
              ))}
            </div>
          )}
          <label className="field">
            <span>처리 연도</span>
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
              <option value="reason">사유</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'stopped' ? {} : { tab })}>초기화</button>
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
              <span className="muted"> · 처리일 최근 순</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `${tabLabel}_${data.refDate}.csv`, COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1360 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>상태</th>
                  <th>처리일</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th>배치</th>
                  <th>입국일</th>
                  <th>주</th>
                  <th>귀국일</th>
                  <th>납부</th>
                  <th className="left">에이전시</th>
                  <th className="left" style={{ minWidth: 220 }}>사유</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={14}>조건에 맞는 연수가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className={'nowrap ' + (STATE_CLASS[r.stateCode] ?? '')}>{r.stateLabel}</td>
                    <td className="nowrap">{r.stopDate || <span className="muted">-</span>}</td>
                    <td>{r.stId}</td>
                    <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    <td>{r.batch}</td>
                    <td className="nowrap">{r.depart}</td>
                    <td>{r.weeks}</td>
                    <td className="nowrap">{r.ret}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td className="left memo-text" style={{ fontSize: 12 }}>{r.reason || <span className="muted">-</span>}</td>
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
