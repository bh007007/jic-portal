import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { cefrOf, loadCefr, loadResults, loadStudents, loadTestTypes, type TestResult } from '../data';
import ScoreForm from '../ScoreForm';
import ScoreChart from '../ScoreChart';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, fmtDate, useLoad, useSave } from '../ui';

/** 학생 한 명: 연수 정보, 성적 기록(시험 종류별), 성적 입력. 연락처·여권·금액은 강사 포털에 없다. */
export default function StudentDetail() {
  const { no = '' } = useParams();
  const { me } = useAuth();
  const students = useLoad(() => loadStudents(), []);
  const types = useLoad(() => loadTestTypes(), []);
  const cefr = useLoad(() => loadCefr(), []);
  const results = useLoad(() => loadResults(no), [no]);
  const del = useSave();

  const mine = (students.data ?? []).filter((s) => s.student_no === no).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const s = mine[0];
  if (students.loading || types.loading) return <Loading />;
  if (students.error) return <Loading error={students.error} />;
  if (!s) return <div className="state">재학·입학 예정 학생이 아닙니다. <Link to="/students">학생 목록</Link></div>;

  const typeName = (c: string) => types.data?.find((t) => t.code === c)?.name ?? c;
  const byType = new Map<string, TestResult[]>();
  for (const r of results.data ?? []) byType.set(r.test_type, [...(byType.get(r.test_type) ?? []), r]);

  const remove = async (r: TestResult) => {
    if (!window.confirm(`${typeName(r.test_type)} ${r.section || '총점'} ${r.value} (${r.test_date}) 기록을 지울까요?`)) return;
    if (await del.run(async () => {
      const { error } = await supabase.from('test_results').delete().eq('id', r.id);
      if (error) throw error;
    })) results.reload();
  };

  return (
    <>
      <PageHead title={s.name} sub={`${s.student_no} · ${s.nation}${s.gender ? ' · ' + s.gender : ''}`} right={<Link to="/students" className="btn btn-xs">목록</Link>} />
      <Section title="연수">
        <dl className="kv">
          <dt>캠퍼스</dt><dd>{s.campus || '-'}</dd>
          <dt>코스</dt><dd>{s.course || '-'}</dd>
          <dt>기숙사</dt><dd>{s.dorm || '-'}</dd>
          <dt>기간</dt><dd>{fmtDate(s.start_date)} ~ {fmtDate(s.end_date)}</dd>
          <dt>배치</dt><dd>{s.batch || '-'}</dd>
        </dl>
      </Section>

      <Section title="성적 입력">
        <ScoreForm student={s} types={types.data ?? []} onSaved={results.reload} />
      </Section>

      <Section title="성적 기록" extra={<span className="muted small">CEFR은 JIC 기준 추정 레벨</span>}>
        {results.loading ? (
          <p className="muted">불러오는 중…</p>
        ) : byType.size === 0 ? (
          <p className="muted">기록이 없습니다.</p>
        ) : (
          [...byType].map(([code, rows]) => (
            <div key={code} className="result-block">
              <h3>{typeName(code)}</h3>
              {types.data?.find((t) => t.code === code) && (
                <ScoreChart type={types.data.find((t) => t.code === code)!} results={rows} maps={cefr.data ?? []} />
              )}
              <table className="tbl">
                <thead>
                  <tr><th>날짜</th><th>영역</th><th className="num">점수</th><th>CEFR</th><th>입력</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDate(r.test_date)}</td>
                      <td>{r.section || '총점'}</td>
                      <td className="num strong">{r.value}</td>
                      <td>{(!r.section && cefrOf(cefr.data ?? [], r.test_type, Number(r.value))) || <span className="muted">-</span>}</td>
                      <td className="small muted">{r.teacher_name}{r.note ? ` · ${r.note}` : ''}</td>
                      <td>
                        {(r.teacher_id === me?.session.user.id || me?.isManager) && (
                          <button type="button" className="link-btn" onClick={() => remove(r)} disabled={del.busy}>삭제</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
        {del.error && <p className="err">{del.error}</p>}
      </Section>
    </>
  );
}
