import { Link } from 'react-router-dom';
import { useApi, type Summary } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { dateWithDay, mdhm } from '../format';

export default function Home() {
  const { data, error, reload } = useApi<Summary>('/api/summary', 60000);
  if (!data) return <Loading error={error} onRetry={reload} />;
  return (
    <>
      <PageTitle title="홈" path={`${dateWithDay(data.night)} 밤 · 통금 ${data.curfew}`} />
      <div className="summary">
        <Link to="/outings?view=out">
          <span className="label">지금 외출 중</span>
          <span className="value">
            {data.outNow}
            <small>명</small>
          </span>
        </Link>
        <Link to="/curfew">
          <span className="label">오늘 밤 통금 위반</span>
          <span className="value">
            {data.breachTonight}
            <small>건</small>
          </span>
        </Link>
        <Link to="/penalties">
          <span className="label">패널티 승인 대기</span>
          <span className="value">
            {data.pending}
            <small>건</small>
          </span>
        </Link>
        <Link to="/requests/absences">
          <span className="label">결석 신청 대기</span>
          <span className="value">
            {data.pendingAbsences}
            <small>건</small>
          </span>
        </Link>
        <Link to="/requests/overnights">
          <span className="label">외박·여행 신청 대기 · 오늘 밤 외박</span>
          <span className="value">
            {data.pendingOvernights}
            <small>건 · {data.overnightTonight}명</small>
          </span>
        </Link>
        <Link to="/requests/life">
          <span className="label">생활 요청 접수</span>
          <span className="value">
            {data.lifePending}
            <small>건</small>
          </span>
        </Link>
        <Link to="/trips">
          <span className="label">학교 여행 (다가오는 · 신청 받는 중)</span>
          <span className="value">
            {data.tripsUpcoming}
            <small>건 · {data.tripsAccepting}건</small>
          </span>
        </Link>
        <Link to="/counseling?view=followup">
          <span className="label">확인할 일 (상담 후속 조치)</span>
          <span className="value">
            {data.followUpOpen}
            <small>건 · 기한 지남·오늘 {data.followUpDue}건</small>
          </span>
        </Link>
        <Link to="/departures?view=missing">
          <span className="label">귀국 항공편 미등록 (졸업 14일 이내)</span>
          <span className="value">
            {data.departureMissing}
            <small>명</small>
          </span>
        </Link>
        <div>
          <span className="label">재학생</span>
          <span className="value">
            {data.current}
            <small>명</small>
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>
            내부 공지 {data.unreadNotices > 0 && <small className="text-red">안 읽음 {data.unreadNotices}건</small>}
          </h2>
          <Link to="/notices" className="more">
            전체 보기 &gt;
          </Link>
        </div>
        <div className="panel-body">
          {data.latestNotices.length === 0 ? (
            <p className="muted">게시 중인 공지가 없습니다.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {data.latestNotices.map((n) => (
                  <tr key={n.id}>
                    <td style={{ width: 48 }}>{n.pinned ? <span className="text-red strong">고정</span> : ''}</td>
                    <td>
                      <Link to={`/notices/${n.id}`} className={n.readByMe ? '' : 'strong'}>
                        {n.title}
                      </Link>
                    </td>
                    <td className="muted" style={{ width: 120 }}>
                      {n.campus || '전체'}
                    </td>
                    <td className="muted nowrap" style={{ width: 120 }}>
                      {mdhm(n.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
