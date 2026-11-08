import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorText, notifySummaryChanged, useStaffName, type CounselingDetail, type StudentFile } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { localDate } from '../format';

/** 상담 기록 작성(/counseling/new?stId=)과 수정(/counseling/:id/edit). */
export default function CounselingForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const staff = useStaffName();
  const editing = !!id;
  const [loaded, setLoaded] = useState(!editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stId, setStId] = useState(params.get('stId') ?? '');
  const [who, setWho] = useState<string | null>(null);
  const [date, setDate] = useState(localDate(Date.now()));
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 수정: 기존 기록을 읽는다(열람으로 접근 기록에 남는다).
  useEffect(() => {
    if (!editing || !staff) return;
    api<CounselingDetail>(`/api/counseling/${id}`)
      .then((d) => {
        setStId(d.note.stId);
        setWho(`${d.note.name} · ${d.note.campus}`);
        setDate(d.note.date);
        setTitle(d.note.title);
        setContent(d.note.content);
        setDue(d.note.followUpDue ?? '');
        setLoaded(true);
      })
      .catch((e: ApiError) => setLoadError(errorText(e.code)));
  }, [editing, id, staff]);

  // 작성: 학생번호를 넣으면 이름을 보여 준다.
  useEffect(() => {
    if (editing) return;
    const n = stId.replace(/\D/g, '');
    if (!n) return setWho(null);
    let alive = true;
    api<StudentFile>(`/api/students/${n}`)
      .then((d) => alive && setWho(`${d.student.name} · ${d.student.campus}`))
      .catch(() => alive && setWho(''));
    return () => {
      alive = false;
    };
  }, [editing, stId]);

  if (!staff) return <div className="state-msg">{errorText('actor_required')}</div>;
  if (!loaded) return loadError ? <div className="state-msg">{loadError}</div> : <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { stId, date, title, content, followUpDue: due || null };
    try {
      if (editing) {
        await api(`/api/counseling/${id}`, { method: 'PUT', body });
        notifySummaryChanged();
        navigate(`/counseling/${id}`, { replace: true });
      } else {
        await api('/api/counseling', { method: 'POST', body });
        notifySummaryChanged();
        navigate('/counseling', { replace: true });
      }
    } catch (err) {
      setError(errorText((err as ApiError).code));
      setBusy(false);
    }
  }

  const title_ = editing ? '상담 기록 수정' : '상담 기록 작성';
  return (
    <>
      <PageTitle title={title_} path={`홈 > 학생 생활 > 상담 기록 > ${editing ? '수정' : '작성'}`} />
      <form className="panel" onSubmit={submit}>
        <div className="panel-body form-grid">
          <label className="narrow">
            학생번호
            <input inputMode="numeric" required readOnly={editing} value={stId} onChange={(e) => setStId(e.target.value)} />
          </label>
          <span className={who === '' ? 'text-red small' : 'muted small'}>{who === null ? '' : who || '학생을 찾을 수 없습니다.'}</span>
          <label className="narrow">
            상담일
            <input type="date" required max={localDate(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            제목
            <input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            내용
            <textarea required rows={10} maxLength={3000} value={content} onChange={(e) => setContent(e.target.value)} />
            <span className="muted small">{content.length} / 3000</span>
          </label>
          <label className="narrow">
            후속 조치 기한 (선택)
            <input type="date" min={date} value={due} onChange={(e) => setDue(e.target.value)} />
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
              저장
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
