import { useState } from 'react';
import { api, ApiError, errorText, notifySummaryChanged, useApi, type RequestList } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { md, mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

// 학생 앱에서 낸 결석·외박 신청을 승인·반려한다. 처리 메모는 학생 앱 신청 상세에 그대로 보인다.
type Kind = 'absences' | 'overnights';
const KEYS = ['from', 'to', 'campus', 'kind', 'q'] as const;
const KIND_LABEL: Record<string, string> = { sick: '병결', official: '공결', personal: '개인 사유' };
const STATUS_LABEL: Record<string, string> = { pending: '대기', approved: '승인', rejected: '반려', cancelled: '학생 취소' };
const WEEK = '일월화수목금토';
const day = (d: string) => `${md(d)} (${WEEK[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
const periodsText = (p: number[]) => (p.length ? `${p.join('·')}교시` : '종일');

export default function Requests({ kind }: { kind: Kind }) {
  const f = useSearchForm(KEYS);
  const tab = f.params.get('tab') || 'pending';
  const { data, error, reload } = useApi<RequestList>(`/api/requests/${kind}?` + f.query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const title = kind === 'absences' ? '결석 신청' : '외박 신청';
  const pending = tab === 'pending';
  const rows: { id: string }[] = (kind === 'absences' ? data?.absences : data?.overnights) ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function decide(ids: string[], approve: boolean) {
    if (!ids.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ done: number; skipped: string[] }>(`/api/requests/${kind}/decide`, { method: 'POST', body: { ids, approve, comment } });
      setMessage(`${r.done}건 ${approve ? '승인' : '반려'}했습니다.` + (r.skipped.length ? ` (이미 처리되었거나 취소된 ${r.skipped.length}건 제외)` : ''));
      setSelected(new Set());
      setComment('');
      reload();
      notifySummaryChanged();
    } catch (e) {
      setMessage(errorText((e as ApiError).code));
    }
    setBusy(false);
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const check = (id: string, name: string) =>
    pending && (
      <td>
        <input type="checkbox" aria-label={`${name} 선택`} checked={selected.has(id)} onChange={() => toggle(id)} />
      </td>
    );
  const actions = (r: { id: string; status: string; decidedAt: string | null; comment: string | null; updatedAt: string }) =>
    pending ? (
      <td className="nowrap">
        <button type="button" className="btn btn-xs btn-primary" disabled={busy} onClick={() => decide([r.id], true)}>
          승인
        </button>{' '}
        <button type="button" className="btn btn-xs" disabled={busy} onClick={() => decide([r.id], false)}>
          반려
        </button>
      </td>
    ) : (
      <td className="left">
        {mdhm(r.decidedAt ?? r.updatedAt)}
        {r.comment && <div className="muted small">{r.comment}</div>}
      </td>
    );

  return (
    <>
      <PageTitle title={title} path={`홈 > 신청 처리 > ${title}`} />
      <Tabs
        label="처리 상태"
        value={tab}
        onChange={(k) => {
          setSelected(new Set());
          setMessage(null);
          f.apply({ tab: k === 'pending' ? '' : k });
        }}
        items={[
          { key: 'pending', label: `대기 (${data?.counts.pending ?? 0})` },
          { key: 'approved', label: `승인 (${data?.counts.approved ?? 0})` },
          { key: 'rejected', label: `반려 (${data?.counts.rejected ?? 0})` },
          { key: 'cancelled', label: `학생 취소 (${data?.counts.cancelled ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <div className="field range">
            <span>{kind === 'absences' ? '결석일' : '외박 기간'}</span>
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
          {kind === 'absences' && (
            <label className="field">
              <span>종류</span>
              <select value={f.form.kind} onChange={f.set('kind')}>
                <option value="">전체</option>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>학생</span>
            <input type="text" placeholder="이름 또는 학생번호" value={f.form.q} onChange={f.set('q')} />
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
              총 <strong className="text-primary">{rows.length}</strong>건
              {message && (
                <span className="toolbar-msg" role="status">
                  {message}
                </span>
              )}
            </span>
            {pending && (
              <div className="toolbar-right">
                <input
                  type="text"
                  className="cell-input memo-input"
                  aria-label="처리 메모"
                  placeholder="처리 메모 (학생에게 보임)"
                  maxLength={data.commentMax}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button type="button" className="btn" disabled={busy || selected.size === 0} onClick={() => decide([...selected], false)}>
                  선택 반려
                </button>
                <button type="button" className="btn btn-primary" disabled={busy || selected.size === 0} onClick={() => decide([...selected], true)}>
                  선택 승인
                </button>
              </div>
            )}
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  {pending && (
                    <th>
                      <input type="checkbox" aria-label="전체 선택" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} />
                    </th>
                  )}
                  {kind === 'absences' ? (
                    <>
                      <th>결석일</th>
                      <th className="left">학생</th>
                      <th>캠퍼스</th>
                      <th>종류</th>
                      <th>교시</th>
                    </>
                  ) : (
                    <>
                      <th>외박 기간</th>
                      <th className="left">학생</th>
                      <th>캠퍼스</th>
                      <th>박</th>
                    </>
                  )}
                  <th className="left">사유</th>
                  <th>제출</th>
                  {!pending && <th>상태</th>}
                  <th className={pending ? '' : 'left'}>{pending ? '처리' : '처리 시각 · 메모'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={10}>해당하는 신청이 없습니다.</td>
                  </tr>
                ) : kind === 'absences' ? (
                  data.absences.map((r) => (
                    <tr key={r.id}>
                      {check(r.id, r.name)}
                      <td className="nowrap">{day(r.date)}</td>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} /> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                      <td>{periodsText(r.periods)}</td>
                      <td className="left memo-text">{r.reason}</td>
                      <td className="nowrap">{mdhm(r.submittedAt)}</td>
                      {!pending && <td>{STATUS_LABEL[r.status]}</td>}
                      {actions(r)}
                    </tr>
                  ))
                ) : (
                  data.overnights.map((r) => (
                    <tr key={r.id}>
                      {check(r.id, r.name)}
                      <td className="nowrap">
                        {day(r.from)} ~ {day(r.until)}
                      </td>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} /> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td>{r.nights}</td>
                      <td className="left memo-text">{r.reason}</td>
                      <td className="nowrap">{mdhm(r.submittedAt)}</td>
                      {!pending && <td>{STATUS_LABEL[r.status]}</td>}
                      {actions(r)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {kind === 'overnights' && <p className="muted small">승인한 외박 기간의 밤은 통금 확인에서 빠지고, 가드 태블릿 외출 중 목록에 '외박 허용'으로 보입니다.</p>}
        </>
      )}
    </>
  );
}
