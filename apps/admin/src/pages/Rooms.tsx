import { fmt, useApi, type RoomList, type RoomRow } from '../api';
import { downloadList, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Pagination, SizeSelect } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['building', 'floor', 'type', 'gender', 'q'] as const;

const COLUMNS: Column<RoomRow>[] = [
  ['건물', (r) => r.building],
  ['층', (r) => r.floor],
  ['방 번호', (r) => r.number],
  ['타입', (r) => r.type],
  ['캠퍼스', (r) => r.campus],
  ['성별', (r) => r.gender],
  ['침대 수', (r) => r.beds],
  ['침대 번호', (r) => r.bedNumbers.join(' ')],
  ['상태', (r) => r.status],
  ['사용 시작', (r) => r.start],
  ['사용 끝', (r) => r.end],
  ['메모', (r) => r.memo],
];

// 기숙사 > 방·침대: 업체 포털 방관리에 등록된 방과 침대 목록(읽기 전용). 침대 배정은 업체 포털에 기록이 없어 새로 만든다.
export default function Rooms() {
  const { query, form, set, apply, submit, reset } = useSearchForm(KEYS);
  const api = '/api/rooms' + (query ? '?' + query : '');
  const { data, error } = useApi<RoomList>(api);

  return (
    <>
      <PageTitle title="방·침대 목록" path="홈 > 기숙사 > 방·침대 관리" />

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          <label className="field">
            <span>건물</span>
            <select value={form.building} onChange={set('building')}>
              <option value="">전체</option>
              {data?.facets.buildings.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label className="field">
            <span>층</span>
            <select value={form.floor} onChange={set('floor')}>
              <option value="">전체</option>
              {data?.facets.floors.map((f) => <option key={f} value={f}>{f}층</option>)}
            </select>
          </label>
          <label className="field">
            <span>타입</span>
            <select value={form.type} onChange={set('type')}>
              <option value="">전체</option>
              {data?.facets.types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="성별">
            <span>성별</span>
            {['', '남', '여', '공용'].map((g) => (
              <label key={g || 'all'}>
                <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={set('gender')} />
                {g || '전체'}
              </label>
            ))}
          </div>
          <label className="field">
            <span>방 번호</span>
            <input type="text" value={form.q} onChange={set('q')} placeholder="방 번호·메모" />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={reset}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : data.totals.rooms === 0 && !query ? (
        <div className="state-msg">등록된 방이 없습니다.</div>
      ) : (
        <>
          <div className="summary">
            <div>
              <span className="label">방</span>
              <span className="value">{fmt(data.totals.rooms)} <small>개</small></span>
              <span className="sub">{data.facets.campuses.join(' · ')}</span>
            </div>
            <div>
              <span className="label">침대</span>
              <span className="value">{fmt(data.totals.beds)} <small>개</small></span>
            </div>
            <div className="wide">
              <span className="label">타입별 방 / 침대</span>
              <span className="sub" style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.8, display: 'flex', flexWrap: 'wrap', columnGap: 12 }}>
                {data.byType.map((t) => (
                  <span key={t.type} style={{ whiteSpace: 'nowrap' }}>{t.type} {t.rooms}/{t.beds}</span>
                ))}
              </span>
            </div>
          </div>

          <div className="toolbar">
            <span>총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>개 방 <span className="muted">· 업체 포털 방관리 기준</span></span>
            <span className="toolbar-right">
              <DownloadButton run={() => downloadList(api, `방침대_${data.refDate}.csv`, COLUMNS)} />
              <SizeSelect size={data.size} onChange={(size) => apply({ size, page: '' })} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th>건물</th>
                  <th>층</th>
                  <th>방 번호</th>
                  <th className="left">타입</th>
                  <th>성별</th>
                  <th>침대</th>
                  <th className="left">침대 번호</th>
                  <th>상태</th>
                  <th className="left">메모</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={9}>조건에 맞는 방이 없습니다.</td></tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.roomId}>
                    <td>{r.building}</td>
                    <td>{r.floor}</td>
                    <td className="strong">{r.number}</td>
                    <td className="left">{r.type}</td>
                    <td>{r.gender}</td>
                    <td>{r.beds}</td>
                    <td className="left muted">{r.bedNumbers.join(' · ')}</td>
                    <td className={r.status === 'ACTIVE' ? '' : 'muted'}>{r.status}</td>
                    <td className="left memo-text" style={{ fontSize: 12 }}>{r.memo}</td>
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
