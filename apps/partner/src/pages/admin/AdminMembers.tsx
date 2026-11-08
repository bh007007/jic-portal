import { useState } from 'react';
import type { Member } from '../../auth';
import { useLoad } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

type Row = Member & { legacy_am_id: string | null; login_count: number; last_login_at: string | null; created_at: string };

// 12.1 지점 계정 목록 · 계정 정지
export default function AdminMembers() {
  const { data, error, reload } = useLoad(() => must<Row[]>(supabase.from('agency_members').select('*').order('agency_name')));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [kw, setKw] = useState('');
  if (!data) return <Loading error={error} />;
  const list = data.filter((m) => !kw || `${m.agency_name} ${m.branch ?? ''} ${m.email} ${m.contact_name ?? ''}`.toLowerCase().includes(kw.toLowerCase()));

  const update = async (m: Row, patch: Partial<Row>, done: string) => {
    const { error: e } = await supabase.from('agency_members').update(patch).eq('user_id', m.user_id);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: done });
    reload();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span>총 <strong>{data.length}</strong>개 지점</span>
        <input className="input" style={{ maxWidth: 260, height: 32, marginLeft: 'auto' }} placeholder="에이전시·지점·아이디 검색" aria-label="검색" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <Box>
        {list.length === 0 ? <p className="empty">지점 계정이 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th className="left">에이전시 · 지점</th><th>국가</th><th className="left">담당자</th><th className="left">아이디</th><th>업체 담당자 번호</th><th>접속</th><th>최근 접속</th><th>상태</th></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.user_id}>
                    <td className="left strong">{m.agency_name} {m.branch}</td>
                    <td>{m.country}</td>
                    <td className="left">{m.contact_name}<div className="muted" style={{ fontSize: 12 }}>{m.phone}</div></td>
                    <td className="left">{m.email}</td>
                    <td>
                      <input
                        className="input"
                        style={{ height: 28, width: 90 }}
                        aria-label="업체 포털 담당자 번호"
                        defaultValue={m.legacy_am_id ?? ''}
                        onBlur={(e) => e.target.value !== (m.legacy_am_id ?? '') && update(m, { legacy_am_id: e.target.value || null }, '업체 담당자 번호를 저장했습니다.')}
                      />
                    </td>
                    <td>{m.login_count}</td>
                    <td className="muted">{m.last_login_at?.slice(0, 10) ?? '-'}</td>
                    <td>
                      {m.status === 'active' ? (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => update(m, { status: 'suspended' }, `${m.agency_name} 계정을 정지했습니다.`)}>정지</button>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => update(m, { status: 'active' }, `${m.agency_name} 계정을 다시 열었습니다.`)}>정지 해제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>업체 담당자 번호는 관리자 앱 '담당자 계정'의 담당자번호입니다. 2차 My Students에서 지점 학생을 연결할 때 씁니다.</p>
    </>
  );
}
