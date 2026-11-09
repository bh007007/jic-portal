import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useAccess, useStaffName, type NoticeDetail as Detail } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { mdhm, ymdhm } from '../format';

/** 열면 이 직원의 읽음이 남는다(직원마다 처음 한 번). */
export default function NoticeDetail() {
  const { id = '' } = useParams();
  const staff = useStaffName();
  const { manager, meta } = useAccess();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Detail>(`/api/notices/${encodeURIComponent(id)}`)
      .then((d) => {
        setData(d);
        notifySummaryChanged();
      })
      .catch((e: ApiError) => setError(errorText(e.code)));
  }, [id, staff]);

  if (!data) return error ? <div className="state-msg">{error}</div> : <Loading />;
  return (
    <>
      <PageTitle
        title={data.title}
        path="홈 > 공지·결재 > 내부 공지"
        actions={
          <>
            <Link to="/notices" className="btn">
              목록
            </Link>
            {(!manager || data.author === meta?.actor) && (
              <Link to={`/notices/${data.id}/edit`} className="btn">
                수정
              </Link>
            )}
          </>
        }
      />
      <section className="panel">
        <div className="panel-body">
          <table className="kv">
            <tbody>
              <tr>
                <th>대상</th>
                <td>{data.campus || '전체'}</td>
                <th>게시</th>
                <td>
                  {data.author} {ymdhm(data.createdAt)}
                  {data.pinned && <span className="text-red strong"> · 고정</span>}
                </td>
              </tr>
              <tr>
                <th>게시 종료</th>
                <td>{data.until ?? '-'}</td>
                <th>수정</th>
                <td>{data.updatedAt !== data.createdAt ? `${data.updatedBy} ${ymdhm(data.updatedAt)}` : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <pre className="note-body">{data.content}</pre>
      <section className="panel">
        <div className="panel-head">
          <h2>
            읽은 직원 <small>({data.readCount}명)</small>
          </h2>
          {!staff && <span className="muted small">오른쪽 위에 이름을 입력하면 읽음이 남습니다.</span>}
        </div>
        <div className="panel-body">
          {data.reads.length === 0 ? (
            <p className="muted">아직 없습니다.</p>
          ) : (
            <p className="read-list">
              {data.reads.map((r) => (
                <span key={r.id}>
                  {r.name} <span className="muted small">{mdhm(r.at)}</span>
                </span>
              ))}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
