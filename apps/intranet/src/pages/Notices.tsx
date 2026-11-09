import { Link } from 'react-router-dom';
import { useApi, type NoticeList } from '../api';
import { Loading, PageTitle, Tabs } from '../components/ui';
import { mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

/** 대상: 캠퍼스(전체) · 역할(11/10 결정 I14, 비우면 모든 역할) */
const ROLE_LABEL: Record<string, string> = { admin: '관리자', office: '오피스', manager: '매니저' };
const audience = (n: { campus: string; roles: string[] }) => [n.campus || '전체', ...n.roles.map((r) => ROLE_LABEL[r] ?? r)].join(' · ');

const KEYS = ['campus', 'q'] as const;

export default function Notices() {
  const f = useSearchForm(KEYS);
  const view = f.params.get('view') || 'current';
  const { data, error, reload } = useApi<NoticeList>('/api/notices?' + f.query);
  return (
    <>
      <PageTitle
        title="내부 공지"
        path="홈 > 공지·결재 > 내부 공지"
        actions={
          <Link to="/notices/new" className="btn btn-primary">
            공지 작성
          </Link>
        }
      />
      <Tabs
        label="게시 상태"
        value={view}
        onChange={(k) => f.apply({ view: k === 'current' ? '' : k })}
        items={[
          { key: 'current', label: `게시 중 (${data?.counts.current ?? 0})` },
          { key: 'past', label: `지난 공지 (${data?.counts.past ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
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
            <input type="text" placeholder="제목, 내용, 작성자" value={f.form.q} onChange={f.set('q')} />
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
            {f.form.campus && <span className="muted small">{f.form.campus} 공지와 전체 공지를 보여 줍니다.</span>}
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>구분</th>
                  <th className="left">제목</th>
                  <th>대상</th>
                  <th>작성자</th>
                  <th>게시</th>
                  <th>게시 종료</th>
                  <th>읽음</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={7}>공지가 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((n) => (
                    <tr key={n.id}>
                      <td>{n.pinned ? <span className="text-red strong">고정</span> : <span className="muted">-</span>}</td>
                      <td className="left">
                        <Link to={`/notices/${n.id}`} className={n.readByMe ? '' : 'strong'}>
                          {n.title}
                        </Link>
                        {!n.readByMe && <span className="text-red small"> 안 읽음</span>}
                      </td>
                      <td>{audience(n)}</td>
                      <td>{n.author}</td>
                      <td className="nowrap">{mdhm(n.createdAt)}</td>
                      <td>{n.until ?? <span className="muted">-</span>}</td>
                      <td>{n.readCount}명</td>
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
