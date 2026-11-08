import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorText, type TripDetail, type TripList } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { localDate } from '../format';
import { TRIP_ERRORS } from '../tripLabels';

const EMPTY = { campus: '', title: '', place: '', meeting: '', description: '', start: '', end: '', deadline: '', capacity: '', cost: '0' };
type Form = typeof EMPTY;

/** 여행 등록(/trips/new)과 수정(/trips/:id/edit). 상태(마감·취소)는 상세 화면에서 바꾼다. */
export default function TripForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;
  const [campuses, setCampuses] = useState<string[]>([]);
  const [limits, setLimits] = useState<TripList['limits'] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [taken, setTaken] = useState(0);
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const message = (code: string) => TRIP_ERRORS[code] ?? errorText(code);

  useEffect(() => {
    api<TripList>('/api/trips')
      .then((d) => {
        setCampuses(d.campuses);
        setLimits(d.limits);
      })
      .catch(() => undefined);
    if (!editing) return;
    api<TripDetail>(`/api/trips/${encodeURIComponent(id)}`)
      .then(({ trip: t }) => {
        setForm({ campus: t.campus, title: t.title, place: t.place, meeting: t.meeting, description: t.description, start: t.start, end: t.end, deadline: t.deadline, capacity: String(t.capacity), cost: String(t.cost) });
        setTaken(t.taken);
        setLoaded(true);
      })
      .catch((e: ApiError) => setError(message(e.code)));
  }, [editing, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return error ? <div className="state-msg">{error}</div> : <Loading />;
  const today = localDate(Date.now());
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...form, capacity: Number(form.capacity), cost: Number(form.cost || 0) };
    try {
      const r = await api<{ id: string }>(editing ? `/api/trips/${encodeURIComponent(id)}` : '/api/trips', { method: editing ? 'PUT' : 'POST', body });
      navigate(`/trips/${r.id}`, { replace: true });
    } catch (err) {
      setError(message((err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title={editing ? '여행 수정' : '여행 등록'} path={`홈 > 신청 처리 > 학교 여행 > ${editing ? '수정' : '등록'}`} />
      <form className="panel" onSubmit={submit}>
        <div className="panel-body form-grid">
          <label className="narrow">
            대상 캠퍼스
            <select className="cell-input" value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            제목
            <input required maxLength={limits?.title ?? 100} placeholder="예: 보라카이 1박 2일" value={form.title} onChange={set('title')} />
          </label>
          <label>
            장소
            <input required maxLength={limits?.place ?? 100} placeholder="예: Boracay" value={form.place} onChange={set('place')} />
          </label>
          <label>
            집합 (선택)
            <input maxLength={limits?.meeting ?? 100} placeholder="예: 토요일 07:00 정문" value={form.meeting} onChange={set('meeting')} />
          </label>
          <div className="form-row">
            <label className="narrow">
              출발일
              <input type="date" required min={editing ? undefined : today} value={form.start} onChange={set('start')} />
            </label>
            <label className="narrow">
              돌아오는 날
              <input type="date" required min={form.start || undefined} value={form.end} onChange={set('end')} />
            </label>
            <label className="narrow">
              신청 마감일
              <input type="date" required max={form.start || undefined} value={form.deadline} onChange={set('deadline')} />
            </label>
          </div>
          <div className="form-row">
            <label className="narrow">
              정원
              <input type="number" required min={Math.max(1, taken)} max={limits?.capacity ?? 500} value={form.capacity} onChange={set('capacity')} />
              {editing && taken > 0 && <span className="muted small">지금 신청 {taken}명</span>}
            </label>
            <label className="narrow">
              비용 (PHP, 무료면 0)
              <input type="number" required min={0} step={1} value={form.cost} onChange={set('cost')} />
            </label>
          </div>
          <label>
            안내 (선택, 학생에게 보임)
            <textarea rows={8} maxLength={limits?.description ?? 1000} placeholder="일정, 포함 사항, 준비물" value={form.description} onChange={set('description')} />
            <span className="muted small">{form.description.length} / {limits?.description ?? 1000}</span>
          </label>
          <p className="muted small">1박 이상 여행은 참가 신청한 학생의 그 밤들이 외박 허용이 됩니다(통금 확인·가드 태블릿). 학생은 신청 마감일까지 앱에서 신청·취소합니다.</p>
          {error && (
            <p className="text-red" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-lg" onClick={() => navigate(-1)}>
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              {editing ? '저장' : '등록'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
