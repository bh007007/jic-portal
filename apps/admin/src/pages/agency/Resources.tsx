import { useState, type FormEvent } from 'react';
import type { Resource } from '../../../../partner/src/data';
import { fmtSize, RESOURCE_BUCKET, RESOURCE_CATEGORIES, today } from '../../../../partner/src/shared';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';

/**
 * 자료실(에이전시 포털 12.4): 파일 올리기(저장소 버킷 partner-resources) 또는 링크. 업데이트 날짜로 에이전시 화면에 New·Updated 표시가 붙는다.
 * 11/10 에이전시 포털에서 옮겼다. 버킷 권한은 직원만 쓰기(20261107010000_partner_portal.sql)라 관리자 포털 로그인으로 그대로 올린다.
 */
export default function Resources() {
  const { data, error, reload } = useLoad(() => must<Resource[]>(db().from('partner_resources').select('*').order('updated_on', { ascending: false })));
  const [f, setF] = useState({ category: RESOURCE_CATEGORIES[0], title: '', description: '', link_url: '' });
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>(null);
  if (!data) return <Loading error={error} />;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!file && !f.link_url.trim()) return setMsg({ ok: false, text: '파일을 고르거나 링크를 넣으세요.' });
    setBusy(true);
    try {
      let file_path: string | null = null;
      if (file) {
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
        file_path = `${today()}/${crypto.randomUUID()}${ext}`;
        const up = await db().storage.from(RESOURCE_BUCKET).upload(file_path, file, { contentType: file.type || undefined });
        if (up.error) throw up.error;
      }
      const { error: e2 } = await db().from('partner_resources').insert({
        category: f.category,
        title: f.title.trim(),
        description: f.description || null,
        link_url: file ? null : f.link_url.trim(),
        file_path,
        file_name: file?.name ?? null,
        file_size: file?.size ?? null,
      });
      if (e2) throw e2;
      setMsg({ ok: true, text: `'${f.title.trim()}'을(를) 올렸습니다.` });
      setF({ ...f, title: '', description: '', link_url: '' });
      setFile(null);
      setFileKey((k) => k + 1);
      reload();
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const replace = async (r: Resource, nf: File) => {
    const path = r.file_path ?? `${today()}/${crypto.randomUUID()}`;
    const up = await db().storage.from(RESOURCE_BUCKET).upload(path, nf, { upsert: true, contentType: nf.type || undefined });
    if (up.error) return setMsg({ ok: false, text: errText(up.error) });
    const { error: e } = await db().from('partner_resources').update({ file_path: path, file_name: nf.name, file_size: nf.size, updated_on: today() }).eq('id', r.id);
    setMsg(e ? { ok: false, text: errText(e) } : { ok: true, text: `'${r.title}' 파일을 바꿨습니다(Updated 표시).` });
    reload();
  };

  const remove = async (r: Resource) => {
    if (!window.confirm(`'${r.title}' 자료를 지울까요? 되돌릴 수 없습니다.`)) return;
    if (r.file_path) await db().storage.from(RESOURCE_BUCKET).remove([r.file_path]);
    const { error: e } = await db().from('partner_resources').delete().eq('id', r.id);
    setMsg(e ? { ok: false, text: errText(e) } : { ok: true, text: `'${r.title}'을(를) 지웠습니다.` });
    reload();
  };

  return (
    <>
      <Panel title="자료 올리기">
        <form className="edit" onSubmit={add}>
          <Status msg={msg} />
          <table className="kv">
            <tbody>
              <tr>
                <th><label htmlFor="r-cat">분류</label></th>
                <td>
                  <select id="r-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                    {RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <th><label htmlFor="r-title">제목</label></th>
                <td><input id="r-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th><label htmlFor="r-desc">설명 (선택)</label></th>
                <td colSpan={3}><input id="r-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th><label htmlFor="r-file">파일</label></th>
                <td><input key={fileKey} id="r-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></td>
                <th><label htmlFor="r-link">또는 링크</label></th>
                <td><input id="r-link" type="url" placeholder="영상·드라이브 주소" value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} disabled={!!file} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
          </div>
        </form>
      </Panel>
      <Panel title={<>자료 <small>({data.length}개)</small></>}>
        <div className="grid-box">
          <table className="tbl center">
            <thead><tr><th>분류</th><th className="left">제목</th><th>파일 · 링크</th><th>업데이트</th><th>관리</th></tr></thead>
            <tbody>
              {data.length === 0 && <tr className="empty"><td colSpan={5}>자료가 없습니다.</td></tr>}
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="muted nowrap">{r.category}</td>
                  <td className="left strong">{r.title}{r.description && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{r.description}</div>}</td>
                  <td className="muted">{r.link_url ? '링크' : `${r.file_name ?? ''} ${fmtSize(r.file_size)}`}</td>
                  <td className="nowrap">{r.updated_on}</td>
                  <td className="nowrap">
                    {r.file_path && (
                      <label className="btn btn-xs" style={{ marginRight: 4 }}>
                        파일 교체
                        <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && replace(r, e.target.files[0])} />
                      </label>
                    )}
                    <button type="button" className="btn btn-xs text-red" onClick={() => remove(r)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
