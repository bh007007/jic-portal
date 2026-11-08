import { useLoad } from '../../data';
import { must, supabase } from '../../supabase';
import { Box, Loading } from '../../ui';

interface MemberRow { user_id: string; agency_name: string; branch: string | null; country: string | null; login_count: number; last_login_at: string | null }
interface Download { member_id: string; course_id: string | null; created_at: string }

// 12.7 사용 통계: 지점별 학습계획서 다운로드 수, 지점별 접속 수 (학생 정보 없이 숫자만)
export default function AdminStats() {
  const { data, error } = useLoad(async () => ({
    members: await must<MemberRow[]>(supabase.from('agency_members').select('user_id,agency_name,branch,country,login_count,last_login_at')),
    downloads: await must<Download[]>(supabase.from('plan_downloads').select('member_id,course_id,created_at')),
  }));
  if (!data) return <Loading error={error} />;
  const month = new Date().toISOString().slice(0, 7);
  const rows = data.members
    .map((m) => {
      const ds = data.downloads.filter((d) => d.member_id === m.user_id);
      return { ...m, downloads: ds.length, thisMonth: ds.filter((d) => d.created_at.startsWith(month)).length };
    })
    .sort((a, b) => b.downloads - a.downloads || b.login_count - a.login_count);
  const byCourse = new Map<string, number>();
  for (const d of data.downloads) byCourse.set(d.course_id ?? '-', (byCourse.get(d.course_id ?? '-') ?? 0) + 1);

  return (
    <div className="row">
      <Box title="지점별" className="grow-3">
        {rows.length === 0 ? <p className="empty">지점 계정이 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th className="left">에이전시 · 지점</th><th>국가</th><th>학습계획서 (전체)</th><th>이번 달</th><th>접속 수</th><th>최근 접속</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.user_id}>
                    <td className="left strong">{m.agency_name} {m.branch}</td>
                    <td>{m.country}</td>
                    <td className="strong">{m.downloads}</td>
                    <td>{m.thisMonth}</td>
                    <td>{m.login_count}</td>
                    <td className="muted">{m.last_login_at?.slice(0, 10) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
      <Box title="코스별 학습계획서" className="grow-1">
        <div className="box-body">
          <table className="tbl center">
            <thead><tr><th className="left">코스</th><th>건수</th></tr></thead>
            <tbody>
              {[...byCourse].sort((a, b) => b[1] - a[1]).map(([c, n]) => <tr key={c}><td className="left">{c}</td><td>{n}</td></tr>)}
              {byCourse.size === 0 && <tr><td colSpan={2} className="muted">아직 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
    </div>
  );
}
