import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadRecentResults, loadStudents, loadTestTypes } from '../data';
import ScoreForm from '../ScoreForm';
import { Loading, PageHead, Section, fmtDate, useLoad } from '../ui';

/** 성적 입력: 학생을 찾아 고른 뒤 바로 입력(휴대폰 기준). 아래에 최근 입력 30건. */
export default function Scores() {
  const students = useLoad(() => loadStudents(), []);
  const types = useLoad(() => loadTestTypes(), []);
  const recent = useLoad(() => loadRecentResults(30), []);
  const [kw, setKw] = useState('');
  const [pick, setPick] = useState('');

  const matches = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return [];
    return (students.data ?? []).filter((s) => `${s.name} ${s.student_no}`.toLowerCase().includes(k)).slice(0, 8);
  }, [students.data, kw]);
  const chosen = (students.data ?? []).find((s) => s.enrollment_id === pick);
  const nameOf = (no: string) => (students.data ?? []).find((s) => s.student_no === no)?.name ?? '';

  if (students.loading || types.loading) return <Loading />;
  if (students.error || types.error) return <Loading error={students.error || types.error} />;

  return (
    <>
      <PageHead title="성적 입력" />
      <Section title="학생 고르기">
        {chosen ? (
          <div className="picked">
            <span><strong>{chosen.name}</strong> <span className="muted small">{chosen.student_no} · {chosen.campus} · {chosen.course}</span></span>
            <button type="button" className="btn btn-xs" onClick={() => { setPick(''); setKw(''); }}>바꾸기</button>
          </div>
        ) : (
          <>
            <input type="search" className="full" placeholder="이름 또는 학생번호" value={kw} onChange={(e) => setKw(e.target.value)} aria-label="학생 검색" />
            <ul className="pick-list">
              {matches.map((s) => (
                <li key={s.enrollment_id}>
                  <button type="button" onClick={() => setPick(s.enrollment_id)}>
                    <strong>{s.name}</strong> <span className="muted small">{s.student_no} · {s.campus}</span>
                  </button>
                </li>
              ))}
              {kw.trim() && matches.length === 0 && <li className="muted small">맞는 학생이 없습니다.</li>}
            </ul>
          </>
        )}
      </Section>

      {chosen && (
        <Section title="점수">
          <ScoreForm student={chosen} types={types.data ?? []} onSaved={recent.reload} />
        </Section>
      )}

      <Section title="최근 입력 30건">
        {(recent.data ?? []).length === 0 ? (
          <p className="muted">아직 입력한 성적이 없습니다.</p>
        ) : (
          <ul className="rows">
            {(recent.data ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/students/${r.student_no}`}>{nameOf(r.student_no) || r.student_no}</Link>
                <span>{r.test_type.toUpperCase()}{r.section ? ` ${r.section}` : ''} <strong>{r.value}</strong></span>
                <span className="muted small">{fmtDate(r.test_date)} · {r.teacher_name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
