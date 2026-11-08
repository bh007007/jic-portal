import { useState } from 'react';
import { fmtSize, today, useLoad, type Resource } from '../data';
import { t } from '../i18n';
import { errText, must, supabase } from '../supabase';
import { Box, Loading, Msg, PageHead } from '../ui';

export const RESOURCE_CATEGORIES = ['가격표', '코스 브로슈어', '시설·수업 사진·영상', '등록 서류', '학사·생활 규정'];
const NEW_DAYS = 14;

const daysAgo = (d: string) => (Date.parse(today()) - Date.parse(d)) / 864e5;

// 8.1 자료실: 에이전시용 자료만(노션과 연결하지 않음). 파일은 비공개 저장소에서 서명된 주소로 내려받는다.
export default function Resources() {
  const { data, error } = useLoad(() => must<Resource[]>(supabase.from('partner_resources').select('*').order('updated_on', { ascending: false })));
  const [cat, setCat] = useState('');
  const [kw, setKw] = useState('');
  const [err, setErr] = useState('');
  if (!data) return <Loading error={error} />;

  const list = data.filter((r) => (!cat || r.category === cat) && (!kw || `${r.title} ${r.description ?? ''}`.toLowerCase().includes(kw.toLowerCase())));
  const open = async (r: Resource) => {
    setErr('');
    if (r.link_url) return void window.open(r.link_url, '_blank', 'noopener');
    if (!r.file_path) return;
    const { data: signed, error: e } = await supabase.storage.from('partner-resources').createSignedUrl(r.file_path, 300, { download: r.file_name ?? true });
    if (e || !signed) return setErr(errText(e));
    window.location.href = signed.signedUrl;
  };

  return (
    <>
      <PageHead title={t('nav.resources')} />
      <div className="box box-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['', ...RESOURCE_CATEGORIES].map((c) => (
            <button key={c || 'all'} type="button" className={'btn btn-sm' + (cat === c ? ' btn-primary' : '')} onClick={() => setCat(c)}>{c || '전체'}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260, marginLeft: 'auto', height: 32 }} placeholder="자료 검색" aria-label="자료 검색" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {err && <Msg kind="err">{err}</Msg>}
      <Box>
        {list.length === 0 ? (
          <p className="empty">등록된 자료가 없습니다.</p>
        ) : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>분류</th><th className="left">자료</th><th>업데이트</th><th>크기</th><th>받기</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const fresh = daysAgo(r.updated_on) <= NEW_DAYS;
                  const isNew = daysAgo(r.created_at.slice(0, 10)) <= NEW_DAYS;
                  return (
                    <tr key={r.id}>
                      <td className="muted">{r.category}</td>
                      <td className="left">
                        <strong>{r.title}</strong>
                        {fresh && <span className="text-red" style={{ fontSize: 11, marginLeft: 6 }}>{isNew ? 'New' : 'Updated'}</span>}
                        {r.description && <div className="muted pre" style={{ fontSize: 12 }}>{r.description}</div>}
                      </td>
                      <td>{r.updated_on}</td>
                      <td className="muted">{r.link_url ? '링크' : fmtSize(r.file_size)}</td>
                      <td><button type="button" className="btn btn-sm" onClick={() => open(r)}>{r.link_url ? '열기' : '다운로드'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
