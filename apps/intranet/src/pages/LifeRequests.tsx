import { useState } from 'react';
import { api, ApiError, errorText, notifySummaryChanged, useApi, type LifeRequestList } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { mdhm } from '../format';
import { LIFE_CATEGORY, LIFE_STATUS, LIFE_STATUS_CLASS } from '../lifeLabels';
import { useSearchForm } from '../useSearchForm';

// 학생 앱에서 낸 생활 요청(업체 '요청사항(학생)'·'ID 카드 교체')을 처리한다: 접수 → 처리 중 → 완료·반려.
// 답변은 학생 앱 요청 상세에 그대로 보인다. 반려는 사유가 있어야 한다.
const KEYS = ['category', 'campus', 'q'] as const;
type Status = 'in_progress' | 'done' | 'rejected';
const DONE_MSG: Record<Status, string> = { in_progress: '처리 중으로 바꿨습니다.', done: '완료했습니다.', rejected: '반려했습니다.' };

export default function LifeRequests() {
  const f = useSearchForm(KEYS);
  const tab = f.params.get('tab') || 'received';
  const { data, error, reload } = useApi<LifeRequestList>('/api/requests/life?' + f.query);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const open = tab === 'received' || tab === 'in_progress';

  async function handle(id: string, status: Status) {
    setBusy(id);
    setMessage(null);
    try {
      await api(`/api/requests/life/${encodeURIComponent(id)}/handle`, { method: 'POST', body: { status, reply: replies[id] ?? '' } });
      setMessage({ id, text: DONE_MSG[status], ok: true });
      setReplies((r) => ({ ...r, [id]: '' }));
      reload();
      notifySummaryChanged();
    } catch (e) {
      setMessage({ id, text: errorText((e as ApiError).code), ok: false });
    }
    setBusy(null);
  }

  return (
    <>
      <PageTitle title="생활 요청" path="홈 > 신청 처리 > 생활 요청" />
      <Tabs
        label="처리 상태"
        value={tab}
        onChange={(k) => {
          setMessage(null);
          f.apply({ tab: k === 'received' ? '' : k });
        }}
        items={(['received', 'in_progress', 'done', 'rejected', 'cancelled'] as const).map((k) => ({ key: k, label: `${LIFE_STATUS[k]} (${data?.counts[k] ?? 0})` }))}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <label className="field">
            <span>종류</span>
            <select value={f.form.category} onChange={f.set('category')}>
              <option value="">전체</option>
              {(data?.categories ?? Object.keys(LIFE_CATEGORY)).map((c) => (
                <option key={c} value={c}>
                  {LIFE_CATEGORY[c] ?? c}
                </option>
              ))}
            </select>
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
            <span>검색</span>
            <input type="text" placeholder="이름, 학생번호, 내용" value={f.form.q} onChange={f.set('q')} />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => f.reset()}>
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
              {message && !data.rows.some((r) => r.id === message.id) && (
                <span className={'toolbar-msg' + (message.ok ? '' : ' text-red')} role="status">
                  {message.text}
                </span>
              )}
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>접수</th>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>종류</th>
                  <th className="left">내용</th>
                  {open ? <th className="left">답변 (학생에게 보임) · 처리</th> : <th className="left">처리 · 답변</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={6}>요청이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{mdhm(r.submittedAt)}</td>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} />
                        <div className="muted small">{r.stId}</div>
                      </td>
                      <td>{r.campus}</td>
                      <td className="nowrap">{LIFE_CATEGORY[r.category] ?? r.category}</td>
                      <td className="left pre">{r.content}</td>
                      {open ? (
                        <td className="left life-handle">
                          {r.reply && <div className="muted small">지난 답변: {r.reply}</div>}
                          <input
                            type="text"
                            className="cell-input"
                            aria-label={`${r.name} 답변`}
                            placeholder={r.status === 'received' ? '답변 (반려할 때는 사유 필수)' : '답변 (비우면 지난 답변 유지)'}
                            maxLength={data.replyMax}
                            value={replies[r.id] ?? ''}
                            onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))}
                          />
                          <div className="life-actions">
                            {r.status === 'received' && (
                              <button type="button" className="btn btn-xs" disabled={busy === r.id} onClick={() => void handle(r.id, 'in_progress')}>
                                처리 중
                              </button>
                            )}
                            <button type="button" className="btn btn-xs btn-primary" disabled={busy === r.id} onClick={() => void handle(r.id, 'done')}>
                              완료
                            </button>
                            <button type="button" className="btn btn-xs" disabled={busy === r.id} onClick={() => void handle(r.id, 'rejected')}>
                              반려
                            </button>
                            {r.status === 'in_progress' && r.handledBy && <span className="muted small">처리 중: {r.handledBy}</span>}
                          </div>
                          {message?.id === r.id && (
                            <div className={'small ' + (message.ok ? 'text-blue' : 'text-red')} role="status">
                              {message.text}
                            </div>
                          )}
                        </td>
                      ) : (
                        <td className="left">
                          <span className={LIFE_STATUS_CLASS[r.status]}>{LIFE_STATUS[r.status]}</span> {r.handledAt && mdhm(r.handledAt)}
                          {r.handledBy && <span className="muted small"> · {r.handledBy}</span>}
                          {r.reply && <div className="small">{r.reply}</div>}
                        </td>
                      )}
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
