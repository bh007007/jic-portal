import { Link } from 'react-router-dom';
import { fmt, useApi, type ChangeList, type ChangeRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, PayText, SizeSelect, STATUS_LABEL } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['year', 'nation', 'campus', 'field', 'q'] as const;

// 업체 포털 재학생 > 신입·연장·복귀·변경 화면의 탭. 신입은 '입학 배치별 명단', 연장은 '연장 현황'이 맡는다.
const TABS = [
  ['course', '코스 변경'],
  ['dorm', '기숙사 변경'],
  ['comeback', '복귀'],
] as const;
type Tab = (typeof TABS)[number][0];

const DATE_LABEL: Record<Tab, string> = { course: '변경일', dorm: '변경일', comeback: '복귀일' };

const columnsFor = (tab: Tab): Column<ChangeRow>[] => [
  [DATE_LABEL[tab], (r) => r.date],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['국적', (r) => r.nation],
  ['캠퍼스', (r) => r.campus],
  ...(tab === 'comeback'
    ? ([['코스', (r) => r.next], ['기숙사', (r) => r.nextDorm]] as Column<ChangeRow>[])
    : ([['이전', (r) => r.prev], ['변경 후', (r) => r.next]] as Column<ChangeRow>[])),
  ['입국일', (r) => r.depart],
  ['주', (r) => r.weeks],
  ['귀국일', (r) => r.ret],
  ['연수 상태', (r) => STATUS_LABEL[r.status] ?? r.status],
  ['납부', (r) => r.pay],
  ['변경 요청', (r) => r.requests],
  ['에이전시', (r) => r.agency],
  ['지점', (r) => r.branch],
];

export default function Changes() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS, { field: 'name' });
  const tab: Tab = (TABS.find(([k]) => k === params.get('tab')) ?? TABS[0])[0];
  const api = '/api/changes' + (query ? '?' + query : '');
  const { data, error } = useApi<ChangeList>(api);
  const tabLabel = TABS.find(([k]) => k === tab)![1];
  const itemLabel = tab === 'dorm' ? '기숙사' : '코스';

  return (
    <>
      <PageTitle title="변경 이력" path="홈 > 학생관리 > 변경 이력" />

      <div role="tablist" aria-label="구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'course' ? {} : { tab: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>{DATE_LABEL[tab].replace('일', '')} 연도</span>
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
              <option value="item">{tab === 'comeback' ? '코스·기숙사' : itemLabel}</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'course' ? {} : { tab })}>초기화</button>
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
              <span className="muted"> · {DATE_LABEL[tab]} 최근 순</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `변경이력_${tabLabel}_${data.refDate}.csv`, columnsFor(tab))} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>{DATE_LABEL[tab]}</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  {tab === 'comeback' ? (
                    <>
                      <th className="left">코스</th>
                      <th className="left">기숙사</th>
                    </>
                  ) : (
                    <>
                      <th className="left">이전 {itemLabel}</th>
                      <th className="left">변경 후 {itemLabel}</th>
                    </>
                  )}
                  <th>입국일</th>
                  <th>주</th>
                  <th>귀국일</th>
                  <th>연수 상태</th>
                  <th>납부</th>
                  <th>변경 요청</th>
                  <th className="left">에이전시</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty">
                    <td colSpan={15}>{data.hasData ? '조건에 맞는 기록이 없습니다.' : '변경 기록이 없습니다.'}</td>
                  </tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.key}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td className="nowrap">{r.date || <span className="muted">-</span>}</td>
                    <td>{r.stId}</td>
                    <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    {tab === 'comeback' ? (
                      <>
                        <td className="left">{r.next || <span className="muted">-</span>}</td>
                        <td className="left">{r.nextDorm || <span className="muted">-</span>}</td>
                      </>
                    ) : (
                      <>
                        <td className="left muted">{r.prev || '-'}</td>
                        <td className="left">{r.next || <span className="muted">-</span>}</td>
                      </>
                    )}
                    <td className="nowrap">{r.depart}</td>
                    <td>{r.weeks}</td>
                    <td className="nowrap">{r.ret}</td>
                    <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="nowrap"><PayText pay={r.pay} /></td>
                    <td>{r.requests ? fmt(r.requests) : <span className="muted">-</span>}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
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
