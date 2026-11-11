import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from 'react';
import {
  CAMPUS_LABEL, I18N_LANGS, KINDS, MEDIA_BUCKET, PHOTO_MAX_WIDTH, PLACEMENTS, STATUS_LABEL, placementLabel, type ContentItem,
} from '../../../../partner/src/contentKinds';
import { guessFromName } from '../../../../partner/src/photoGuess';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';
import { CountryFields, countryText } from './CountryFields';

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜
const CAMPUSES = KINDS.photo.campuses ?? [];
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const typeOf = (f: File) => f.type || TYPES[(f.name.split('.').pop() ?? '').toLowerCase()] || '';
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const focusOf = (it: Pick<ContentItem, 'data'>): [number, number] => {
  const f = it.data?.focus;
  return Array.isArray(f) && f.length === 2 ? [num(f[0], 0.5), num(f[1], 0.5)] : [0.5, 0.5];
};
const pos = (f: [number, number]) => `${Math.round(f[0] * 100)}% ${Math.round(f[1] * 100)}%`;
const pathOf = (it: ContentItem) => (typeof it.data?.path === 'string' ? it.data.path : '');

/** 가로가 1600px보다 크면 줄인다(명세 4.4). PNG는 PNG로(투명 유지), 나머지는 JPEG */
async function shrink(file: File, type: string): Promise<{ blob: Blob; type: string; width: number; height: number; shrunk: boolean }> {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  if (width <= PHOTO_MAX_WIDTH) {
    bmp.close();
    // 파일 형식이 비어 있으면(드물게) 저장소가 거절하니 형식을 붙인다
    return { blob: file.type === type ? file : new Blob([file], { type }), type, width, height, shrunk: false };
  }
  const w = PHOTO_MAX_WIDTH;
  const h = Math.round((height * w) / width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('사진을 줄이지 못했습니다'))), out, 0.86));
  return { blob, type: out, width: w, height: h, shrunk: true };
}

type Row = { name: string; state: string; ok?: boolean };

/**
 * 파트너 포털 관리 › 사진·영상 › 사진 보관함(CL-047, 화면 명세 4.4).
 * 여러 장 끌어다 놓기 → 가로 1600px로 줄여 비공개 저장소(partner-media)에 올리고, 사진마다 화면 위치·캠퍼스·코스·순서·공개 상태·중심점·설명·노출 국가를 둔다.
 * 사진도 화면 콘텐츠 표(partner_content_items, 종류 photo)라 공통 칸(CL-054)을 같이 쓴다. 새로 올린 사진은 '초안'이고, 게시해야 에이전시 화면에 나온다.
 * '파일 이름으로 자동 분류'는 시제품 콘텐츠 묶음(11/11)의 파일 이름으로 화면 위치를 미리 고른다(photoGuess.ts).
 */
