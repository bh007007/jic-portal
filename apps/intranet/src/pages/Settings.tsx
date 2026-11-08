import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorText, notifySummaryChanged, useApi, type Settings as SettingsData } from '../api';
import { Loading, PageTitle } from '../components/ui';

export default function Settings() {
  const { data, error, reload } = useApi<SettingsData>('/api/settings');
  const [curfew, setCurfew] = useState('');
  const [guards, setGuards] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setCurfew(data.curfew);
    setGuards(data.guards.join('\n'));
  }, [data]);

  if (!data) return <Loading error={error} onRetry={reload} />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const s = await api<SettingsData>('/api/settings', { method: 'PUT', body: { curfew, guards: guards.split('\n') } });
      setCurfew(s.curfew);
      setGuards(s.guards.join('\n'));
      setMessage({ ok: true, text: '저장했습니다.' });
      notifySummaryChanged();
    } catch (err) {
      setMessage({ ok: false, text: errorText((err as ApiError).code) });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="통금·근무자 설정" path="홈 > 학생 생활 > 외출·귀가 > 설정" />
      <form className="panel" onSubmit={submit}>
        <div className="panel-body">
          <table className="kv">
            <tbody>
              <tr>
                <th>
                  <label htmlFor="curfew">통금 시각</label>
                </th>
                <td>
                  <input id="curfew" type="time" required value={curfew} onChange={(e) => setCurfew(e.target.value)} className="cell-input" />
                  <span className="muted small"> 바꾸면 승인 대기 중인 통금 위반 후보가 다시 계산됩니다.</span>
                </td>
              </tr>
              <tr>
                <th>
                  <label htmlFor="guards">근무자</label>
                </th>
                <td>
                  <textarea id="guards" rows={6} value={guards} onChange={(e) => setGuards(e.target.value)} className="cell-input wide" placeholder="한 줄에 한 명" />
                  <div className="muted small">가드 태블릿의 근무자 목록입니다. 비워 두면 근무자 없이 기록합니다.</div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="form-actions">
            {message && (
              <span className={message.ok ? 'text-blue' : 'text-red'} role="status">
                {message.text}
              </span>
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              저장
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
