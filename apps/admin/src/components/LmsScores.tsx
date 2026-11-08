import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { PORTALS } from '../portals';
import { Panel } from './ui';

interface Row {
  id: string;
  test_type: string;
  test_date: string;
  section: string;
  value: number;
  note: string;
  teacher_name: string;
}

// 강사 포털 주소(첫 화면과 같은 값): 배포는 같은 주소 아래 /teacher/
const TEACHER_URL = PORTALS.find((p) => p.key === 'teacher')?.url ?? '/teacher/';

/**
 * 학생 상세의 '강사 포털 성적'(test_results, 20261108200000_teacher_portal.sql). 강사가 강사 포털에서 넣은 점수를 직원이 같은 DB에서 본다(원칙 C2).
 * 데이터는 Supabase 에만 있어 배포 주소(로그인)에서만 나온다. 로컬 데이터 실행에서는 패널을 그리지 않는다.
 */
export default function LmsScores({ stId }: { stId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !stId) return;
    let alive = true;
    (async () => {
      const [r, t] = await Promise.all([
        supabase!.from('test_results').select('id, test_type, test_date, section, value, note, teacher_name').eq('student_no', stId).order('test_date', { ascending: false }).order('section'),
        supabase!.from('test_types').select('code, name'),
      ]);
      if (!alive) return;
      if (r.error) setError(/test_results|PGRST205|does not exist/.test(r.error.message + r.error.code) ? '강사 포털 성적 표가 아직 없습니다(Supabase 마이그레이션 적용 전).' : r.error.message);
      else setRows((r.data ?? []) as Row[]);
      setNames(Object.fromEntries(((t.data ?? []) as { code: string; name: string }[]).map((x) => [x.code, x.name])));
    })();
    return () => {
      alive = false;
    };
  }, [stId]);

  if (!supabase) return null;
  return (
    <Panel
      title={<>강사 포털 성적 {rows && <small>({rows.length}건)</small>}</>}
      extra={<a className="more" href={`${TEACHER_URL}${TEACHER_URL.endsWith('/') ? '' : '/'}students/${encodeURIComponent(stId)}`}>강사 포털에서 보기 &gt;</a>}
    >
      {error ? (
        <div className="state-msg">{error}</div>
      ) : !rows ? (
        <div className="state-msg">불러오는 중…</div>
      ) : (
        <table className="tbl center" style={{ minWidth: 640 }}>
          <thead>
            <tr><th>날짜</th><th>시험</th><th>영역</th><th>점수</th><th>입력</th><th className="left">메모</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr className="empty"><td colSpan={6}>강사 포털에 입력된 성적이 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{r.test_date}</td>
                <td>{names[r.test_type] ?? r.test_type.toUpperCase()}</td>
                <td>{r.section || '총점'}</td>
                <td className="strong">{r.value}</td>
                <td className="muted">{r.teacher_name}</td>
                <td className="left memo-text">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
