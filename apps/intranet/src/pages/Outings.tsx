import { Link } from 'react-router-dom';
import { useApi, type OutingList } from '../api';
import { Loading, PageTitle, Tabs } from '../components/ui';
import { dateWithDay, duration, mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['date', 'campus', 'q'] as const;

/** 외출·귀가 기록(mode=outings)과 통금 확인(mode=curfew). 날짜는 '밤' 기준이며 오전 5시 전 기록은 전날 밤에 들어간다. */
export default function Outings({ mode }: { mode: 'outings' | 'curfew' }) {
  const f = useSearchForm(KEYS);
  const view = f.params.get('view') || (mode === 'curfew' ? 'breach' : 'all');
  const qs = new URLSearchParams(f.params);
  qs.set('view', view);
  const { data, error, reload } = useApi<OutingList>('/api/outings?' + qs.toString());
  const title = mode === 'curfew' ? '통금 확인' : '외출·귀가';

  return (
    <>
      <PageTitle
        title={title}
        path={`홈 > 학생 생활 > ${title}`}
        actions={
          <>
            <Link to="/settings" className="btn">
              통금·근무자 설정
            </Link>
            <a href="/guard" target="_blank" rel="noreferrer" className="btn btn-primary">
              가드 태블릿 열기
            </a>
          </>
        }
      />
      <Tabs
        label="보기"
        value={view}
        onChange={(k) => f.apply({ view: k })}
        items={[
          { key: 'all', label: `그날 밤 전체 (${data?.counts.all ?? 0})` },
          { key: 'out', label: `지금 외출 중 (${data?.counts.out ?? 0})` },
          { key: 'breach', label: `통금 위반 (${data?.counts.breach ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <label className="field">
            <span>날짜(밤)</span>
            <input type="date" value={f.form.date || data?.night || ''} onChange={f.set('date')} />
          </label>
          <label className="field">
            <span>캠퍼스</span>
            <select value={f.form.campus} onChange={f.set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>학생</span>
            <input type="text" placeholder="이름 또는 학생번호" value={f.form.q} onChange={f.set('q')} />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={f.reset}>
            초기화
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            조회
          </button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              {view === 'out' ? '지금 외출 중' : dateWithDay(data.night) + ' 밤'} · 총 <strong className="text-primary">{data.rows.length}</strong>명 · 통금 {data.curfew}
            </span>
            <span className="muted small">오전 5시 전 기록은 전날 밤으로 셉니다.</span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>외출</th>
                  <th>귀가</th>
                  <th>외출 시간</th>
                  <th>근무자 (외출 / 귀가)</th>
                  <th className="left">통금</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={7}>기록이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="left">
                        {r.name} <span className="muted">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td>{r.outAt ? mdhm(r.outAt) : <span className="muted">기록 없음</span>}</td>
                      <td>{r.inAt ? mdhm(r.inAt) : <span className="text-amber">외출 중</span>}</td>
                      <td>{duration(r.minutes)}</td>
                      <td>
                        {r.outBy || '-'} / {r.inBy || '-'}
                      </td>
                      <td className="left">{r.breach ? <span className="text-red">{r.breach}</span> : <span className="muted">-</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
