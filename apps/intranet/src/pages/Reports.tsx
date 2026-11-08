import { Link } from 'react-router-dom';
import { useApi, type ReportList } from '../api';
import { Loading, PageTitle, StudentLink } from '../components/ui';
import { mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['from', 'to', 'campus', 'kind', 'q'] as const;
const PENALTY: Record<string, [string, string]> = { pending: ['승인 대기', 'text-amber'], approved: ['승인', 'text-blue'], rejected: ['반려', 'muted'] };

/** 가드 태블릿에서 등록한 사건 리포트. 등록과 동시에 패널티 승인 대기로 넘어간다. */
export default function Reports() {
  const f = useSearchForm(KEYS);
  const { data, error, reload } = useApi<ReportList>('/api/reports?' + f.query);
  return (
    <>
      <PageTitle
        title="가드 리포트"
        path="홈 > 학생 생활 > 가드 리포트"
        actions={
          <a href="/guard" target="_blank" rel="noreferrer" className="btn">
            가드 태블릿 열기
          </a>
        }
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <div className="field range">
            <span>발생일</span>
            <input type="date" aria-label="시작일" value={f.form.from} onChange={f.set('from')} />
            <span className="nowrap">~</span>
            <input type="date" aria-label="종료일" value={f.form.to} onChange={f.set('to')} />
          </div>
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
            <span>종류</span>
            <select value={f.form.kind} onChange={f.set('kind')}>
              <option value="">전체</option>
              {data?.kinds.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>검색</span>
            <input type="text" placeholder="학생, 근무자" value={f.form.q} onChange={f.set('q')} />
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
              총 <strong className="text-primary">{data.rows.length}</strong>건
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>발생</th>
                  <th className="left">학생</th>
                  <th>출입구</th>
                  <th>종류</th>
                  <th className="left">내용</th>
                  <th>근무자</th>
                  <th>패널티</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={7}>리포트가 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{mdhm(r.occurredAt)}</td>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} /> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td className={r.kind === 'alcohol' || r.kind === 'violence' ? 'text-red' : ''}>{r.kindLabel}</td>
                      <td className="left memo-text">{r.note}</td>
                      <td>{r.reportedBy || '-'}</td>
                      <td>
                        {r.penaltyStatus ? (
                          <Link to={`/penalties?tab=${r.penaltyStatus}&q=${r.stId}`} className={PENALTY[r.penaltyStatus][1]}>
                            {PENALTY[r.penaltyStatus][0]}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
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
