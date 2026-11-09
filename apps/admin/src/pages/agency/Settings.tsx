import { useEffect, useState } from 'react';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';

interface Setting { key: string; value: string; label: string | null }

/** 링크·안내 설정(에이전시 포털): 견적·공실·등록·뉴스레터 주소와 등록 안내 문구. 포털에서 가격을 입력하는 곳은 없다. 11/10 에이전시 포털에서 옮겼다 */
export default function Settings() {
  const { data, error, reload } = useLoad(() => must<Setting[]>(db().from('partner_settings').select('key,value,label').order('key')));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Note>(null);
  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.map((s) => [s.key, s.value])));
  }, [data]);
  if (!data) return <Loading error={error} />;

  const save = async () => {
    const now = new Date().toISOString();
    const changed = data.filter((s) => (vals[s.key] ?? '') !== s.value).map((s) => ({ key: s.key, value: (vals[s.key] ?? '').trim(), label: s.label, updated_at: now }));
    if (changed.length === 0) return setMsg({ ok: true, text: '바뀐 내용이 없습니다.' });
    const { error: e } = await db().from('partner_settings').upsert(changed);
    setMsg(e ? { ok: false, text: errText(e) } : { ok: true, text: `${changed.length}개 항목을 저장했습니다.` });
    reload();
  };

  return (
    <Panel title="링크 · 안내 설정">
      <div className="edit">
        <Status msg={msg} />
        <table className="kv">
          <tbody>
            {data.length === 0 && <tr><td className="muted">설정 항목이 없습니다.</td></tr>}
            {data.map((s) => (
              <tr key={s.key}>
                <th><label htmlFor={`s-${s.key}`}>{s.label ?? s.key}</label></th>
                <td>
                  {s.key === 'register_guide' ? (
                    <textarea id={`s-${s.key}`} style={{ minHeight: 180 }} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
                  ) : (
                    <input id={`s-${s.key}`} type={s.key === 'contact_email' ? 'email' : 'url'} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} style={{ width: '100%' }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-actions">
          <span className="muted" style={{ fontSize: 12 }}>비워 두면 에이전시 포털에 '주소 입력 전'으로 나옵니다.</span>
          <button type="button" className="btn btn-primary" onClick={save}>저장</button>
        </div>
      </div>
    </Panel>
  );
}
