import { fmt, useApi, type CodeList, type CodeRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['campus', 'q'] as const;

const KINDS = [
  ['course', '코스'],
  ['dorm', '기숙사'],
] as const;

const COURSE_COLUMNS: Column<CodeRow>[] = [
  ['캠퍼스', (r) => r.campus],
  ['코스', (r) => r.name],
  ['재학', (r) => r.current],
  ['입학 예정', (r) => r.upcoming],
  ['누적 학생', (r) => r.students],
  ['최근 입학일', (r) => r.lastStart],
];

const DORM_COLUMNS: Column<CodeRow>[] = [
  ['캠퍼스', (r) => r.campus],
  ['기숙사', (r) => r.name],
  ['재학', (r) => r.current],
  ['입학 예정', (r) => r.upcoming],
  ['누적 학생', (r) => r.students],
  ['배정 기록', (r) => r.assigned],
  ['현재 거주', (r) => r.staying],
  ['최근 입학일', (r) => r.lastStart],
];

export default function Codes() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS);
  const kind = params.get('kind') === 'dorm' ? 'dorm' : 'course';
  const api = '/api/codes' + (query ? '?' + query : '');
  const { data, error } = useApi<CodeList>(api);
  const ready = data && data.kind === kind;
  const label = kind === 'dorm' ? '기숙사' : '코스';

  return (
    <>
      <PageTitle title="코스·기숙사" path="홈 > 기초관리 > 코스·기숙사" />

      <div role="tablist" aria-label="코드 구분" className="tabs">
        {KINDS.map(([key, name]) => (
          <button key={key} type="button" role="tab" aria-selected={kind === key} onClick={() => setParams(key === 'course' ? {} : { kind: key })}>
            {name} {data ? `(${fmt(data.tabCounts[key])})` : ''}
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
              {ready && data.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{label}명</span>
            <input type="text" value={form.q} onChange={set('q')} />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(kind === 'course' ? {} : { kind })}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!ready ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>개
              <span className="muted"> · 취소 연수 제외</span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `${label}목록_${data.refDate}.csv`, kind === 'dorm' ? DORM_COLUMNS : COURSE_COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: kind === 'dorm' ? 960 : 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>캠퍼스</th>
                  <th className="left">{label}</th>
                  <th>재학</th>
                  <th>입학 예정</th>
                  <th>누적 학생</th>
                  {kind === 'dorm' && <th>배정 기록</th>}
                  {kind === 'dorm' && <th>현재 거주</th>}
                  <th>최근 입학일</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={kind === 'dorm' ? 9 : 7}>조건에 맞는 {label}가 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.campus + r.name}>
                    <td className="muted">{(data.page - 1) * data.size + i + 1}</td>
                    <td>{r.campus}</td>
                    <td className="left">{r.name}</td>
                    <td className={r.current ? 'strong' : 'muted'}>{fmt(r.current)}</td>
                    <td className={r.upcoming ? '' : 'muted'}>{fmt(r.upcoming)}</td>
                    <td>{fmt(r.students)}</td>
                    {kind === 'dorm' && <td className={r.assigned ? '' : 'muted'}>{fmt(r.assigned)}</td>}
                    {kind === 'dorm' && <td className={r.staying ? 'strong' : 'muted'}>{fmt(r.staying)}</td>}
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
