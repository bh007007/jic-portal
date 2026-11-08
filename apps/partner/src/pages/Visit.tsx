import { useState, type FormEvent } from 'react';
import { today, useLoad } from '../data';
import { t } from '../i18n';
import { errText, must, supabase } from '../supabase';
import { Box, Loading, Msg, PageHead } from '../ui';

interface VisitRow {
  id: number;
  visit_date: string;
  people: number;
  purpose: string;
  status: string;
  staff_note: string | null;
  created_at: string;
}

export const VISIT_STATUS: Record<string, string> = { received: '접수', confirmed: '확정', done: '방문 완료', cancelled: '취소' };

// 11.1 방문 신청
export default function Visit() {
  const list = useLoad(() => must<VisitRow[]>(supabase.from('visit_requests').select('*').order('created_at', { ascending: false })));
  const [f, setF] = useState({ visit_date: '', people: '2', purpose: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('visit_requests').insert({ visit_date: f.visit_date, people: Number(f.people), purpose: f.purpose.trim() });
    setBusy(false);
    if (error) return setMsg({ kind: 'err', text: errText(error) });
    setMsg({ kind: 'ok', text: '방문 신청을 접수했습니다. JIC 담당자가 확인 후 안내합니다.' });
    setF({ visit_date: '', people: '2', purpose: '' });
    list.reload();
  };

  return (
    <>
      <PageHead title={t('nav.visit')} />
      <div className="row">
        <Box title="신청" className="grow-2">
          <form className="form box-body" onSubmit={submit}>
            <div className="form-grid">
              <label>희망 날짜<input type="date" required min={today()} value={f.visit_date} onChange={(e) => setF({ ...f, visit_date: e.target.value })} /></label>
              <label>인원<input type="number" required min={1} max={50} value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} /></label>
            </div>
            <label>방문 목적<textarea required value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="예: 캠퍼스 시설 확인, 담당자 미팅" /></label>
            {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
            <div className="form-actions"><button type="submit" className="btn btn-primary btn-lg" disabled={busy}>신청</button></div>
          </form>
        </Box>
        <Box title="내 신청 내역" className="grow-3">
          {!list.data ? <Loading error={list.error} /> : list.data.length === 0 ? <p className="empty">신청 내역이 없습니다.</p> : (
            <div className="box-body scroll">
              <table className="tbl center">
                <thead><tr><th>희망 날짜</th><th>인원</th><th className="left">목적</th><th>상태</th><th className="left">안내</th></tr></thead>
                <tbody>
                  {list.data.map((v) => (
                    <tr key={v.id}>
                      <td>{v.visit_date}</td>
                      <td>{v.people}</td>
                      <td className="left pre">{v.purpose}</td>
                      <td className={v.status === 'confirmed' ? 'text-green strong' : v.status === 'cancelled' ? 'muted' : ''}>{VISIT_STATUS[v.status] ?? v.status}</td>
                      <td className="left pre">{v.staff_note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
      </div>
    </>
  );
}
