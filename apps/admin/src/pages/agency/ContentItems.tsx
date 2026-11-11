import { useRef, useState, type FormEvent } from 'react';
import { CAMPUS_LABEL, I18N_LANGS, KINDS, MEDIA_BUCKET, PRICE_IN_TEXT, STATUS_LABEL, type ContentItem, type ContentKind } from '../../../../partner/src/contentKinds';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';
import { CountryFields, countryText } from './CountryFields';

type Form = Omit<ContentItem, 'id' | 'kind' | 'updated_at'>;
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜
const empty = (): Form => ({ campus: '', title: '', body: '', data: {}, i18n: {}, countries: [], country_order: {}, status: 'draft', sort: 0, updated_on: today(), next_update: null });

/**
 * 파트너 포털 화면 콘텐츠 입력(CL-045, 화면 명세 4장). 종류(kind)마다 칸은 contentKinds.ts.
 * 공통 칸(명세 4.0): 캠퍼스, 노출 국가·국가별 순서(CL-036), 언어별 문구(P7), 공개 상태(초안·게시·숨김: 게시 전에는 에이전시 화면에 '준비 중', C8),
 * 최종 업데이트일·다음 업데이트 예정(CL-054), 수정한 사람·날짜(DB 자동). 글 속 가격 숫자는 경고(CL-055).
 */
