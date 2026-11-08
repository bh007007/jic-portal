import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useApi, type PenaltyList, type PenaltyRow } from '../api';
import { Loading, PageTitle, Tabs } from '../components/ui';
import { md, mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['from', 'to', 'campus', 'kind', 'q'] as const;
const SOURCE: Record<string, string> = { outing: '외출 기록' };

export default function Penalties() {
  const f = useSearchForm(KEYS);
  const tab = f.params.get('tab') || 'pending';
  const { data, error, reload } = useApi<PenaltyList>('/api/penalties?' + f.query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(ids: string[], approve: boolean) {
    if (!ids.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ done: number; skipped: string[] }>('/api/penalties/decide', { method: 'POST', body: { ids, approve } });
      setMessage(`${r.done}건 ${approve ? '승인' : '반려'}했습니다.` + (r.skipped.length ? ` (이미 처리된 ${r.skipped.length}건 제외)` : ''));
      setSelected(new Set());
      reload();
      notifySummaryChanged();
    } catch (e) {
      setMessage(errorText((e as ApiError).code));
    }
    setBusy(false);
  }

  const rows = data?.rows ?? [];
  const pending = tab === 'pending';
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageTitle title="패널티 승인" path="홈 > 학생 생활 > 패널티 승인" />
      <Tabs
        label="처리 상태"
        value={tab}
        onChange={(k) => {
          setSelected(new Set());
          setMessage(null);
          f.apply({ tab: k === 'pending' ? '' : k });
        }}
        items={[
          { key: 'pending', label: `승인 대기 (${data?.counts.pending ?? 0})` },
          { key: 'approved', label: '승인 완료' },
          { key: 'rejected', label: '반려' },
        ]}
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
            <span>위반 종류</span>
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
                  <th>발생일</th>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>위반 종류</th>
                  <th className="left">근거</th>
                  <th>출처</th>
                  <th>점수</th>
                  <th>{pending ? '승인 후 누적' : '현재 누적'}</th>
                  <th>경고 단계</th>
                  <th>승인 권한</th>
                  <th>{pending ? '처리' : '처리일'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={pending ? 12 : 11}>해당하는 건이 없습니다.</td>
                  </tr>
                ) : (
                  rows.map((r) => <Row key={r.id} r={r} pending={pending} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} onDecide={(ok) => decide([r.id], ok)} busy={busy} />)
                )}
              </tbody>
            </table>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>경고 단계 기준</h2>
              <Link to="/penalty-rules" className="more">
                점수표 관리 &gt;
              </Link>
            </div>
            <div className="panel-body">
              <table className="tbl center">
                <thead>
                  <tr>
                    {data.stages.map((s) => (
                      <th key={s.name}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {data.stages.map((s) => (
                      <td key={s.name}>{s.min === null ? <span className="muted">미정</span> : `${s.min}점 이상`}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Row({ r, pending, checked, onToggle, onDecide, busy }: { r: PenaltyRow; pending: boolean; checked: boolean; onToggle: () => void; onDecide: (ok: boolean) => void; busy: boolean }) {
  return (
    <tr>
      {pending && (
        <td>
          <input type="checkbox" aria-label={`${r.name} 선택`} checked={checked} onChange={onToggle} />
        </td>
      )}
      <td>{md(r.date)}</td>
      <td className="left">
        {r.name}
        <br />
        <span className="muted small">{r.stId}</span>
      </td>
      <td>{r.campus}</td>
      <td>{r.kindName}</td>
      <td className="left">{r.basis}</td>
      <td className="muted">{SOURCE[r.source] ?? r.source}</td>
      <td>{r.score === null ? <span className="muted">미정</span> : r.score}</td>
      <td>{r.total === null ? '-' : r.total}</td>
      <td>{r.score === null && pending ? <span className="muted">점수 미정</span> : r.stage === null ? <span className="muted">기준 미정</span> : r.stage}</td>
      <td>{r.approver || <span className="muted">미정</span>}</td>
      <td className="nowrap">
        {pending ? (
          <>
            <button type="button" className="btn btn-xs btn-primary" disabled={busy} onClick={() => onDecide(true)}>
              승인
            </button>{' '}
            <button type="button" className="btn btn-xs" disabled={busy} onClick={() => onDecide(false)}>
              반려
            </button>
          </>
        ) : (
          mdhm(r.decidedAt)
        )}
      </td>
    </tr>
  );
}
