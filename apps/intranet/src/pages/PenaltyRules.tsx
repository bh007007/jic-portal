import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorText, useApi, type Meta, type PenaltyRules as Rules } from '../api';
import { Loading, PageTitle } from '../components/ui';

/** 위반별 점수·승인 권한, 경고 단계 기준. 비워 두면 '미정'으로 보인다(HANDOFF 7: 아직 정하지 않음). */
export default function PenaltyRules() {
  const { data, error, reload } = useApi<Rules>('/api/penalty-rules');
  const { data: meta } = useApi<Meta>('/api/meta');
  const readOnly = meta?.staffRole === 'office'; // 오피스는 읽기만(docs/roles.md). 서버·DB 도 막는다
  const [form, setForm] = useState<Rules | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(data), [data]);

  if (!form) return <Loading error={error} onRetry={reload} />;
  const toNum = (v: string) => (v.trim() === '' ? null : Number(v));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api<Rules>('/api/penalty-rules', { method: 'PUT', body: form });
      setForm(saved);
      setMessage({ ok: true, text: '저장했습니다. 승인 대기 중인 건에 바로 반영되고, 이미 승인한 건의 점수는 바뀌지 않습니다.' });
    } catch (err) {
      setMessage({ ok: false, text: errorText((err as ApiError).code) });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="패널티 점수표" path="홈 > 학생 생활 > 패널티 점수표" />
      <form className="col" onSubmit={submit}>
        <fieldset className="plain" disabled={readOnly}>
          <section className="panel">
            <div className="panel-head">
              <h2>위반별 점수</h2>
            </div>
            <div className="panel-body">
              <table className="tbl center">
                <thead>
                  <tr>
                    <th className="left">위반 종류</th>
                    <th>점수</th>
                    <th>승인 권한</th>
                  </tr>
                </thead>
                <tbody>
                  {form.kinds.map((k, i) => (
                    <tr key={k.code}>
                      <td className="left">{k.name}</td>
                      <td>
                        <input
                          className="cell-input num-input"
                          type="number"
                          min={0}
                          max={100}
                          aria-label={`${k.name} 점수`}
                          placeholder="미정"
                          value={k.score ?? ''}
                          onChange={(e) => setForm({ ...form, kinds: form.kinds.map((x, j) => (j === i ? { ...x, score: toNum(e.target.value) } : x)) })}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          type="text"
                          maxLength={20}
                          aria-label={`${k.name} 승인 권한`}
                          placeholder="예: 매니저"
                          value={k.approver}
                          onChange={(e) => setForm({ ...form, kinds: form.kinds.map((x, j) => (j === i ? { ...x, approver: e.target.value } : x)) })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>경고 단계 기준 (누적 점수)</h2>
            </div>
            <div className="panel-body">
              <table className="tbl center">
                <thead>
                  <tr>
                    {form.stages.map((s) => (
                      <th key={s.name}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {form.stages.map((s, i) => (
                      <td key={s.name}>
                        <input
                          className="cell-input num-input"
                          type="number"
                          min={1}
                          aria-label={`${s.name} 기준 점수`}
                          placeholder="미정"
                          value={s.min ?? ''}
                          onChange={(e) => setForm({ ...form, stages: form.stages.map((x, j) => (j === i ? { ...x, min: toNum(e.target.value) } : x)) })}
                        />{' '}
                        점 이상
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </fieldset>

        <div className="form-actions">
          {readOnly && <span className="muted">점수표는 관리자만 바꿀 수 있습니다.</span>}
          {message && (
            <span className={message.ok ? 'text-blue' : 'text-red'} role="status">
              {message.text}
            </span>
          )}
          {!readOnly && (
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              저장
            </button>
          )}
        </div>
      </form>
    </>
  );
}
