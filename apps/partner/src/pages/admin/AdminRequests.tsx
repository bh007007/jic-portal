import { useState } from 'react';
import { useLoad } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

interface Req {
  id: number;
  email: string;
  agency_name: string;
  branch: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const LABEL = { pending: '대기', approved: '승인', rejected: '반려' };

// 12.1 계정 승인
export default function AdminRequests() {
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const { data, error, reload } = useLoad(() => must<Req[]>(supabase.from('agency_requests').select('*').order('created_at', { ascending: false })));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!data) return <Loading error={error} />;
  const list = data.filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'));

  const decide = async (r: Req, approve: boolean) => {
    const { error: e } = await supabase.rpc('approve_agency_request', { p_request_id: r.id, p_approve: approve, p_note: notes[r.id] || null });
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: `${r.agency_name} ${r.branch ?? ''} — ${approve ? '승인' : '반려'}했습니다.` });
    reload();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={'btn' + (tab === 'pending' ? ' btn-primary' : '')} onClick={() => setTab('pending')}>대기 ({data.filter((r) => r.status === 'pending').length})</button>
        <button type="button" className={'btn' + (tab === 'done' ? ' btn-primary' : '')} onClick={() => setTab('done')}>처리 완료</button>
      </div>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <Box>
        {list.length === 0 ? <p className="empty">{tab === 'pending' ? '대기 중인 신청이 없습니다.' : '처리한 신청이 없습니다.'}</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead>
                <tr><th>신청일</th><th className="left">에이전시 · 지점</th><th>국가</th><th className="left">담당자</th><th className="left">아이디</th><th className="left">남길 말</th><th className="left">메모</th><th>{tab === 'pending' ? '처리' : '결과'}</th></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.created_at.slice(0, 10)}</td>
                    <td className="left strong">{r.agency_name} {r.branch}</td>
                    <td>{r.country}</td>
                    <td className="left">{r.contact_name}<div className="muted" style={{ fontSize: 12 }}>{r.phone}</div></td>
                    <td className="left">{r.email}</td>
                    <td className="left pre" style={{ maxWidth: 240 }}>{r.message}</td>
                    <td className="left">
                      {tab === 'pending' ? (
                        <input className="input" style={{ height: 30, minWidth: 140 }} aria-label="관리자 메모" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                      ) : <span className="pre">{r.review_note}</span>}
                    </td>
                    <td className="nowrap">
                      {tab === 'pending' ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => decide(r, true)}>승인</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => decide(r, false)}>반려</button>
                        </div>
                      ) : (
                        <span className={r.status === 'approved' ? 'text-green' : 'text-red'}>{LABEL[r.status]} {r.reviewed_at?.slice(0, 10)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>신청자는 이메일 인증을 마쳐야 로그인할 수 있습니다. 승인하면 바로 포털을 쓸 수 있습니다.</p>
    </>
  );
}