export default function ContentItems({ kind }: { kind: ContentKind }) {
  const def = KINDS[kind];
  const { data, error, reload } = useLoad(() =>
    must<ContentItem[]>(db().from('partner_content_items').select('*').eq('kind', kind).order('sort').order('updated_at', { ascending: false })),
  );
  const [edit, setEdit] = useState<string | null>(null);
  const [orig, setOrig] = useState<ContentItem['data']>({}); // 고치기 전 칸(바꾼 PDF의 옛 파일을 저장 뒤 지운다)
  const [f, setF] = useState<Form>(empty);
  const [lang, setLang] = useState<string | null>(null);
  const [msg, setMsg] = useState<Note>(null);
  if (!data) return <Loading error={error} />;

  const setData = (k: string, v: string | boolean) => setF({ ...f, data: { ...f.data, [k]: v } });
  const pdfKeys = def.fields.filter((x) => x.type === 'pdf').map((x) => x.key);
  const pick = (it: ContentItem) => {
    setEdit(it.id);
    setOrig(it.data ?? {});
    setF({ campus: it.campus, title: it.title, body: it.body, data: it.data ?? {}, i18n: it.i18n ?? {}, countries: it.countries ?? [], country_order: it.country_order ?? {}, status: it.status, sort: it.sort, updated_on: it.updated_on, next_update: it.next_update });
    setMsg(null);
    window.scrollTo(0, 0);
  };
  const reset = () => { setEdit(null); setOrig({}); setF(empty()); setLang(null); };
  const priceWarn = [f.title, f.body, ...Object.entries(f.data).filter(([k]) => !pdfKeys.some((p) => k === p || k === `${p}_name`)).map(([, v]) => String(v)), ...Object.values(f.i18n).flatMap((x) => [x.title ?? '', x.body ?? ''])].some((s) => PRICE_IN_TEXT.test(s));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (def.campus === 'required' && !f.campus) return setMsg({ ok: false, text: '캠퍼스를 고르세요.' });
    const missing = def.fields.filter((x) => x.required && !f.data[x.key]).map((x) => x.label);    if (missing.length) return setMsg({ ok: false, text: `필수 칸: ${missing.join(', ')}` });
    if (priceWarn && !window.confirm('글에 가격 숫자가 있는 것 같습니다. 글에는 금액을 넣지 않고 \'학비표 보기\'로 안내합니다(CL-055). 그래도 저장할까요?')) return;
    const row = { ...f, kind, title: f.title.trim(), next_update: f.next_update || null, updated_on: f.updated_on || null, sort: Number(f.sort) || 0 };
    const { error: e2 } = edit ? await db().from('partner_content_items').update(row).eq('id', edit) : await db().from('partner_content_items').insert(row);
    setMsg(e2 ? { ok: false, text: errText(e2) } : { ok: true, text: `'${row.title}'을(를) ${edit ? '고쳤습니다' : '저장했습니다'}(${STATUS_LABEL[row.status]}).` });
    if (!e2) {
      // 바꾸거나 뺀 PDF의 옛 파일은 저장한 뒤 지운다
      const old = pdfKeys.map((k) => orig[k]).filter((p): p is string => typeof p === 'string' && !!p && !pdfKeys.some((k) => f.data[k] === p));
      if (old.length) await db().storage.from(MEDIA_BUCKET).remove(old);
      reset();
      reload();
    }
  };
  const remove = async (it: ContentItem) => {
    if (!window.confirm(`'${it.title}'을(를) 지울까요? 되돌릴 수 없습니다. 내리기만 하려면 상태를 '숨김'으로 바꾸세요.`)) return;
    const { error: e } = await db().from('partner_content_items').delete().eq('id', it.id);
    const files = pdfKeys.map((k) => it.data?.[k]).filter((p): p is string => typeof p === 'string' && !!p);
    if (!e && files.length) await db().storage.from(MEDIA_BUCKET).remove(files);
    setMsg(e ? { ok: false, text: errText(e) } : { ok: true, text: `'${it.title}'을(를) 지웠습니다.` });
    reload();
  };
  const tr = lang ? f.i18n[lang] ?? {} : null;
  const setTr = (k: 'title' | 'body', v: string) => lang && setF({ ...f, i18n: { ...f.i18n, [lang]: { ...f.i18n[lang], [k]: v } } });

  return (
    <>
      <Panel title={`${def.label} · ${edit ? '고치기' : '새로 쓰기'}`} extra={edit ? <button type="button" className="btn btn-xs" onClick={reset}>새로 쓰기로</button> : undefined}>
        <form className="edit" onSubmit={save}>
          <Status msg={msg} />
          <p className="hint" style={{ margin: '0 0 8px' }}>에이전시 포털: {def.where}. 게시 전에는 에이전시 화면에 '준비 중'으로 보입니다.</p>
          <table className="kv">
            <tbody>
              {def.campus !== 'none' && (
                <tr>
                  <th>캠퍼스{def.campus === 'required' ? ' *' : ''}</th>
                  <td colSpan={3}>
                    <select value={f.campus} onChange={(e) => setF({ ...f, campus: e.target.value })}>
                      {def.campus === 'optional' && <option value="">{CAMPUS_LABEL['']}</option>}
                      {def.campus === 'required' && <option value="">고르세요</option>}
                      {(def.campuses ?? []).map((c) => <option key={c} value={c}>{CAMPUS_LABEL[c]}</option>)}
                    </select>
                  </td>
                </tr>
              )}
              <tr>
                <th><label htmlFor="ci-title">{def.title} *</label></th>
                <td colSpan={3}><input id="ci-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} /></td>
              </tr>
              {def.fields.map((x) => (
                <tr key={x.key}>
                  <th><label htmlFor={`ci-${x.key}`}>{x.label}{x.required ? ' *' : ''}</label></th>
                  <td colSpan={3}>
                    {x.type === 'textarea' ? (
                      <textarea id={`ci-${x.key}`} value={String(f.data[x.key] ?? '')} onChange={(e) => setData(x.key, e.target.value)} />
                    ) : x.type === 'select' ? (
                      <select id={`ci-${x.key}`} value={String(f.data[x.key] ?? '')} onChange={(e) => setData(x.key, e.target.value)}>
                        <option value="">-</option>
                        {(x.options ?? []).map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : x.type === 'pdf' ? (
                      <PdfField
                        path={typeof f.data[x.key] === 'string' ? (f.data[x.key] as string) : ''}
                        name={typeof f.data[`${x.key}_name`] === 'string' ? (f.data[`${x.key}_name`] as string) : ''}
                        folder={kind}
                        onChange={(path, name) => setF({ ...f, data: { ...f.data, [x.key]: path, [`${x.key}_name`]: name } })}
                        onError={(text) => setMsg({ ok: false, text })}
                      />
                    ) : x.type === 'check' ? (
                      <label><input id={`ci-${x.key}`} type="checkbox" checked={f.data[x.key] === true} onChange={(e) => setData(x.key, e.target.checked)} /> 예</label>
                    ) : (
                      <input id={`ci-${x.key}`} type={x.type === 'date' ? 'date' : x.type === 'url' ? 'url' : 'text'} value={String(f.data[x.key] ?? '')} onChange={(e) => setData(x.key, e.target.value)} style={{ width: x.type === 'date' ? undefined : '100%' }} />
                    )}
                    {x.hint && <span className="hint">{x.hint}</span>}
                  </td>
                </tr>
              ))}
              {def.body && (
                <tr>
                  <th><label htmlFor="ci-body">{def.body}</label></th>
                  <td colSpan={3}><textarea id="ci-body" style={{ minHeight: 140 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></td>
                </tr>
              )}
              {/* 언어별 문구(P7): 번역이 없으면 한국어로 보인다 */}
              <tr>
                <th>언어별 문구</th>
                <td colSpan={3}>
                  <span style={{ marginRight: 8 }}>
                    <button type="button" className={'btn btn-xs' + (lang === null ? ' btn-primary' : '')} onClick={() => setLang(null)}>한국어</button>
                    {I18N_LANGS.map(([code, label]) => (
                      <button key={code} type="button" className={'btn btn-xs' + (lang === code ? ' btn-primary' : '')} style={{ marginLeft: 4 }} onClick={() => setLang(code)}>
                        {label}{f.i18n[code]?.title || f.i18n[code]?.body ? ' ✓' : ''}
                      </button>
                    ))}
                  </span>
                  {tr ? (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input aria-label="번역 제목" placeholder={`${def.title} (번역)`} value={tr.title ?? ''} onChange={(e) => setTr('title', e.target.value)} style={{ width: '100%' }} />
                      {def.body && <textarea aria-label="번역 본문" placeholder={`${def.body} (번역)`} value={tr.body ?? ''} onChange={(e) => setTr('body', e.target.value)} />}
                    </div>
                  ) : (
                    <span className="hint">한국어가 기본입니다. 다른 언어 단추를 누르면 그 언어 제목·본문을 넣습니다.</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>공개 상태</th>
                <td>
                  <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Form['status'] })}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <th>순서</th>
                <td><input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} style={{ width: 80 }} /> <span className="hint">작은 수가 먼저</span></td>
              </tr>
              <tr>
                <th>최종 업데이트일</th>
                <td><input type="date" value={f.updated_on ?? ''} onChange={(e) => setF({ ...f, updated_on: e.target.value || null })} /></td>
                <th>다음 업데이트 예정</th>
                <td><input placeholder="YYYY-MM 또는 YYYY-MM-DD" value={f.next_update ?? ''} onChange={(e) => setF({ ...f, next_update: e.target.value || null })} style={{ width: 170 }} /></td>
              </tr>
              <CountryFields countries={f.countries} order={f.country_order} onChange={(countries, country_order) => setF({ ...f, countries, country_order })} />
            </tbody>
          </table>
          {priceWarn && <div className="text-red" style={{ fontSize: 12, marginTop: 6 }}>글에 가격 숫자가 있는 것 같습니다. 글에는 금액을 넣지 않고 '학비표 보기'로 안내합니다(CL-055).</div>}
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn-primary">{edit ? '고치기' : '저장'}</button>
          </div>
        </form>
      </Panel>
      <Panel title={<>{def.label} 목록 <small>({data.length}건)</small></>}>
        <div className="grid-box">
          <table className="tbl center">
            <thead><tr><th>순서</th>{def.campus !== 'none' && <th>캠퍼스</th>}<th className="left">{def.title}</th><th>상태</th><th>노출 국가</th><th>업데이트</th><th>관리</th></tr></thead>
            <tbody>
              {data.length === 0 && <tr className="empty"><td colSpan={7}>아직 없습니다. 위에서 새로 쓰세요.</td></tr>}
              {data.map((it) => (
                <tr key={it.id}>
                  <td>{it.sort}</td>
                  {def.campus !== 'none' && <td className="nowrap">{CAMPUS_LABEL[it.campus] ?? it.campus}</td>}
                  <td className="left strong">{it.title}{Object.keys(it.i18n ?? {}).length > 0 && <span className="muted" style={{ fontWeight: 400 }}> · 번역 {Object.keys(it.i18n).length}</span>}</td>
                  <td className={it.status === 'published' ? '' : 'muted'}>{STATUS_LABEL[it.status]}</td>
                  <td className="nowrap">{countryText(it.countries)}</td>
                  <td className="muted nowrap">{it.updated_on ?? '-'}{it.next_update ? ` → ${it.next_update}` : ''}</td>
                  <td className="nowrap">
                    <button type="button" className="btn btn-xs" onClick={() => pick(it)}>고치기</button>{' '}
                    <button type="button" className="btn btn-xs text-red" onClick={() => remove(it)}>삭제</button>
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

/** PDF 칸(캠프 브로슈어, CL-053): 비공개 저장소 partner-media 에 올리고 경로를 칸에 담는다. 옛 파일은 저장한 뒤 지운다 */
function PdfField({ path, name, folder, onChange, onError }: { path: string; name: string; folder: string; onChange: (path: string, name: string) => void; onError: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') return onError('PDF 파일만 올릴 수 있습니다.');
    if (file.size > 10 * 1024 * 1024) return onError('10MB보다 큰 파일은 올릴 수 없습니다.');
    setBusy(true);
    const p = `${folder}s/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.pdf`;
    const { error } = await db().storage.from(MEDIA_BUCKET).upload(p, file, { contentType: 'application/pdf', upsert: false });
    setBusy(false);
    if (error) return onError(errText(error));
    onChange(p, file.name);
  };
  const open = async () => {
    const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUrl(path, 300);
    if (error || !data) return onError(errText(error));
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {path ? (
        <>
          <strong>{name || 'PDF'}</strong>
          <button type="button" className="btn btn-xs" onClick={open}>보기</button>
          <button type="button" className="btn btn-xs" onClick={() => ref.current?.click()} disabled={busy}>바꾸기</button>
          <button type="button" className="btn btn-xs text-red" onClick={() => onChange('', '')}>빼기</button>
        </>
      ) : (
        <button type="button" className="btn btn-xs" onClick={() => ref.current?.click()} disabled={busy}>{busy ? '올리는 중…' : 'PDF 올리기'}</button>
      )}
      <input ref={ref} type="file" accept="application/pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
    </span>
  );
}
