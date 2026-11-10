import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useAccess, useApi, type TripDetail as Detail } from '../api';
import { Loading, PageTitle, StudentLink } from '../components/ui';
import { mdhm } from '../format';
import { deadlineText, SIGNUP_STATUS, SIGNUP_STATUS_CLASS, TRIP_ERRORS, TRIP_STATUS, TRIP_STATUS_CLASS, tripCost, tripDates } from '../tripLabels';

// 여행 상세와 참가 명단. 명단에서 빼면 사유가 학생 앱에 보이고, 1박 이상 여행이면 그 학생의 외박 허용도 빠진다.
export default function TripDetail() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<Detail>(`/api/trips/${encodeURIComponent(id)}`);
  const { manager } = useAccess(); // 매니저는 읽기만
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const path = '홈 > 신청 처리 > 학교 여행 > 상세';
  const text = (code: string) => TRIP_ERRORS[code] ?? errorText(code);

  if (error === 'not_found') return <div className="state-msg">여행을 찾을 수 없습니다.</div>;
  if (!data) return <Loading error={error} onRetry={reload} />;
  const t = data.trip;
  const applied = data.signups.filter((s) => s.status === 'applied');

  async function setStatus(status: 'open' | 'closed' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm('여행을 취소할까요? 학생 앱에 "여행 취소"로 보이고 되돌릴 수 없습니다.')) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/trips/${encodeURIComponent(t.id)}/status`, { method: 'POST', body: { status } });
      setMessage({ id: 'trip', text: status === 'cancelled' ? '여행을 취소했습니다.' : status === 'closed' ? '신청을 마감했습니다.' : '신청을 다시 받습니다.', ok: true });
      reload();
      notifySummaryChanged();
    } catch (e) {
      setMessage({ id: 'trip', text: text((e as ApiError).code), ok: false });
    }
    setBusy(false);
  }

  async function remove(signupId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/trips/signups/${encodeURIComponent(signupId)}/remove`, { method: 'POST', body: { reason: reasons[signupId] ?? '' } });
      setMessage({ id: signupId, text: '명단에서 뺐습니다.', ok: true });
      setReasons((r) => ({ ...r, [signupId]: '' }));
      reload();
      notifySummaryChanged();
    } catch (e) {
      setMessage({ id: signupId, text: text((e as ApiError).code), ok: false });
    }
    setBusy(false);
  }

  const editable = t.status !== 'cancelled' && !manager;
  return (
    <>
      <PageTitle
        title={t.title}
        path={path}
        actions={
          editable && (
            <>
              <Link to={`/trips/${t.id}/edit`} className="btn">
                수정
              </Link>
              {t.status === 'open' ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('closed')}>
                  신청 마감
                </button>
              ) : (
                <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('open')}>
                  신청 다시 받기
                </button>
              )}
              <button type="button" className="btn" disabled={busy} onClick={() => void setStatus('cancelled')}>
                여행 취소
              </button>
            </>
          )
        }
      />
      {message?.id === 'trip' && (
        <p className={'toolbar-msg ' + (message.ok ? 'text-blue' : 'text-red')} role="status">
          {message.text}
        </p>
      )}
      <section className="panel">
        <div className="panel-body">
          <table className="kv">
            <tbody>
              <tr>
                <th>상태</th>
                <td className={TRIP_STATUS_CLASS[t.status]}>
                  {TRIP_STATUS[t.status]}
                  {t.status === 'open' && !t.accepting && <span className="muted"> (마감일 지남)</span>}
                </td>
              </tr>
              <tr>
                <th>일정</th>
                <td>{tripDates(t)}</td>
              </tr>
              <tr>
                <th>장소</th>
                <td>{t.place}</td>
              </tr>
              <tr>
                <th>집합</th>
                <td>{t.meeting || '-'}</td>
              </tr>
              <tr>
                <th>대상 캠퍼스</th>
                <td>{t.campus || '전체'}</td>
              </tr>
              <tr>
                <th>신청 / 정원</th>
                <td>
                  {t.taken} / {t.capacity}명
                </td>
              </tr>
              <tr>
                <th>비용</th>
                <td>{tripCost(t.cost)}</td>
              </tr>
              <tr>
                <th>신청 마감</th>
                <td>{deadlineText(t.deadline)}</td>
              </tr>
              <tr>
                <th>안내</th>
                <td className="pre">{t.description || '-'}</td>
              </tr>
              <tr>
                <th>외박 허용</th>
                <td>{t.nights > 0 ? (t.status === 'cancelled' ? '없음 (여행 취소)' : `참가 신청한 학생 ${applied.length}명, ${t.nights}박`) : '없음 (당일 여행)'}</td>
              </tr>
              <tr>
                <th>올린 직원</th>
                <td>
                  {t.createdBy ?? '-'} · {mdhm(t.createdAt)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            참가 명단 <small>(신청 {applied.length}명{data.waiting > 0 ? ` · 대기 ${data.waiting}명` : ''})</small>
          </h2>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>No</th>
                <th className="left">학생</th>
                <th>캠퍼스</th>
                <th>신청</th>
                <th>상태</th>
                <th className="left">{editable ? '명단에서 빼기 (사유는 학생에게 보임)' : '제외 사유'}</th>
              </tr>
            </thead>
            <tbody>
              {data.signups.length === 0 ? (
                <tr className="empty">
                  <td colSpan={6}>신청한 학생이 없습니다.</td>
                </tr>
              ) : (
                data.signups.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td className="left">
                      <StudentLink stId={s.stId} name={s.name} />
                      <div className="muted small">{s.stId}</div>
                    </td>
                    <td>{s.campus}</td>
                    <td className="nowrap">{mdhm(s.createdAt)}</td>
                    <td className={SIGNUP_STATUS_CLASS[s.status]}>
                      {SIGNUP_STATUS[s.status]}
                      {s.waitingNo ? ` ${s.waitingNo}번` : ''}
                    </td>
                    <td className="left life-handle">
                      {(s.status === 'applied' || s.status === 'waiting') && editable ? (
                        <div className="trip-remove">
                          <input
                            type="text"
                            className="cell-input"
                            aria-label={`${s.name} 제외 사유`}
                            placeholder="사유 (예: 보호자 동의서 미제출)"
                            maxLength={data.limits.reason}
                            value={reasons[s.id] ?? ''}
                            onChange={(e) => setReasons((x) => ({ ...x, [s.id]: e.target.value }))}
                          />
                          <button type="button" className="btn btn-xs" disabled={busy} onClick={() => void remove(s.id)}>
                            빼기
                          </button>
                        </div>
                      ) : (
                        <>
                          {s.reason ?? '-'}
                          {s.handledBy && <span className="muted small"> · {s.handledBy}</span>}
                        </>
                      )}
                      {message?.id === s.id && (
                        <div className={'small ' + (message.ok ? 'text-blue' : 'text-red')} role="status">
                          {message.text}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
