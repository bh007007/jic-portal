import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useStaffName, type CounselingDetail as Detail } from '../api';
import { Loading, PageTitle, StudentLink } from '../components/ui';
import { mdhm, ymdhm } from '../format';
import { FollowUp } from './Counseling';

export const ACTION_LABEL: Record<string, string> = { view: '열람', create: '작성', update: '수정', followup_done: '후속 조치 완료', followup_reopen: '후속 조치 되돌림' };

/** 상세를 열 때마다 서버가 접근 기록('열람')을 남긴다. */
export default function CounselingDetail() {
  const { id = '' } = useParams();
  const staff = useStaffName();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<Detail>(`/api/counseling/${encodeURIComponent(id)}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: ApiError) => setError(errorText(e.code)));
  useEffect(() => {
    if (staff) load();
  }, [id, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!staff) return <div className="state-msg">{errorText('actor_required')}</div>;
  if (!data) return error ? <div className="state-msg">{error}</div> : <Loading />;
  const n = data.note;

  async function followUp(done: boolean) {
    setBusy(true);
    try {
      await api(`/api/counseling/${n.id}/followup`, { method: 'POST', body: { done } });
      await load();
      notifySummaryChanged();
    } catch (e) {
      setError(errorText((e as ApiError).code));
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle
        title={n.title}
        path="홈 > 학생 생활 > 상담 기록"
        actions={
          <>
            <Link to="/counseling" className="btn">
              목록
            </Link>
            <Link to={`/counseling/${n.id}/edit`} className="btn">
              수정
            </Link>
          </>
        }
      />
      <section className="panel">
        <div className="panel-body">
          <table className="kv">
            <tbody>
              <tr>
                <th>학생</th>
                <td>
                  <StudentLink stId={n.stId} name={n.name} /> <span className="muted">{n.stId} · {n.campus}</span>
                </td>
                <th>상담일</th>
                <td>{n.date}</td>
              </tr>
              <tr>
                <th>작성</th>
                <td>
                  {n.author} <span className="muted">{ymdhm(n.createdAt)}</span>
                </td>
                <th>수정</th>
                <td>{n.updatedAt !== n.createdAt ? `${n.updatedBy} ${ymdhm(n.updatedAt)}` : '-'}</td>
              </tr>
              <tr>
                <th>후속 조치</th>
                <td colSpan={3}>
                  <FollowUp n={n} />
                  {n.followUpDone && n.followUpDoneBy && (
                    <span className="muted">
                      {' '}
                      · {n.followUpDoneBy} {mdhm(n.followUpDoneAt)}
                    </span>
                  )}
                  {n.followUpDue && (
                    <>
                      {' '}
                      <button type="button" className="btn btn-xs" disabled={busy} onClick={() => followUp(!n.followUpDone)}>
                        {n.followUpDone ? '완료 되돌리기' : '완료 처리'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <pre className="note-body">{n.content}</pre>
      {error && <p className="text-red">{error}</p>}
      <section className="panel">
        <div className="panel-head">
          <h2>
            열람·수정 기록 <small>({data.trailCount}건)</small>
          </h2>
          <Link to={`/audit?q=${n.stId}`} className="more">
            접근 기록 &gt;
          </Link>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>시각</th>
                <th>직원</th>
                <th>종류</th>
              </tr>
            </thead>
            <tbody>
              {data.trail.map((l) => (
                <tr key={l.id}>
                  <td>{ymdhm(l.at)}</td>
                  <td>{l.actor}</td>
                  <td>{ACTION_LABEL[l.action] ?? l.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
