import { useState, type FormEvent } from 'react';
import type { Notice } from '../../../../partner/src/data';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';
import { CountryFields, countryText, orderText } from './CountryFields';

const EMPTY = { kind: 'notice' as Notice['kind'], tag: '안내', title: '', body: '', target: '', pinned: false, starts_on: '', ends_on: '', published: true, countries: [] as string[], country_order: {} as Record<string, number> };

/** 공지·프로모션(에이전시 포털 12.5): 작성, 상단 고정, 게시 기간. 11/10 에이전시 포털에서 옮겼다 */
export default function Notices() {
  const { data, error, reload } = useLoad(() => must<Notice[]>(db().from('partner_notices').select('*').order('created_at', { ascending: false })));
  const [edit, setEdit] = useState<number | null>(null);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState<Note>(null);
  if (!data) return <Loading error={error} />;

  const pick = (n: Notice) => {
    setEdit(n.id);
    setF({ kind: n.kind, tag: n.tag, title: n.title, body: n.body ?? '', target: n.target ?? '', pinned: n.pinned, starts_on: n.starts_on ?? '', ends_on: n.ends_on ?? '', published: n.published, countries: n.countries ?? [], country_order: n.country_order ?? {} });
    setMsg(null);
    window.scrollTo(0, 0);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...f, title: f.title.trim(), body: f.body || null, target: f.kind === 'promotion' ? f.target || null : null, starts_on: f.starts_on || null, ends_on: f.ends_on || null };
    const { error: e2 } = edit ? await db().from('partner_notices').update(body).eq('id', edit) : await db().from('partner_notices').insert(body);
    setMsg(e2 ? { ok: false, text: errText(e2) } : { ok: true, text: edit ? `'${body.title}'을(를) 고쳤습니다.` : `'${body.title}'을(를) ${body.published ? '게시했습니다' : '저장했습니다(게시 안 함)'}.` });
    if (!e2) {
      setEdit(null);
      setF(EMPTY);
      reload();
    }
  };
  const remove = async (n: Notice) => {
    if (!window.confirm(`'${n.title}'을(를) 지울까요? 되돌릴 수 없습니다. 내리기만 하려면 '게시'를 끄세요.`)) return;
    const { error: e } = await db().from('partner_notices').delete().eq('id', n.id);
    setMsg(e ? { ok: false, text: errText(e) } : { ok: true, text: `'${n.title}'을(를) 지웠습니다.` });
    reload();
  };

  return (
    <>
      <Panel title={edit ? '고치기' : '새로 쓰기'} extra={edit ? <button type="button" className="btn btn-xs" onClick={() => { setEdit(null); setF(EMPTY); }}>새로 쓰기로</button> : undefined}>
        <form className="edit" onSubmit={save}>
          <Status msg={msg} />
          <table className="kv">
            <tbody>
              <tr>
                <th><label htmlFor="n-kind">구분</label></th>
                <td>
                  <select id="n-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Notice['kind'] })}>
                    <option value="notice">공지</option>
                    <option value="promotion">프로모션</option>
                  </select>
                </td>
                <th><label htmlFor="n-tag">말머리</label></th>
                <td>
                  <select id="n-tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
                    {['중요', '변경', '안내'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th>게시 기간</th>
                <td colSpan={3}>
                  <input type="date" aria-label="게시 시작" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /> ~{' '}
                  <input type="date" aria-label="게시 끝" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
                  {f.kind === 'promotion' && <span className="hint">끝 날짜가 지나면 에이전시 화면에서 '지난 프로모션'으로 내려갑니다.</span>}
                </td>
              </tr>
              <tr>
                <th><label htmlFor="n-title">제목</label></th>
                <td colSpan={3}><input id="n-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} /></td>
              </tr>
              {f.kind === 'promotion' && (
                <tr>
                  <th><label htmlFor="n-target">대상</label></th>
                  <td colSpan={3}><input id="n-target" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="예: 12주 이상 신규 등록" style={{ width: '100%' }} /></td>
                </tr>
              )}
              <tr>
                <th><label htmlFor="n-body">내용</label></th>
                <td colSpan={3}><textarea id="n-body" style={{ minHeight: 160 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></td>
              </tr>
              <tr>
                <th>표시</th>
                <td colSpan={3}>
                  <label style={{ marginRight: 16 }}><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> 상단 고정</label>
                  <label><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> 게시</label>
                </td>
              </tr>
              {/* 국가별 콘텐츠(CL-036) */}
              <CountryFields countries={f.countries} order={f.country_order} onChange={(countries, country_order) => setF({ ...f, countries, country_order })} />
            </tbody>
          </table>
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn-primary">{edit ? '고치기' : f.published ? '게시' : '저장 (게시 안 함)'}</button>
          </div>
        </form>
      </Panel>
      <Panel title={<>목록 <small>({data.length}건)</small></>}>
        <div className="grid-box">
          <table className="tbl center">
            <thead><tr><th>구분</th><th>말머리</th><th className="left">제목</th><th>기간</th><th>노출 국가</th><th>고정</th><th>게시</th><th>작성일</th><th>관리</th></tr></thead>
            <tbody>
              {data.length === 0 && <tr className="empty"><td colSpan={9}>글이 없습니다.</td></tr>}
              {data.map((n) => (
                <tr key={n.id}>
                  <td className="nowrap">{n.kind === 'promotion' ? '프로모션' : '공지'}</td>
                  <td>{n.tag}</td>
                  <td className="left strong">{n.title}</td>
                  <td className="muted nowrap">{n.starts_on || n.ends_on ? `${n.starts_on ?? ''} ~ ${n.ends_on ?? ''}` : '-'}</td>
                  <td className="nowrap">{countryText(n.countries)}{orderText(n.country_order) && <div className="muted" style={{ fontSize: 12 }}>순서 {orderText(n.country_order)}</div>}</td>
                  <td>{n.pinned ? 'Y' : ''}</td>
                  <td className={n.published ? '' : 'muted'}>{n.published ? 'Y' : 'N'}</td>
                  <td className="muted nowrap">{n.created_at.slice(0, 10)}</td>
                  <td className="nowrap">
                    <button type="button" className="btn btn-xs" onClick={() => pick(n)}>고치기</button>{' '}
                    <button type="button" className="btn btn-xs text-red" onClick={() => remove(n)}>삭제</button>
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
