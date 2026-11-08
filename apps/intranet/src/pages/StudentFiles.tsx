import { Link } from 'react-router-dom';
import { useApi, type StudentFileList } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['q', 'campus', 'sort'] as const;

/** 재학생 생활 기록 목록. 기본은 누적 점수가 높은 순(먼저 살펴볼 학생). */
export default function StudentFiles() {
  const f = useSearchForm(KEYS, { sort: 'score' });
  const { data, error, reload } = useApi<StudentFileList>('/api/students?' + f.query);
  return (
    <>
      <PageTitle title="Student File" path="홈 > 학생 생활 > Student File" />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <label className="field">
            <span>학생</span>
            <input type="text" placeholder="이름 또는 학생번호" value={f.form.q} onChange={f.set('q')} />
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
            <span>정렬</span>
            <select value={f.form.sort} onChange={f.set('sort')}>
              <option value="score">누적 점수 높은 순</option>
              <option value="breaches">최근 통금 위반 많은 순</option>
              <option value="name">이름순</option>
            </select>
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
              재학생 <strong className="text-primary">{data.rows.length}</strong>명
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">학생</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th>연수 종료</th>
                  <th>누적 점수</th>
                  <th>경고 단계</th>
                  <th>통금 위반 (최근 {data.recentNights}일)</th>
                  <th>대기 패널티</th>
                  <th>대기 신청</th>
                  <th>지금</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={10}>해당하는 학생이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.stId}>
                      <td className="left">
                        <Link to={`/student-file/${r.stId}`}>{r.name}</Link> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.nation || '-'}</td>
                      <td>{r.campus}</td>
                      <td>{r.end}</td>
                      <td className={r.total ? 'strong' : 'muted'}>{r.total}</td>
                      <td>{r.stage === null ? <span className="muted">기준 미정</span> : r.stage}</td>
                      <td className={r.breaches ? 'text-red' : 'muted'}>{r.breaches}</td>
                      <td className={r.pendingPenalties ? '' : 'muted'}>{r.pendingPenalties}</td>
                      <td className={r.pendingRequests ? '' : 'muted'}>{r.pendingRequests}</td>
                      <td>{r.outNow ? <span className="text-amber">외출 중</span> : r.overnightTonight ? <span className="text-blue">외박</span> : <span className="muted">-</span>}</td>
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
