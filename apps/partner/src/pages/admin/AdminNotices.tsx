import { useState, type FormEvent } from 'react';
import { useLoad, type Notice } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

const EMPTY = { kind: 'notice' as Notice['kind'], tag: '안내', title: '', body: '', target: '', pinned: false, starts_on: '', ends_on: '', published: true };

// 12.5 공지·프로모션 관리: 작성, 상단 고정, 게시 기간
export default function AdminNotices() {
  const { data, error, reload } = useLoad(() => must<Notice[]>(supabase.from('partner_notices').select('*').order('created_at', { ascending: false })));
  const [edit, setEdit] = useState<number | null>(null);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!data) return <Loading error={error} />;

  const pick = (n: Notice) => {
    setEdit(n.id);
    setF({ kind: n.kind, tag: n.tag, title: n.title, body: n.body ?? '', target: n.target ?? '', pinned: n.pinned, starts_on: n.starts_on ?? '', ends_on: n.ends_on ?? '', published: n.published });
    window.scrollTo(0, 0);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...f, title: f.title.trim(), body: f.body || null, target: f.target || null, starts_on: f.starts_on || null, ends_on: f.ends_on || null };
    const { error: e2 } = edit ? await supabase.from('partner_notices').update(body).eq('id', edit) : await supabase.from('partner_notices').insert(body);
    setMsg(e2 ? { kind: 'err', text: errText(e2) } : { kind: 'ok', text: edit ? '고쳤습니다.' : '게시했습니다.' });
    if (!e2) {
      setEdit(null);
      setF(EMPTY);
      reload();
    }
  };
  const remove = async (n: Notice) => {
    if (!window.confirm(`'${n.title}'을(를) 지울까요? 되돌릴 수 없습니다. 내리기만 하려면 '게시'를 끄세요.`)) return;
    const { error: e } = await supabase.from('partner_notices').delete().eq('id', n.id);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: '지웠습니다.' });
    reload();
  };

  return (
    <>
      <Box title={edit ? '고치기' : '새로 쓰기'} extra={edit ? <button type="button" className="btn btn-sm" onClick={() => { setEdit(null); setF(EMPTY); }}>새로 쓰기로</button> : undefined}>
        <form className="form box-body" onSubmit={save}>
          <div className="form-grid">
            <label>
              구분
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Notice['kind'] })}>
                <option value="notice">공지</option>
                <option value="promotion">프로모션</option>
              </select>
            </label>
            <label>
              말머리
              <select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
                {['중요', '변경', '안내'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>게시 시작<input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></label>
            <label>게시 끝 {f.kind === 'promotion' && <span className="hint">(지나면 지난 프로모션으로)</span>}<input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></label>
          </div>
          <label>제목<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          {f.kind === 'promotion' && <label>대상<input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="예: 12주 이상 신규 등록" /></label>}
          <label>내용<textarea style={{ minHeight: 160 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto', height: 'auto' }} checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />상단 고정</label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto', height: 'auto' }} checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />게시</label>
          </div>
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          <div className="form-actions"><button type="submit" className="btn btn-primary">{edit ? '고치기' : '게시'}</button></div>
        </form>
      </Box>
      <Box title={`목록 (${data.length})`}>
        {data.length === 0 ? <p className="empty">글이 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>구분</th><th>말머리</th><th className="left">제목</th><th>기간</th><th>고정</th><th>게시</th><th>작성일</th><th>관리</th></tr></thead>
              <tbody>
                {data.map((n) => (
                  <tr key={n.id}>
                    <td>{n.kind === 'promotion' ? '프로모션' : '공지'}</td>
                    <td>{n.tag}</td>
                    <td className="left strong">{n.title}</td>
                    <td className="muted">{n.starts_on || n.ends_on ? `${n.starts_on ?? ''} ~ ${n.ends_on ?? ''}` : '-'}</td>
                    <td>{n.pinned ? 'Y' : ''}</td>
                    <td className={n.published ? '' : 'muted'}>{n.published ? 'Y' : 'N'}</td>
                    <td className="muted">{n.created_at.slice(0, 10)}</td>
                    <td className="nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => pick(n)}>고치기</button>{' '}
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(n)}>삭제</button>
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
