import { useEffect, useState } from 'react';
import { useLoad } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

interface Setting { key: string; value: string; label: string | null }

// 견적·공실·등록·뉴스레터 주소와 등록 안내 문구. 포털에서 가격을 입력하는 곳은 없다.
export default function AdminSettings() {
  const { data, error, reload } = useLoad(() => must<Setting[]>(supabase.from('partner_settings').select('key,value,label').order('key')));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.map((s) => [s.key, s.value])));
  }, [data]);
  if (!data) return <Loading error={error} />;

  const save = async () => {
    const now = new Date().toISOString();
    const changed = data.filter((s) => (vals[s.key] ?? '') !== s.value).map((s) => ({ key: s.key, value: (vals[s.key] ?? '').trim(), label: s.label, updated_at: now }));
    if (changed.length === 0) return setMsg({ kind: 'ok', text: '바뀐 내용이 없습니다.' });
    const { error: e } = await supabase.from('partner_settings').upsert(changed);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: `${changed.length}개 항목을 저장했습니다.` });
    reload();
  };

  return (
    <Box title="링크·안내 설정" foot={<><span className="muted" style={{ fontSize: 12 }}>비워 두면 포털에 '주소 입력 전'으로 나옵니다.</span><button type="button" className="btn btn-primary" onClick={save}>저장</button></>}>
      <div className="box-body form">
        {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
        {data.map((s) => (
          <label key={s.key}>
            {s.label ?? s.key}
            {s.key === 'register_guide' ? (
              <textarea style={{ minHeight: 180 }} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
            ) : (
              <input type={s.key === 'contact_email' ? 'email' : 'url'} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
    </Box>
  );
}
