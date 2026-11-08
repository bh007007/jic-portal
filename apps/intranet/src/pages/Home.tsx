import { Link } from 'react-router-dom';
import { useApi, type Summary } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { dateWithDay } from '../format';

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
          <span className="label">외박 신청 대기 · 오늘 밤 외박</span>
          <span className="value">
            {data.pendingOvernights}
            <small>건 · {data.overnightTonight}명</small>
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
    </>
  );
}
