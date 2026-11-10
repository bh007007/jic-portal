import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText, useApi, type ApiError, type PhotoList } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { useSearchForm } from '../useSearchForm';
import { shrinkImage } from '../../../student/src/components/image';

const KEYS = ['scope', 'q', 'campus', 'missing'] as const;
type Shown = { stId: string; name: string; image?: string; uploadedAt?: string; uploadedBy?: string; history?: { uploadedAt: string; uploadedBy: string; source: string }[]; error?: string };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('sv-SE').slice(0, 16) : '');

/**
 * 사진 관리(11/10 결정 I9): 재학·입학 예정 학생의 사진을 올리고 본다. 직원(관리자·오피스)만, 오피스는 맡은 캠퍼스 학생만.
 * 목록에는 사진을 싣지 않고 '보기'를 누를 때 한 장씩 받는다. 사진은 화면에서 줄여(긴 변 1600px, 1MB 까지) 올린다.
 * 실제 학생 사진은 보안 점검 뒤에 올린다(그 전에는 가짜 사진으로만 시험).
 */
export default function Photos() {
  const f = useSearchForm(KEYS, { scope: 'current' });
  const { data, error, reload } = useApi<PhotoList>('/api/photos?' + f.query);
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function show(stId: string, name: string) {
    setShown({ stId, name });
    try {
      const r = await api<{ image: string; uploadedAt: string; uploadedBy: string; history: Shown['history'] }>(`/api/photos/${encodeURIComponent(stId)}`);
      setShown({ stId, name, ...r });
    } catch (e) {
      setShown({ stId, name, error: errorText((e as ApiError).code) });
    }
  }
  async function upload(stId: string, name: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(stId);
    setMessage(null);
    try {
      const image = await shrinkImage(file);
      await api(`/api/photos/${encodeURIComponent(stId)}`, { method: 'POST', body: { image } });
      setMessage({ text: `${name} 사진을 올렸습니다.` });
      reload();
      if (shown?.stId === stId) void show(stId, name);
    } catch (err) {
      const code = (err as ApiError).code ?? (err as Error).message;
      setMessage({ text: `${name}: ${errorText(code)}`, error: true });
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => setShown(null), [f.query]);

  return (
    <>
      <PageTitle title="사진 관리" path="홈 > 학생 생활 > 사진 관리" />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <label className="field">
            <span>학생</span>
            <select value={f.form.scope} onChange={f.set('scope')}>
              <option value="current">재학생</option>
              <option value="upcoming">입학 예정</option>
            </select>
          </label>
          <label className="field">
            <span>이름</span>
            <input type="text" placeholder="이름 또는 학생번호" value={f.form.q} onChange={f.set('q')} />
          </label>
          <label className="field">
            <span>캠퍼스</span>
            <select value={f.form.campus} onChange={f.set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>사진</span>
            <select value={f.form.missing} onChange={f.set('missing')}>
              <option value="">전체</option>
              <option value="1">사진 없는 학생만</option>
            </select>
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={f.reset}>
            초기화
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            조회
          </button>
        </div>
      </form>
      {message && (
        <p className={message.error ? 'text-red' : 'text-blue'} role="status">
          {message.text}
        </p>
      )}
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : (
        <>
          {!data.ready && <p className="text-red">사진 저장소가 아직 준비되지 않았습니다. 목록만 볼 수 있습니다.</p>}
          {shown && (
            <div className="grid-box" style={{ display: 'flex', gap: 16, padding: 12, marginBottom: 12, alignItems: 'flex-start' }}>
              <div className="photo">{shown.image ? <img src={shown.image} alt={`${shown.name} 사진`} /> : shown.error ?? '불러오는 중…'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong>{shown.name}</strong> <span className="muted">{shown.stId}</span>{' '}
                  <Link to={`/student-file/${encodeURIComponent(shown.stId)}`}>Student File</Link>
                </p>
                {shown.history && (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>올린 때</th>
                        <th>올린 사람</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.history.map((h, i) => (
                        <tr key={i}>
                          <td>
                            {when(h.uploadedAt)}
                            {i === 0 ? ' (지금 사진)' : ''}
                          </td>
                          <td>{h.source === 'vendor' ? '업체 사진 옮김' : h.uploadedBy || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <button type="button" className="btn" onClick={() => setShown(null)}>
                닫기
              </button>
            </div>
          )}
          <div className="toolbar">
            <span>
              {data.scope === 'upcoming' ? '입학 예정' : '재학생'} <strong className="text-primary">{data.counts.all}</strong>명 · 사진 있음 {data.counts.withPhoto} · 없음{' '}
              <strong className={data.counts.missing ? 'text-red' : ''}>{data.counts.missing}</strong>
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">학생</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th className="left">코스</th>
                  <th>연수 기간</th>
                  <th>사진</th>
                  <th>올린 때</th>
                  <th>올린 사람</th>
                  <th>올리기</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={9}>해당하는 학생이 없습니다.</td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.stId}>
                      <td className="left">
                        <Link to={`/student-file/${encodeURIComponent(r.stId)}`}>{r.name}</Link> <span className="muted">{r.stId}</span>
                      </td>
                      <td>{r.nation}</td>
                      <td>{r.campus}</td>
                      <td className="left">{r.course}</td>
                      <td className="nowrap">
                        {r.start} ~ {r.end}
                      </td>
                      <td>
                        {r.hasPhoto ? (
                          <button type="button" className="link-btn" onClick={() => void show(r.stId, r.name)}>
                            보기
                          </button>
                        ) : (
                          <span className="text-red">없음</span>
                        )}
                      </td>
                      <td className="nowrap">{when(r.uploadedAt)}</td>
                      <td>{r.uploadedBy ?? ''}</td>
                      <td>
                        <label className="btn btn-xs" aria-disabled={!data.ready || !!busy} style={!data.ready || busy ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                          {busy === r.stId ? '올리는 중…' : r.hasPhoto ? '바꾸기' : '올리기'}
                          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!data.ready || !!busy} onChange={(e) => void upload(r.stId, r.name, e)} />
                        </label>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
