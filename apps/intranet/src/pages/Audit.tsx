import { Link } from 'react-router-dom';
import { useApi, type AuditList } from '../api';
import { Loading, PageTitle, StudentLink } from '../components/ui';
import { ymdhm } from '../format';
import { useSearchForm } from '../useSearchForm';
import { ACTION_LABEL } from './CounselingDetail';

const KEYS = ['from', 'to', 'action', 'q'] as const;

/** 접근 기록: 상담 기록을 누가 언제 열람·작성·수정했는지. 기록은 추가만 되고 고치거나 지울 수 없다. */
export default function Audit() {
  const f = useSearchForm(KEYS);
  const { data, error, reload } = useApi<AuditList>('/api/audit?' + f.query);
  return (
    <>
      <PageTitle title="접근 기록" path="홈 > 직원 > 접근 기록" />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <div className="field range">
            <span>날짜</span>
            <input type="date" aria-label="시작일" value={f.form.from} onChange={f.set('from')} />
            <span className="nowrap">~</span>
            <input type="date" aria-label="종료일" value={f.form.to} onChange={f.set('to')} />
          </div>
          <label className="field">
            <span>종류</span>
            <select value={f.form.action} onChange={f.set('action')}>
              <option value="">전체</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>검색</span>
            <input type="text" placeholder="직원, 학생 이름·번호" value={f.form.q} onChange={f.set('q')} />
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
              총 <strong className="text-primary">{data.total}</strong>건{data.total > data.rows.length && ` (최근 ${data.rows.length}건 표시)`}
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>직원</th>
                  <th>종류</th>
                  <th className="left">학생</th>
                  <th className="left">상담 기록</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={5}>기록이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap">{ymdhm(l.at)}</td>
                      <td>{l.actor}</td>
                      <td>{ACTION_LABEL[l.action] ?? l.action}</td>
                      <td className="left">
                        <StudentLink stId={l.stId} name={l.name} /> <span className="muted small">{l.stId}</span>
                      </td>
                      <td className="left">
                        <Link to={`/counseling/${l.targetId}`}>{l.title || l.targetId}</Link>
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
