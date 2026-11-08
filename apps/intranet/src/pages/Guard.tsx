import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorText, useApi, type GuardView, type OutingRow } from '../api';
import { REPORT_KINDS, REPORT_LABEL, type ReportKind } from '../../server/reports';
import { duration, hm, md } from '../format';

// 디자인 I2(GuardTablet.dc.html). 이 기기에서 고른 캠퍼스·근무자·처리 종류는 기기에만 기억한다.
type Mode = 'out' | 'in';
const KEY = { campus: 'jic-guard-campus', guard: 'jic-guard-name', mode: 'jic-guard-mode' };
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기억
  }
};

type Result = { ok: true; mode: Mode; row: OutingRow } | { ok: false; message: string };
type Reported = { name: string; stId: string; campus: string; kindLabel: string; occurredAt: string };

export default function Guard() {
  const [campus, setCampus] = useState(load(KEY.campus));
  const { data, error, reload } = useApi<GuardView>(`/api/guard?campus=${encodeURIComponent(campus)}`, 30000);

  if (!data) return <div className="guard-blank">{error ? `불러오지 못했습니다 (${error})` : '불러오는 중…'}</div>;
  if (!campus || !data.campuses.includes(campus)) {
    return (
      <div className="guard">
        <GuardHeader view={data} campus="" onCampus={() => undefined} />
        <div className="guard-pick">
          <h1>출입구 캠퍼스</h1>
          <div>
            {data.campuses.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  save(KEY.campus, c);
                  setCampus(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <GuardScreen
      view={data}
      campus={campus}
      onCampus={() => {
        save(KEY.campus, '');
        setCampus('');
      }}
      reload={reload}
    />
  );
}

function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function GuardHeader({ view, campus, onCampus, guard, setGuard }: { view: GuardView; campus: string; onCampus: () => void; guard?: string; setGuard?: (g: string) => void }) {
  const now = useClock();
  return (
    <header className="guard-head">
      <span className="guard-brand">
        <span className="brand-mark-w">JIC</span>
        <span>외출·귀가</span>
      </span>
      {campus && (
        <button type="button" className="guard-campus" onClick={onCampus} title="캠퍼스 바꾸기">
          {campus}
        </button>
      )}
      <span className="guard-clock">{hm(new Date(now).toISOString())}</span>
      <span className="guard-sub">통금 {view.curfew}</span>
      {setGuard &&
        (view.guards.length ? (
          <label className="guard-sub guard-who">
            근무자
            <select value={guard} onChange={(e) => setGuard(e.target.value)}>
              <option value="">선택</option>
              {view.guards.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        ) : (
          <Link to="/settings" className="guard-sub guard-link">
            근무자 미등록
          </Link>
        ))}
    </header>
  );
}

function GuardScreen({ view, campus, onCampus, reload }: { view: GuardView; campus: string; onCampus: () => void; reload: () => void }) {
  const [mode, setModeState] = useState<Mode>(load(KEY.mode) === 'in' ? 'in' : 'out');
  const [guard, setGuardState] = useState(load(KEY.guard));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const setMode = (m: Mode) => {
    save(KEY.mode, m);
    setModeState(m);
    input.current?.focus();
  };
  const setGuard = (g: string) => {
    save(KEY.guard, g);
    setGuardState(g);
  };
  const guardValid = !view.guards.length || view.guards.includes(guard);

  useEffect(() => {
    input.current?.focus();
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const r = await api<{ mode: Mode; row: OutingRow }>('/api/guard/scan', { method: 'POST', body: { code: value, mode, campus, guard } });
      setResult({ ok: true, mode: r.mode, row: r.row });
      setReported(null);
      reload();
    } catch (err) {
      const ae = err as ApiError;
      const outAt = typeof ae.data.outAt === 'string' ? ae.data.outAt : null;
      setReported(null);
      setResult({ ok: false, message: ae.code === 'already_out' && outAt ? `이미 외출 중입니다 (외출 ${hm(outAt)}). 귀가로 처리하세요.` : errorText(ae.code) });
    }
    setCode('');
    setBusy(false);
    input.current?.focus();
  }

  const last = result?.ok ? result.row : (view.recent[0] ?? null);
  const lastMode: Mode | null = result?.ok ? result.mode : last ? (last.inAt ? 'in' : 'out') : null;

  return (
    <div className="guard">
      <GuardHeader view={view} campus={campus} onCampus={onCampus} guard={guard} setGuard={setGuard} />
      <div className="guard-body">
        {reporting ? (
          <ReportForm
            campus={campus}
            guard={guard}
            defaultCode={last?.stId ?? ''}
            onCancel={() => {
              setReporting(false);
              setTimeout(() => input.current?.focus(), 0);
            }}
            onDone={(r) => {
              setReported(r);
              setResult(null);
              setReporting(false);
              reload();
              setTimeout(() => input.current?.focus(), 0);
            }}
          />
        ) : (
        <section className="guard-scan" aria-label="스캔">
          <div role="group" aria-label="처리 종류" className="guard-mode">
            <button type="button" aria-pressed={mode === 'out'} onClick={() => setMode('out')}>
              외출
            </button>
            <button type="button" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>
              귀가
            </button>
          </div>
          <button type="button" className="guard-viewfinder" onClick={() => input.current?.focus()}>
            <span aria-hidden="true" className="corner tl" />
            <span aria-hidden="true" className="corner tr" />
            <span aria-hidden="true" className="corner bl" />
            <span aria-hidden="true" className="corner br" />
            카드키 QR을 비춰주세요
          </button>
          <form className="guard-input" onSubmit={submit}>
            <label>
              <span>학생번호</span>
              <input ref={input} inputMode="numeric" autoComplete="off" aria-label="학생번호 직접 입력" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !code.trim()}>
              {mode === 'out' ? '외출 처리' : '귀가 처리'}
            </button>
          </form>
          {!guardValid && <p className="guard-warn">근무자를 고르세요.</p>}
          <button type="button" className="guard-report-btn" onClick={() => setReporting(true)}>
            사건 리포트 작성
          </button>
        </section>
        )}

        <div className="guard-side">
          <section className={'guard-last' + (result && !result.ok ? ' error' : '')} aria-live="polite">
            <h2 className="sr-only">방금 처리</h2>
            {reported ? (
              <>
                <div className="guard-photo">사진</div>
                <div className="guard-last-text">
                  <span className="guard-name">{reported.name}</span>
                  <span className="muted">
                    {reported.stId} · {reported.campus}
                  </span>
                  <span className="guard-big report">리포트 등록 · {reported.kindLabel}</span>
                  <span className="muted">발생 {hm(reported.occurredAt)} · 패널티 승인 대기로 넘어갔습니다</span>
                </div>
              </>
            ) : result && !result.ok ? (
              <p className="guard-error">{result.message}</p>
            ) : last ? (
              <>
                <div className="guard-photo">사진</div>
                <div className="guard-last-text">
                  <span className="guard-name">{last.name}</span>
                  <span className="muted">
                    {last.stId} · {last.campus}
                  </span>
                  {lastMode === 'in' ? (
                    <>
                      <span className="guard-big in">귀가 {hm(last.inAt)}</span>
                      <span className="muted">{last.outAt ? `외출 ${hm(last.outAt)} · ${duration(last.minutes)}` : '외출 기록 없음'}</span>
                    </>
                  ) : (
                    <span className="guard-big out">외출 {hm(last.outAt)}</span>
                  )}
                  {last.breach && <span className="guard-breach">{last.breach}</span>}
                </div>
              </>
            ) : (
              <p className="muted">-</p>
            )}
          </section>

          <section className="guard-out" aria-labelledby="out-h">
            <div className="guard-out-head">
              <h2 id="out-h">
                외출 중 <span className="text-primary">{view.out.length}</span>명
              </h2>
              <span className="guard-sub-dark">외박 허용 {view.overnightTonight}명</span>
            </div>
            <div className="guard-out-list">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="left">
                      이름
                    </th>
                    <th scope="col">외출</th>
                    <th scope="col">경과</th>
                    <th scope="col" className="right">
                      비고
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.out.length === 0 ? (
                    <tr className="empty">
                      <td colSpan={4}>외출 중인 학생이 없습니다.</td>
                    </tr>
                  ) : (
                    view.out.map((r) => (
                      <tr key={r.id}>
                        <td className="left">
                          {r.name} <span className="muted small">{r.stId}</span>
                        </td>
                        <td>{hm(r.outAt)}</td>
                        <td className={r.breach ? 'text-amber' : ''}>{duration(r.minutes)}</td>
                        <td className="right small">{r.overnightUntil ? `외박 허용 ~${md(r.overnightUntil)}` : r.breach ? '통금 지남' : ''}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** 사건 리포트(음주·폭력·무단외출·기타). 등록하면 인트라넷 패널티 승인 대기로 넘어간다. */
function ReportForm({ campus, guard, defaultCode, onCancel, onDone }: { campus: string; guard: string; defaultCode: string; onCancel: () => void; onDone: (r: Reported) => void }) {
  const [code, setCode] = useState(defaultCode);
  const [kind, setKind] = useState<ReportKind | ''>('');
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind) return setError('종류를 고르세요.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ report: Reported }>('/api/guard/report', { method: 'POST', body: { code, campus, guard, kind, note, time } });
      onDone(r.report);
    } catch (err) {
      setError(errorText((err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <form className="guard-scan guard-report" aria-label="사건 리포트" onSubmit={submit}>
      <h2>사건 리포트</h2>
      <label className="guard-field">
        <span>학생번호</span>
        <input inputMode="numeric" autoComplete="off" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <div className="guard-field">
        <span id="report-kind">종류</span>
        <div role="group" aria-labelledby="report-kind" className="guard-kinds">
          {REPORT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setError(null);
              }}
            >
              {REPORT_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="guard-field top">
        <span>내용</span>
        <textarea rows={4} required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="guard-field">
        <span>발생 시각</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <em>비우면 지금</em>
      </label>
      {error && <p className="guard-warn">{error}</p>}
      <div className="guard-report-actions">
        <button type="button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="primary" disabled={busy}>
          리포트 등록
        </button>
      </div>
    </form>
  );
}
