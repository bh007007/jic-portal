import { Link } from 'react-router-dom';
import { useApi, type CounselingList } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { md, mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['from', 'to', 'campus', 'q'] as const;

/** 상담 기록 목록. 제목만 보이고, 내용은 상세를 열어야 보인다(열람은 접근 기록에 남는다). */
export default function Counseling() {
  const f = useSearchForm(KEYS);
  const view = f.params.get('view') || 'all';
  const { data, error, reload } = useApi<CounselingList>('/api/counseling?' + f.query);
  return (
    <>
      <PageTitle
        title="상담 기록"
        path="홈 > 학생 생활 > 상담 기록"
        actions={
          <Link to="/counseling/new" className="btn btn-primary">
            상담 기록 작성
          </Link>
        }
      />
      <Tabs
        label="보기"
        value={view}
        onChange={(k) => f.apply({ view: k === 'all' ? '' : k })}
        items={[
          { key: 'all', label: `전체 (${data?.counts.all ?? 0})` },
          { key: 'followup', label: `확인할 일 (${data?.counts.followup ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <div className="field range">
            <span>상담일</span>
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
            <span>검색</span>
            <input type="text" placeholder="학생, 제목, 작성자" value={f.form.q} onChange={f.set('q')} />
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
              {data.counts.overdue > 0 && <span className="text-red"> · 기한 지난 확인할 일 {data.counts.overdue}건</span>}
            </span>
            <span className="muted small">내용은 상세에서만 보이며, 열람한 직원과 시각이 접근 기록에 남습니다.</span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>상담일</th>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th className="left">제목</th>
                  <th>작성자</th>
                  <th>후속 조치</th>
                  <th>수정</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={7}>상담 기록이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((n) => (
                    <tr key={n.id}>
                      <td>{md(n.date)}</td>
                      <td className="left">
                        <StudentLink stId={n.stId} name={n.name} /> <span className="muted small">{n.stId}</span>
                      </td>
                      <td>{n.campus}</td>
                      <td className="left">
                        <Link to={`/counseling/${n.id}`}>{n.title}</Link>
                      </td>
                      <td>{n.author}</td>
                      <td>
                        <FollowUp n={n} />
                      </td>
                      <td className="muted small">{n.updatedAt !== n.createdAt ? `${mdhm(n.updatedAt)} ${n.updatedBy}` : '-'}</td>
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

export function FollowUp({ n }: { n: { followUpDue: string | null; followUpDone: boolean; overdue: boolean } }) {
  if (!n.followUpDue) return <span className="muted">-</span>;
  if (n.followUpDone) return <span className="text-blue">완료 ({md(n.followUpDue)})</span>;
  return <span className={n.overdue ? 'text-red strong' : 'text-amber'}>{md(n.followUpDue)}까지</span>;
}