export default function Photos() {
  const { data, error, reload } = useLoad(() =>
    must<ContentItem[]>(db().from('partner_content_items').select('*').eq('kind', 'photo').order('sort').order('updated_at', { ascending: false })),
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Note>(null);
  // 올리기 기본값
  const [up, setUp] = useState({ placement: '', campus: '', guess: true });
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 목록 거르기·고르기
  const [fl, setFl] = useState({ placement: '', campus: '', status: '' });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<ContentItem | null>(null);

  // 미리보기는 서명 주소(1시간)
  useEffect(() => {
    const paths = (data ?? []).map(pathOf).filter((p) => p && !urls[p]);
    if (!paths.length) return;
    db().storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600).then(({ data: signed }) => {
      if (!signed) return;
      const add: Record<string, string> = {};
      for (const s of signed) if (s.signedUrl && s.path) add[s.path] = s.signedUrl;
      setUrls((u) => ({ ...u, ...add }));
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loading error={error} />;

  const upload = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    setMsg(null);
    const log: Row[] = files.map((f) => ({ name: f.name, state: '기다림' }));
    setRows([...log]);
    const set = (i: number, r: Partial<Row>) => {
      log[i] = { ...log[i], ...r };
      setRows([...log]);
    };
    let done = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const g = up.guess ? guessFromName(file.name) : null;
      if (g?.skip) { set(i, { state: `건너뜀: ${g.skip}` }); continue; }
      const type = typeOf(file);
      if (!TYPES[(file.name.split('.').pop() ?? '').toLowerCase()] && !Object.values(TYPES).includes(type)) { set(i, { state: '건너뜀: 사진(jpg·png·webp)이 아닙니다' }); continue; }
      try {
        set(i, { state: '줄이는 중' });
        const s = await shrink(file, type);
        const ext = s.type === 'image/png' ? 'png' : s.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `photos/${today().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
        set(i, { state: '올리는 중' });
        const { error: e1 } = await db().storage.from(MEDIA_BUCKET).upload(path, s.blob, { contentType: s.type, upsert: false });
        if (e1) throw e1;
        const row = {
          kind: 'photo',
          campus: g?.campus || up.campus,
          title: g?.caption ?? '',
          status: 'draft',
          sort: g?.sort ?? 0,
          updated_on: today(),
          data: { path, placement: g?.placement || up.placement, focus: [0.5, 0.5], width: s.width, height: s.height, size: s.blob.size, file_name: file.name },
        };
        const { error: e2 } = await db().from('partner_content_items').insert(row);
        if (e2) {
          await db().storage.from(MEDIA_BUCKET).remove([path]);
          throw e2;
        }
        done++;
        set(i, { state: `올림 · ${row.data.placement ? placementLabel(row.data.placement) : '화면 위치 고르기 전'}${s.shrunk ? ` · 가로 ${PHOTO_MAX_WIDTH}px로 줄임` : ''}`, ok: true });
      } catch (e) {
        set(i, { state: `실패: ${errText(e)}`, ok: false });
      }
    }
    setBusy(false);
    setMsg({ ok: done > 0, text: `${done}장을 올렸습니다(초안). 확인한 뒤 '게시'하면 에이전시 화면에 나옵니다.` });
    reload();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    upload([...e.dataTransfer.files]);
  };

  // 순서 칸(작은 수 먼저) → 최근에 고친 것 먼저
  const list = [...data].sort((a, b) => a.sort - b.sort || b.updated_at.localeCompare(a.updated_at)).filter((it) => (!fl.placement || it.data?.placement === fl.placement || (fl.placement === '-' && !it.data?.placement)) && (!fl.campus || it.campus === fl.campus) && (!fl.status || it.status === fl.status));
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const chosen = data.filter((it) => sel.has(it.id));
  const bulk = async (patch: Partial<ContentItem> | 'delete') => {
    if (!chosen.length) return;
    if (patch === 'delete') {
      if (!window.confirm(`사진 ${chosen.length}장을 지울까요? 파일도 지워지고 되돌릴 수 없습니다. 내리기만 하려면 '숨김'을 쓰세요.`)) return;
      const { error: e1 } = await db().from('partner_content_items').delete().in('id', chosen.map((c) => c.id));
      if (!e1) await db().storage.from(MEDIA_BUCKET).remove(chosen.map(pathOf).filter(Boolean));
      setMsg(e1 ? { ok: false, text: errText(e1) } : { ok: true, text: `${chosen.length}장을 지웠습니다.` });
    } else {
      const { error: e1 } = await db().from('partner_content_items').update(patch).in('id', chosen.map((c) => c.id));
      setMsg(e1 ? { ok: false, text: errText(e1) } : { ok: true, text: `${chosen.length}장을 바꿨습니다.` });
    }
    setSel(new Set());
    reload();
  };
  const movePlacement = async (placement: string) => {
    if (!placement || !chosen.length) return;
    const results = await Promise.all(chosen.map((c) => db().from('partner_content_items').update({ data: { ...c.data, placement } }).eq('id', c.id)));
    const bad = results.find((r) => r.error);
    setMsg(bad ? { ok: false, text: errText(bad.error) } : { ok: true, text: `${chosen.length}장의 화면 위치를 '${placementLabel(placement)}'(으)로 바꿨습니다.` });
    setSel(new Set());
    reload();
  };

  return (
    <>
      <Panel title="사진 올리기">
        <div className="edit">
          <Status msg={msg} />
          <table className="kv">
            <tbody>
              <tr>
                <th>화면 위치</th>
                <td>
                  <select value={up.placement} onChange={(e) => setUp({ ...up, placement: e.target.value })}>
                    <option value="">나중에 고르기</option>
                    {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  {up.placement && <span className="hint">{PLACEMENTS.find((p) => p.key === up.placement)?.where}</span>}
                </td>
                <th>캠퍼스</th>
                <td>
                  <select value={up.campus} onChange={(e) => setUp({ ...up, campus: e.target.value })}>
                    <option value="">{CAMPUS_LABEL['']}</option>
                    {CAMPUSES.map((c) => <option key={c} value={c}>{CAMPUS_LABEL[c]}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th>자동 분류</th>
                <td colSpan={3}>
                  <label><input type="checkbox" checked={up.guess} onChange={(e) => setUp({ ...up, guess: e.target.checked })} /> 파일 이름으로 화면 위치·캠퍼스·순서 고르기(시제품 콘텐츠 묶음)</label>
                  <span className="hint">맞는 이름이 아니면 위에서 고른 값을 씁니다. 학비표 이미지·서약서·영상 표지는 건너뜁니다.</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div
            className={'drop-zone' + (over ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          >
            {busy ? '올리는 중…' : `사진을 여기에 끌어다 놓거나 눌러서 고르세요(여러 장). 가로 ${PHOTO_MAX_WIDTH}px보다 크면 줄여서 올립니다.`}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </div>
          {rows.length > 0 && (
            <ul className="upload-log">
              {rows.map((r, i) => <li key={i} className={r.ok === false ? 'text-red' : r.ok ? '' : 'muted'}><span>{r.name}</span> <span>{r.state}</span></li>)}
            </ul>
          )}
        </div>
      </Panel>

      {edit && <PhotoEdit key={edit.id} it={edit} url={urls[pathOf(edit)]} onClose={() => setEdit(null)} onSaved={(text) => { setEdit(null); setMsg({ ok: true, text }); reload(); }} />}

      <Panel title={<>사진 보관함 <small>({list.length} / {data.length}장)</small></>}>
        <div className="toolbar photo-toolbar">
          <select aria-label="화면 위치" value={fl.placement} onChange={(e) => setFl({ ...fl, placement: e.target.value })}>
            <option value="">모든 화면 위치</option>
            <option value="-">화면 위치 고르기 전</option>
            {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select aria-label="캠퍼스" value={fl.campus} onChange={(e) => setFl({ ...fl, campus: e.target.value })}>
            <option value="">모든 캠퍼스</option>
            {CAMPUSES.map((c) => <option key={c} value={c}>{CAMPUS_LABEL[c]}</option>)}
          </select>
          <select aria-label="공개 상태" value={fl.status} onChange={(e) => setFl({ ...fl, status: e.target.value })}>
            <option value="">모든 상태</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span style={{ marginLeft: 'auto' }} />
          {chosen.length > 0 && (
            <>
              <strong>{chosen.length}장 고름</strong>
              <button type="button" className="btn btn-xs btn-primary" onClick={() => bulk({ status: 'published' })}>게시</button>
              <button type="button" className="btn btn-xs" onClick={() => bulk({ status: 'hidden' })}>숨김</button>
              <button type="button" className="btn btn-xs" onClick={() => bulk({ status: 'draft' })}>초안</button>
              <select aria-label="화면 위치 바꾸기" value="" onChange={(e) => movePlacement(e.target.value)}>
                <option value="">화면 위치 바꾸기…</option>
                {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <button type="button" className="btn btn-xs text-red" onClick={() => bulk('delete')}>삭제</button>
              <button type="button" className="btn btn-xs" onClick={() => setSel(new Set())}>고르기 취소</button>
            </>
          )}
          {chosen.length === 0 && list.length > 0 && <button type="button" className="btn btn-xs" onClick={() => setSel(new Set(list.map((it) => it.id)))}>보이는 사진 모두 고르기</button>}
        </div>
        {list.length === 0 ? (
          <p className="state-msg" style={{ margin: 0 }}>{data.length ? '고른 조건에 맞는 사진이 없습니다.' : '아직 사진이 없습니다. 위에서 올리세요.'}</p>
        ) : (
          <div className="photo-grid">
            {list.map((it) => {
              const url = urls[pathOf(it)];
              const placement = typeof it.data?.placement === 'string' ? it.data.placement : '';
              return (
                <div key={it.id} className={'photo-card' + (sel.has(it.id) ? ' on' : '') + (it.status === 'published' ? '' : ' dim')}>
                  <label className="pick"><input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} aria-label={`${it.title || '사진'} 고르기`} /></label>
                  <button type="button" className="thumb" onClick={() => setEdit(it)} title="고치기">
                    {url ? <img src={url} alt={it.title} style={{ objectPosition: pos(focusOf(it)) }} loading="lazy" /> : <span className="muted">불러오는 중</span>}
                  </button>
                  <div className="meta">
                    <strong className={placement ? '' : 'text-red'}>{placement ? placementLabel(placement) : '화면 위치 고르기 전'}</strong>
                    <span>{CAMPUS_LABEL[it.campus] ?? it.campus} · {STATUS_LABEL[it.status]} · 순서 {it.sort}</span>
                    {it.title && <span className="muted">{it.title}</span>}
                    {it.countries?.length > 0 && <span className="muted">{countryText(it.countries)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}

/** 사진 한 장 고치기: 화면 위치·캠퍼스·코스·순서·상태·설명(언어별)·노출 국가·업데이트일, 사진을 눌러 중심점 */
function PhotoEdit({ it, url, onClose, onSaved }: { it: ContentItem; url?: string; onClose: () => void; onSaved: (text: string) => void }) {
  const [f, setF] = useState({
    title: it.title, campus: it.campus, status: it.status, sort: it.sort, countries: it.countries ?? [], country_order: it.country_order ?? {},
    i18n: it.i18n ?? {}, updated_on: it.updated_on, next_update: it.next_update,
    placement: typeof it.data?.placement === 'string' ? it.data.placement : '', course: typeof it.data?.course === 'string' ? it.data.course : '',
    focus: focusOf(it),
  });
  const [msg, setMsg] = useState<Note>(null);
  const pickFocus = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setF({ ...f, focus: [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.placement) return setMsg({ ok: false, text: '화면 위치를 고르세요.' });
    const row = {
      title: f.title.trim(), campus: f.campus, status: f.status, sort: Number(f.sort) || 0, countries: f.countries, country_order: f.country_order,
      i18n: f.i18n, updated_on: f.updated_on || null, next_update: f.next_update || null,
      data: { ...it.data, placement: f.placement, course: f.course.trim(), focus: f.focus },
    };
    const { error } = await db().from('partner_content_items').update(row).eq('id', it.id);
    if (error) return setMsg({ ok: false, text: errText(error) });
    onSaved(`사진을 고쳤습니다(${placementLabel(f.placement)} · ${STATUS_LABEL[f.status]}).`);
  };
  const w = num(it.data?.width, 0);
  const h = num(it.data?.height, 0);
  return (
    <Panel title="사진 고치기" extra={<button type="button" className="btn btn-xs" onClick={onClose}>닫기</button>}>
      <form className="edit photo-edit" onSubmit={save}>
        <Status msg={msg} />
        <div className="photo-edit-grid">
          <div>
            <div className="focus-pick" onClick={pickFocus} role="presentation">
              {url ? <img src={url} alt={f.title} /> : <span className="muted">불러오는 중</span>}
              <span className="focus-dot" style={{ left: `${f.focus[0] * 100}%`, top: `${f.focus[1] * 100}%` }} aria-hidden="true" />
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>사진을 눌러 중심점을 고릅니다. 화면에서 사진을 잘라 보여 줄 때 이 점이 가운데에 옵니다. {w > 0 && `${w}×${h}px`}{typeof it.data?.file_name === 'string' && ` · ${it.data.file_name}`}</p>
            <div className="focus-preview">
              {['16 / 9', '1 / 1', '3 / 4'].map((r) => (
                <div key={r} style={{ aspectRatio: r }}>{url && <img src={url} alt="" style={{ objectPosition: pos(f.focus) }} />}</div>
              ))}
            </div>
          </div>
          <table className="kv">
            <tbody>
              <tr>
                <th>화면 위치 *</th>
                <td>
                  <select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>
                    <option value="">고르세요</option>
                    {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  {f.placement && <span className="hint">{PLACEMENTS.find((p) => p.key === f.placement)?.where}</span>}
                </td>
              </tr>
              <tr>
                <th>캠퍼스</th>
                <td>
                  <select value={f.campus} onChange={(e) => setF({ ...f, campus: e.target.value })}>
                    <option value="">{CAMPUS_LABEL['']}</option>
                    {CAMPUSES.map((c) => <option key={c} value={c}>{CAMPUS_LABEL[c]}</option>)}
                  </select>
                </td>
              </tr>
              <tr><th><label htmlFor="ph-course">코스</label></th><td><input id="ph-course" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></td></tr>
              <tr><th><label htmlFor="ph-title">설명</label></th><td><input id="ph-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} /></td></tr>
              <tr>
                <th>언어별 설명</th>
                <td>
                  {I18N_LANGS.map(([code, label]) => (
                    <input key={code} aria-label={`${label} 설명`} placeholder={`${label}`} value={f.i18n[code]?.title ?? ''} onChange={(e) => setF({ ...f, i18n: { ...f.i18n, [code]: { ...f.i18n[code], title: e.target.value } } })} style={{ width: '100%', marginBottom: 4 }} />
                  ))}
                  <span className="hint">비우면 한국어 설명이 보입니다.</span>
                </td>
              </tr>
              <tr>
                <th>공개 상태 · 순서</th>
                <td>
                  <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ContentItem['status'] })}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>{' '}
                  <input type="number" aria-label="순서" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} style={{ width: 80 }} /> <span className="hint">작은 수가 먼저</span>
                </td>
              </tr>
              <tr>
                <th>업데이트</th>
                <td>
                  <input type="date" aria-label="최종 업데이트일" value={f.updated_on ?? ''} onChange={(e) => setF({ ...f, updated_on: e.target.value || null })} />{' '}
                  <input aria-label="다음 업데이트 예정" placeholder="다음 예정 YYYY-MM" value={f.next_update ?? ''} onChange={(e) => setF({ ...f, next_update: e.target.value || null })} style={{ width: 150 }} />
                </td>
              </tr>
              <CountryFields countries={f.countries} order={f.country_order} onChange={(countries, country_order) => setF({ ...f, countries, country_order })} />
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <span />
          <button type="submit" className="btn btn-primary">고치기</button>
        </div>
      </form>
    </Panel>
  );
}
