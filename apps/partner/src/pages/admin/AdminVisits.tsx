import { useState } from 'react';
import { useLoad } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';
import { VISIT_STATUS } from '../Visit';

interface Row {
  id: number;
  visit_date: string;
  people: number;
  purpose: string;
  status: string;
  staff_note: string | null;
  created_at: string;
  agency_members: { agency_name: string; branch: string | null; contact_name: string | null; phone: string | null; email: string } | null;
}

// 12.6 방문 신청 확인 (신청을 받는 담당자와 안내 방식은 결정 대기: 지금은 이 화면의 '안내' 칸이 에이전시 화면에 보인다)
export default function AdminVisits() {
  const { data, error, reload } = useLoad(() =>
    must<Row[]>(supabase.from('visit_requests').select('*, agency_members(agency_name, branch, contact_name, phone, email)').order('visit_date', { ascending: true })),
  );
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!data) return <Loading error={error} />;

  const update = async (v: Row, status: string) => {
    const { error: e } = await supabase.from('visit_requests').update({ status, staff_note: notes[v.id] ?? v.staff_note }).eq('id', v.id);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: `${v.agency_members?.agency_name ?? ''} ${v.visit_date} — ${VISIT_STATUS[status]}` });
    reload();
  };

  return (
    <>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <Box title={`방문 신청 (${data.length})`}>
        {data.length === 0 ? <p className="empty">방문 신청이 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>희망 날짜</th><th className="left">에이전시 · 지점</th><th className="left">담당자</th><th>인원</th><th className="left">목적</th><th>상태</th><th className="left">안내 (에이전시에 보임)</th><th>처리</th></tr></thead>
              <tbody>
                {data.map((v) => (
                  <tr key={v.id}>
                    <td className="strong">{v.visit_date}</td>
                    <td className="left">{v.agency_members?.agency_name} {v.agency_members?.branch}</td>
                    <td className="left">{v.agency_members?.contact_name}<div className="muted" style={{ fontSize: 12 }}>{v.agency_members?.phone || v.agency_members?.email}</div></td>
                    <td>{v.people}</td>
                    <td className="left pre" style={{ maxWidth: 260 }}>{v.purpose}</td>
                    <td>{VISIT_STATUS[v.status] ?? v.status}</td>
                    <td className="left"><input className="input" style={{ height: 30, minWidth: 160 }} aria-label="안내" defaultValue={v.staff_note ?? ''} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} /></td>
                    <td className="nowrap">
                      {(['confirmed', 'done', 'cancelled'] as const).map((s) => (
                        <button key={s} type="button" className={'btn btn-sm' + (v.status === s ? ' btn-primary' : '')} style={{ marginRight: 4 }} onClick={() => update(v, s)}>{VISIT_STATUS[s]}</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
