import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { loadRecentResults, loadStudents } from '../data';
import { manilaToday } from '../supabase';
import { PageHead, Section, fmtDate, useLoad } from '../ui';

const WEEK = '일월화수목금토';

export default function Home() {
  const { me } = useAuth();
  const today = manilaToday();
  const students = useLoad(() => loadStudents(), []);
  const recent = useLoad(() => loadRecentResults(8), []);
  const current = (students.data ?? []).filter((s) => s.start_date <= today);
  const arriving = (students.data ?? []).filter((s) => s.start_date > today);
  const byCampus = new Map<string, number>();
  for (const s of current) byCampus.set(s.campus || '-', (byCampus.get(s.campus || '-') ?? 0) + 1);

  return (
    <>
      <PageHead title={`${today} (${WEEK[new Date(today + 'T00:00:00').getDay()]})`} sub={`${me?.name ?? ''}님`} />

      <Section title="오늘 수업 · 출석">
        <p className="muted">업체 포털 수업 시간표를 연결한 뒤 열립니다(원칙 V1·V6). 지금은 업체 포털에서 출석을 입력합니다.</p>
      </Section>

      <Section title="학생" extra={<Link to="/students" className="more">전체 보기</Link>}>
        {students.loading ? (
          <p className="muted">불러오는 중…</p>
        ) : students.error ? (
          <p className="err">{students.error}</p>
        ) : (
          <div className="stats">
            <div>
              <span className="label">재학</span>
              <strong>{current.length}</strong>
              <span className="muted small">{[...byCampus].map(([c, n]) => `${c} ${n}`).join(' · ')}</span>
            </div>
            <div>
              <span className="label">30일 안 입학</span>
              <strong>{arriving.length}</strong>
            </div>
          </div>
        )}
      </Section>

      <Section title="최근 입력한 성적" extra={<Link to="/scores" className="more">성적 입력</Link>}>
        {recent.loading ? (
          <p className="muted">불러오는 중…</p>
        ) : (recent.data ?? []).length === 0 ? (
          <p className="muted">아직 입력한 성적이 없습니다.</p>
        ) : (
          <ul className="rows">
            {(recent.data ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/students/${r.student_no}`}>{r.student_no}</Link>
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
