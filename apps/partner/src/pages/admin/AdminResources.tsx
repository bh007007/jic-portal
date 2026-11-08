import { useState, type FormEvent } from 'react';
import { fmtSize, today, useLoad, type Resource } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';
import { RESOURCE_CATEGORIES } from '../Resources';

const BUCKET = 'partner-resources';

// 12.4 자료실 관리: 파일 업로드 또는 링크. 업데이트 날짜로 New·Updated 표시가 붙는다.
export default function AdminResources() {
  const { data, error, reload } = useLoad(() => must<Resource[]>(supabase.from('partner_resources').select('*').order('updated_on', { ascending: false })));
  const [f, setF] = useState({ category: RESOURCE_CATEGORIES[0], title: '', description: '', link_url: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!data) return <Loading error={error} />;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!file && !f.link_url.trim()) return setMsg({ kind: 'err', text: '파일을 고르거나 링크를 넣으세요.' });
    setBusy(true);
    try {
      let file_path: string | null = null;
      if (file) {
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
        file_path = `${today()}/${crypto.randomUUID()}${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || undefined });
        if (up.error) throw up.error;
      }
      const { error: e2 } = await supabase.from('partner_resources').insert({
        category: f.category,
        title: f.title.trim(),
        description: f.description || null,
        link_url: file ? null : f.link_url.trim(),
        file_path,
        file_name: file?.name ?? null,
        file_size: file?.size ?? null,
      });
      if (e2) throw e2;
      setMsg({ kind: 'ok', text: '올렸습니다.' });
      setF({ ...f, title: '', description: '', link_url: '' });
      setFile(null);
      reload();
    } catch (err) {
      setMsg({ kind: 'err', text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const replace = async (r: Resource, nf: File) => {
    const path = r.file_path ?? `${today()}/${crypto.randomUUID()}`;
    const up = await supabase.storage.from(BUCKET).upload(path, nf, { upsert: true, contentType: nf.type || undefined });
    if (up.error) return setMsg({ kind: 'err', text: errText(up.error) });
    const { error: e } = await supabase.from('partner_resources').update({ file_path: path, file_name: nf.name, file_size: nf.size, updated_on: today() }).eq('id', r.id);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: `'${r.title}' 파일을 바꿨습니다(Updated 표시).` });
    reload();
  };

  const remove = async (r: Resource) => {
    if (!window.confirm(`'${r.title}' 자료를 지울까요? 되돌릴 수 없습니다.`)) return;
    if (r.file_path) await supabase.storage.from(BUCKET).remove([r.file_path]);
    const { error: e } = await supabase.from('partner_resources').delete().eq('id', r.id);
    setMsg(e ? { kind: 'err', text: errText(e) } : { kind: 'ok', text: '지웠습니다.' });
    reload();
  };

  return (
    <>
      <Box title="자료 올리기">
        <form className="form box-body" onSubmit={add}>
          <div className="form-grid">
            <label>
              분류
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>제목<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          </div>
          <label>설명 (선택)<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="form-grid">
            <label>파일<input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            <label>또는 링크 (영상·드라이브)<input type="url" value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} disabled={!!file} /></label>
          </div>
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button></div>
        </form>
      </Box>
      <Box title={`자료 (${data.length})`}>
        {data.length === 0 ? <p className="empty">자료가 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>분류</th><th className="left">제목</th><th>파일·링크</th><th>업데이트</th><th>관리</th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{r.category}</td>
                    <td className="left strong">{r.title}</td>
                    <td className="muted">{r.link_url ? '링크' : `${r.file_name ?? ''} ${fmtSize(r.file_size)}`}</td>
                    <td>{r.updated_on}</td>
                    <td className="nowrap">
                      {r.file_path && (
                        <label className="btn btn-sm" style={{ marginRight: 4 }}>
                          파일 교체
                          <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && replace(r, e.target.files[0])} />
                        </label>
                      )}
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r)}>삭제</button>
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
