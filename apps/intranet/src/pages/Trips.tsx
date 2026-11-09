import { Link } from 'react-router-dom';
import { useAccess, useApi, type TripList } from '../api';
import { Loading, PageTitle, Tabs } from '../components/ui';
import { deadlineText, TRIP_STATUS, TRIP_STATUS_CLASS, tripCost, tripDates } from '../tripLabels';
import { useSearchForm } from '../useSearchForm';

// 학교 여행·액티비티(업체 'Outing > Travel'): 직원이 올리고 학생이 앱에서 참가 신청한다.
// 1박 이상 여행은 참가 신청한 학생의 그 밤들이 외박 허용이 된다(통금 확인·가드 태블릿).
const KEYS = ['campus', 'q'] as const;

export default function Trips() {
  const f = useSearchForm(KEYS);
  const tab = f.params.get('tab') === 'past' ? 'past' : 'upcoming';
  const { data, error, reload } = useApi<TripList>('/api/trips?' + f.query);
  const { manager } = useAccess(); // 매니저는 읽기만
  return (
    <>
      <PageTitle
        title="학교 여행"
        path="홈 > 신청 처리 > 학교 여행"
        actions={
          !manager && (
            <Link to="/trips/new" className="btn btn-primary">
              여행 등록
            </Link>
          )
        }
      />
      <Tabs
        label="여행 구분"
        value={tab}
        onChange={(k) => f.apply({ tab: k === 'upcoming' ? '' : k })}
        items={[
          { key: 'upcoming', label: `다가오는 여행 (${data?.counts.upcoming ?? 0})` },
          { key: 'past', label: `지난 여행 (${data?.counts.past ?? 0})` },
        ]}
      />
      <form className="search" onSubmit={f.submit} aria-label="검색 조건">
        <div className="search-grid">
          <label className="field">
            <span>캠퍼스</span>
            <select value={f.form.campus} onChange={f.set('campus')}>
              <option value="">전체</option>
              {data?.campuses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>검색</span>
            <input type="text" placeholder="제목, 장소" value={f.form.q} onChange={f.set('q')} />
          </label>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => f.reset()}>
            초기화
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            조회
          </button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong className="text-primary">{data.rows.length}</strong>건
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th>일정</th>
                  <th className="left">여행</th>
                  <th>캠퍼스</th>
                  <th>신청 / 정원</th>
                  <th>비용</th>
                  <th>신청 마감</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={7}>{tab === 'past' ? '지난 여행이 없습니다.' : '다가오는 여행이 없습니다. 오른쪽 위 [여행 등록]으로 올리세요.'}</td>
                  </tr>
                ) : (
                  data.rows.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{tripDates(t)}</td>
                      <td className="left">
                        <Link to={`/trips/${t.id}`}>{t.title}</Link>
                        <div className="muted small">{t.place}</div>
                      </td>
                      <td>{t.campus || '전체'}</td>
                      <td className={t.taken >= t.capacity ? 'text-red' : ''}>
                        {t.taken} / {t.capacity}
                      </td>
                      <td className="nowrap">{tripCost(t.cost)}</td>
                      <td className="nowrap">{deadlineText(t.deadline)}</td>
                      <td className={TRIP_STATUS_CLASS[t.status]}>{t.status === 'open' && !t.accepting ? '마감일 지남' : TRIP_STATUS[t.status]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
