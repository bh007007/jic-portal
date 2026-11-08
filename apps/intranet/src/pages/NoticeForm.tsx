import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useStaffName, type NoticeDetail, type NoticeList } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { localDate } from '../format';

/** 공지 작성(/notices/new)과 수정(/notices/:id/edit). 게시 종료일을 지난 날로 바꾸면 게시가 내려간다. */
export default function NoticeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const staff = useStaffName();
  const editing = !!id;
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [campus, setCampus] = useState('');
  const [pinned, setPinned] = useState(false);
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<NoticeList>('/api/notices').then((d) => setCampuses(d.campuses)).catch(() => undefined);
    if (!editing) return;
    api<NoticeDetail>(`/api/notices/${id}`)
      .then((d) => {
        setTitle(d.title);
        setContent(d.content);
        setCampus(d.campus);
        setPinned(d.pinned);
        setUntil(d.until ?? '');
        setLoaded(true);
      })
      .catch((e: ApiError) => setError(errorText(e.code)));
  }, [editing, id]);

  if (!staff) return <div className="state-msg">{errorText('actor_required')}</div>;
  if (!loaded) return error ? <div className="state-msg">{error}</div> : <Loading />;
  const today = localDate(Date.now());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { title, content, campus, pinned, until: until || null };
    try {
      if (editing) {
        await api(`/api/notices/${id}`, { method: 'PUT', body });
        notifySummaryChanged();
        navigate(`/notices/${id}`, { replace: true });
      } else {
        const r = await api<{ id: string }>('/api/notices', { method: 'POST', body });
        notifySummaryChanged();
        navigate(`/notices/${r.id}`, { replace: true });
      }
    } catch (err) {
      setError(errorText((err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title={editing ? '공지 수정' : '공지 작성'} path={`홈 > 공지·결재 > 내부 공지 > ${editing ? '수정' : '작성'}`} />
      <form className="panel" onSubmit={submit}>
        <div className="panel-body form-grid">
          <label>
            제목
            <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            내용
            <textarea required rows={12} maxLength={5000} value={content} onChange={(e) => setContent(e.target.value)} />
            <span className="muted small">{content.length} / 5000</span>
          </label>
          <label className="narrow">
            대상
            <select className="cell-input" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">전체</option>
              {campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="narrow">
            게시 종료일 (선택)
            <input type="date" min={editing ? undefined : today} value={until} onChange={(e) => setUntil(e.target.value)} />
            {editing && <span className="muted small">지난 날짜로 바꾸면 '지난 공지'로 내려갑니다.</span>}
          </label>
          <label className="check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 목록 맨 위에 고정
          </label>
          {error && (
            <p className="text-red" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <span className="muted small">작성자: {staff}</span>
            <button type="button" className="btn btn-lg" onClick={() => navigate(-1)}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              {editing ? '저장' : '게시'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
