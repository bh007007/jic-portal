import { Fragment, useState } from 'react';
import { api, ApiError, errorText, notifySummaryChanged, useApi, useStaffName, type DepartureList } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { dateWithDay, md, mdhm } from '../format';
import { useSearchForm } from '../useSearchForm';

const KEYS = ['from', 'to', 'campus', 'ride'] as const;
const AIRPORT: Record<string, string> = { MANILA: '마닐라', CLARK: '클락', OTHER: '기타' };
type Row = DepartureList['registered'][number];
const RIDE: Record<string, [string, string]> = {
  none: ['-', 'muted'],
  requested: ['요청', 'text-amber strong'],
  changed: ['재확인 필요', 'text-red strong'],
  confirmed: ['확정', 'text-blue'],
  declined: ['불가', 'muted'],
  withdrawn: ['요청 취소', 'muted'],
};
const prevDay = (d: string) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);

/** 학생 앱에서 등록한 귀국 항공편(공항 이동 배차용)과, 졸업 14일 이내인데 아직 등록하지 않은 학생. */
export default function Departures() {
  const f = useSearchForm(KEYS);
  const view = f.params.get('view') || 'registered';
  const { data, error, reload } = useApi<DepartureList>('/api/departures?' + f.query);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <PageTitle title="귀국 일정" path="홈 > 학생 생활 > 귀국 일정" />
      <Tabs
        label="보기"
        value={view}
        onChange={(k) => f.apply({ view: k === 'registered' ? '' : k })}
        items={[
          { key: 'registered', label: `등록 (${data?.counts.registered ?? 0})` },
          { key: 'missing', label: `미등록, 졸업 14일 이내 (${data?.counts.missing ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          {view === 'registered' && (
            <div className="field range">
              <span>출발일</span>
              <input type="date" aria-label="시작일" value={f.form.from || data?.from || ''} onChange={f.set('from')} />
              <span className="nowrap">~</span>
              <input type="date" aria-label="종료일" value={f.form.to || data?.to || ''} onChange={f.set('to')} />
            </div>
          )}
          <label className="field">
            <span>캠퍼스</span>
            <select value={f.form.campus} onChange={f.set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {view === 'registered' && (
            <label className="field">
              <span>차량</span>
              <select value={f.form.ride} onChange={f.set('ride')}>
                <option value="">전체</option>
                <option value="1">공항 이동 차량 요청만</option>
                <option value="pending">배차 처리할 것 (요청·재확인)</option>
              </select>
            </label>
          )}
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
      ) : view === 'missing' ? (
        <>
          <div className="toolbar">
            <span>
              {dateWithDay(data.today)}부터 14일 안에 연수가 끝나는 재학생 중 귀국 항공편을 등록하지 않은 학생 <strong className="text-primary">{data.missing.length}</strong>명
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>연수 종료</th>
                  <th>남은 날</th>
                </tr>
              </thead>
              <tbody>
                {data.missing.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={4}>모두 등록했습니다.</td>
                  </tr>
                ) : (
                  data.missing.map((r) => (
                    <tr key={r.trId}>
                      <td className="left">
                        <StudentLink stId={r.stId} name={r.name} /> <span className="muted small">{r.stId}</span>
                      </td>
                      <td>{r.campus}</td>
                      <td>{dateWithDay(r.end)}</td>
                      <td className={r.daysLeft <= 3 ? 'text-red strong' : ''}>{r.daysLeft === 0 ? '오늘' : `${r.daysLeft}일`}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar">
            <span>
              {dateWithDay(data.from)} ~ {dateWithDay(data.to)} 출발 <strong className="text-primary">{data.registered.length}</strong>명 · 공항 이동 차량 요청 {data.counts.rides}명
              {data.counts.ridePending > 0 && <span className="text-red"> · 배차 처리할 것 {data.counts.ridePending}건(오늘 이후 전체)</span>}
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>출발일</th>
                  <th>시각</th>
                  <th className="left">학생</th>
                  <th>캠퍼스</th>
                  <th>연수 종료</th>
                  <th>항공편</th>
                  <th>공항</th>
                  <th className="left">메모</th>
                  <th>공항 이동</th>
                </tr>
              </thead>
              <tbody>
                {data.registered.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={10}>이 기간에 출발하는 학생이 없습니다.</td>
                  </tr>
                ) : (
                  data.registered.map((d) => (
                    <Fragment key={d.id}>
                    <tr>
                      <td className="nowrap">{dateWithDay(d.date)}</td>
                      <td>{d.time}</td>
                      <td className="left">
                        <StudentLink stId={d.stId} name={d.name} /> <span className="muted small">{d.stId}</span>
                      </td>
                      <td>{d.campus}</td>
                      <td>{d.end ? md(d.end) : '-'}</td>
                      <td>{d.flight}</td>
                      <td>{AIRPORT[d.airport] ?? d.airport}</td>
                      <td className="left memo-text">{d.note || <span className="muted">-</span>}</td>
                      <td className="nowrap">
                        <RideCell d={d} open={editing === d.id} onToggle={() => setEditing(editing === d.id ? null : d.id)} past={d.date < data.today} />
                      </td>
                    </tr>
                    {editing === d.id && (
                      <tr className="ride-edit">
                        <td colSpan={10}>
                          <RideForm
                            d={d}
                            onDone={() => {
                              setEditing(null);
                              reload();
                              notifySummaryChanged();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
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

function RideCell({ d, open, onToggle, past }: { d: Row; open: boolean; onToggle: () => void; past: boolean }) {
  const [label, cls] = RIDE[d.ride.state];
  const r = d.ride.record;
  return (
    <>
      <span className={cls}>{label}</span>
      {d.ride.state === 'confirmed' && r && (
        <span className="muted small">
          {' '}
          기숙사 출발 {md(r.pickupDate!)} {r.pickupTime}
        </span>
      )}
      {r && d.ride.state !== 'none' && <div className="muted small">{r.decidedBy} · {mdhm(r.decidedAt)}</div>}
      {d.needsRide && !past && (
        <div>
          <button type="button" className="btn btn-xs" onClick={onToggle}>
            {open ? '닫기' : r ? '다시 처리' : '처리'}
          </button>
        </div>
      )}
    </>
  );
}

/** 배차 확정(기숙사 출발 일시, 차량·집합 장소) 또는 불가(사유). 처리자는 오른쪽 위 직원 이름. */
function RideForm({ d, onDone }: { d: Row; onDone: () => void }) {
  const staff = useStaffName();
  const r = d.ride.record;
  const [day, setDay] = useState(r?.pickupDate === prevDay(d.date) ? 'before' : 'same');
  const [time, setTime] = useState(r?.decision === 'confirmed' ? (r.pickupTime ?? '') : '');
  const [note, setNote] = useState(r?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!staff) return <p className="text-red small">{errorText('actor_required')}</p>;

  async function send(decision: 'confirmed' | 'declined') {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/departures/${d.id}/ride`, { method: 'POST', body: { decision, pickupDate: day === 'before' ? prevDay(d.date) : d.date, pickupTime: time, note } });
      onDone();
    } catch (e) {
      setError(errorText((e as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <div className="ride-form">
      <span className="strong">
        {d.name} · {dateWithDay(d.date)} {d.time} {d.flight} ({AIRPORT[d.airport] ?? d.airport})
      </span>
      {d.ride.state === 'changed' && r && <span className="text-red small">처리 뒤 항공편이 바뀌었습니다(처리 당시 {md(r.forDate)} {r.forTime}).</span>}
      <div className="ride-form-row">
        <span>기숙사 출발</span>
        <label>
          <input type="radio" name={`day-${d.id}`} checked={day === 'same'} onChange={() => setDay('same')} /> 출발일 ({md(d.date)})
        </label>
        <label>
          <input type="radio" name={`day-${d.id}`} checked={day === 'before'} onChange={() => setDay('before')} /> 전날 ({md(prevDay(d.date))})
        </label>
        <input type="time" className="cell-input" aria-label="기숙사 출발 시각" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="ride-form-row">
        <span>메모</span>
        <input type="text" className="cell-input wide-input" maxLength={200} placeholder="확정: 차량·집합 장소 / 불가: 사유 (학생에게 보임)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <span className="text-red small">{error}</span>}
      <div className="ride-form-row">
        <span />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send('confirmed')}>
          배차 확정
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => send('declined')}>
          배차 불가
        </button>
        <span className="muted small">처리자: {staff}</span>
      </div>
    </div>
  );
}
