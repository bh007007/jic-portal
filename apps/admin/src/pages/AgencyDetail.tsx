import { Link, useParams } from 'react-router-dom';
import { fmt, useApi, type AgencyDetail as Detail, type EnrollmentRow } from '../api';
import { Loading, PageTitle, Panel } from '../components/ui';

const PATH = '홈 > 에이전시 > 에이전시 목록 > 에이전시 상세';

function StudentTable({ rows, empty, showBatch }: { rows: EnrollmentRow[]; empty: string; showBatch?: boolean }) {
  return (
    <table className="tbl center" style={{ minWidth: 820 }}>
      <thead>
        <tr>
          <th>학생번호</th>
          <th className="left">이름</th>
          <th>국적</th>
          <th>캠퍼스</th>
          <th className="left">코스</th>
          {showBatch && <th>배치</th>}
          <th>입학일</th>
          <th>졸업일</th>
          <th className="left">담당 지점</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr className="empty"><td colSpan={showBatch ? 9 : 8}>{empty}</td></tr>
        )}
        {rows.map((r) => (
          <tr key={r.trId}>
            <td>{r.stId}</td>
            <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
            <td>{r.nation}</td>
            <td>{r.campus}</td>
            <td className="left">{r.course}</td>
            {showBatch && <td>{r.batch}</td>}
            <td className="nowrap">{r.start}</td>
            <td className="nowrap">{r.end}</td>
            <td className="left">{r.branch}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AgencyDetail() {
  const { agId = '' } = useParams();
  const { data, error } = useApi<Detail>(`/api/agencies/${encodeURIComponent(agId)}`);

  if (!data) {
    return (
      <>
        <PageTitle title="에이전시 상세" path={PATH} />
        <Loading error={error} />
      </>
    );
  }

  const a = data.agency;
  const homepage = a.homepage && !/^https?:\/\//i.test(a.homepage) ? 'http://' + a.homepage : a.homepage;

  return (
    <>
      <PageTitle title="에이전시 상세" path={PATH} />

      <div className="row">
        <Panel
          title="기본 정보"
          extra={<Link className="btn" to="/agencies">목록</Link>}
          className="grow-2"
        >
          <table className="kv" style={{ minWidth: 520 }}>
            <tbody>
              <tr>
                <th scope="row">에이전시명</th><td>{a.name}{a.demo && <span className="muted"> (데모)</span>}</td>
                <th scope="row">에이전시번호</th><td>{a.agId}</td>
              </tr>
              <tr>
                <th scope="row">영문명</th><td>{a.nameEn || '-'}</td>
                <th scope="row">국가</th><td>{a.country}</td>
              </tr>
              <tr>
                <th scope="row">대표자</th><td>{a.ceo || '-'}</td>
                <th scope="row">등록일</th><td>{a.registered || '-'}</td>
              </tr>
              <tr>
                <th scope="row">전화</th><td>{a.tel || '-'}</td>
                <th scope="row">이메일</th><td>{a.email || '-'}</td>
              </tr>
              <tr>
                <th scope="row">홈페이지</th>
                <td colSpan={3}>{homepage ? <a href={homepage} target="_blank" rel="noreferrer">{a.homepage}</a> : '-'}</td>
              </tr>
              <tr>
                <th scope="row">주소</th><td colSpan={3}>{a.address || '-'}</td>
              </tr>
              {a.memo && (
                <tr>
                  <th scope="row">메모</th><td colSpan={3} className="memo-text">{a.memo}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel title="학생 실적">
          <table className="kv">
            <tbody>
              <tr><th scope="row">재학</th><td className="strong">{fmt(a.current)}명</td></tr>
              <tr><th scope="row">입학 예정</th><td>{fmt(a.upcoming)}명</td></tr>
              <tr><th scope="row">누적 연수</th><td>{fmt(a.total)}건</td></tr>
              <tr><th scope="row">최근 입학일</th><td>{a.lastStart || '-'}</td></tr>
            </tbody>
          </table>
          {data.byYear.length > 0 && (
            <table className="tbl center" style={{ marginTop: 12 }}>
              <thead><tr><th>입학 연도</th><th>연수(건)</th></tr></thead>
              <tbody>
                {data.byYear.map((y) => (
                  <tr key={y.name}><td>{y.name}</td><td>{fmt(y.count)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title={<>담당자 <small>({data.agents.length}명)</small></>}>
        <table className="tbl center" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th className="left">이름</th>
              <th className="left">지점</th>
              <th className="left">로그인 ID</th>
              <th>언어</th>
              <th>대표</th>
              <th>사용</th>
              <th>인보이스 수신</th>
              <th className="left">이메일</th>
              <th>재학</th>
              <th>누적 연수</th>
            </tr>
          </thead>
          <tbody>
            {data.agents.length === 0 && (
              <tr className="empty"><td colSpan={10}>등록된 담당자가 없습니다.</td></tr>
            )}
            {data.agents.map((m) => (
              <tr key={m.amId}>
                <td className="left strong">{m.name}</td>
                <td className="left">{m.branch}</td>
                <td className="left">{m.loginId}</td>
                <td>{m.lang}</td>
                <td>{m.main ? '대표' : ''}</td>
                <td className={m.active ? '' : 'text-red'}>{m.active ? '사용' : '미사용'}</td>
                <td>{m.invoice ? 'Y' : 'N'}</td>
                <td className="left muted">{m.email}</td>
                <td className={m.current ? 'strong' : 'muted'}>{fmt(m.current)}</td>
                <td>{fmt(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={<>재학생 <small>({data.current.length}명)</small></>}>
        <StudentTable rows={data.current} empty="재학 중인 학생이 없습니다." />
      </Panel>

      <Panel title={<>입학 예정 <small>({data.upcoming.length}명)</small></>}>
        <StudentTable rows={data.upcoming} empty="입학 예정 학생이 없습니다." showBatch />
      </Panel>
    </>
  );
}
