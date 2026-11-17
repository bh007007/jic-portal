import { ADMIN_URL } from '../base';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText, useAccess, useApi, type StudentFile } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { duration, md, mdhm } from '../format';
import { LIFE_CATEGORY, LIFE_STATUS, LIFE_STATUS_CLASS } from '../lifeLabels';
import { SIGNUP_STATUS, SIGNUP_STATUS_CLASS, TRIP_STATUS, tripDates } from '../tripLabels';
import { FollowUp } from './Counseling';

// 학생 한 명의 생활 기록. 기본 정보·연수·회계·메모는 관리자 앱 학생 상세에 있다.
const STATUS: Record<string, string> = { pending: '대기', approved: '승인', rejected: '반려', cancelled: '학생 취소' };
const STATUS_CLASS: Record<string, string> = { pending: 'text-amber', approved: 'text-blue', rejected: 'text-red', cancelled: 'muted' };
const ENROLL: Record<string, string> = { current: '재학', upcoming: '입학 예정', graduated: '졸업', cancelled: '취소', other: '기타' };
const KIND: Record<string, string> = { sick: '병결', official: '공결', personal: '개인 사유' };
const AIRPORT: Record<string, string> = { MANILA: '마닐라', CLARK: '클락', OTHER: '기타' };
const Status = ({ s }: { s: string }) => <span className={STATUS_CLASS[s]}>{STATUS[s] ?? s}</span>;

/** 학생 사진(11/10 결정 I9): 직원에게만 있는지가 오고(data.photo), 있으면 한 장 받아 보인다. 올리기는 '사진 관리' 화면 */
function StudentPhoto({ stId, name, photo }: { stId: string; name: string; photo: StudentFile['photo'] }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    if (!photo) return;
    let alive = true;
    api<{ image: string }>(`/api/photos/${encodeURIComponent(stId)}`)
      .then((r) => alive && setImage(r.image))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [stId, photo?.uploadedAt]);
  if (photo === undefined) return null; // 매니저: 사진을 보지 않는다
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="photo">{photo ? image ? <img src={image} alt={`${name} 사진`} /> : '불러오는 중…' : '사진 없음'}</div>
      <Link to={`/photos?q=${encodeURIComponent(stId)}`} className="small">
        사진 관리
      </Link>
    </div>
  );
}

export default function StudentFileDetail() {
  const { stId = '' } = useParams();
  const { data, error, reload } = useApi<StudentFile>(`/api/students/${encodeURIComponent(stId)}`);
  const { manager } = useAccess(); // 매니저: 통합관리·생활 요청 처리로 가는 링크는 숨긴다(열 수 없는 화면)
  const path = '홈 > 학생 생활 > Student File';
  if (!data) {
    if (error === 'not_found') return <div className="state-msg">학생을 찾을 수 없습니다.</div>;
    if (error === 'campus_forbidden') return <div className="state-msg">{errorText(error)}</div>;
    return <Loading error={error} onRetry={reload} />;
  }
  const s = data.student;

  return (
    <>
      <PageTitle
        title={`${s.name} (${s.stId})`}
        path={path}
        actions={
          <>
            <Link to="/student-file" className="btn">
              목록
            </Link>
            {!manager && (
              <a href={`${ADMIN_URL}/students/${s.stId}`} className="btn">
                통합관리 학생 상세
              </a>
            )}
          </>
        }
      />
      <section className="panel">
        <div className="panel-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <StudentPhoto stId={s.stId} name={s.name} photo={data.photo} />
          <table className="kv" style={{ flex: 1, minWidth: 0 }}>
            <tbody>
              <tr>
                <th>국적 / 성별</th>
                <td>
                  {s.nation || '-'} / {s.gender || '-'}
                </td>
                <th>상태</th>
                <td>{ENROLL[s.status] ?? s.status}</td>
              </tr>
              <tr>
                <th>캠퍼스 / 기숙사</th>
                <td>
                  {s.campus} / {s.dorm || '-'}
                </td>
                <th>코스 / 기간</th>
                <td>
                  {s.course || '-'} / {s.start} ~ {s.end}
                </td>
              </tr>
              <tr>
                <th>귀국 항공편</th>
                <td colSpan={3}>
                  {data.departure ? (
                    <>
                      {data.departure.date} {data.departure.time} · {data.departure.flight} · {AIRPORT[data.departure.airport] ?? data.departure.airport}
                      {data.departure.needsRide && <span className="text-amber"> · 공항 이동 차량 요청</span>}
                    </>
                  ) : (
                    <span className="muted">학생 앱에서 미등록</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="summary">
        <div>
          <span className="label">누적 점수 (승인)</span>
          <span className="value">
            {data.total}
            <small>점</small>
          </span>
          <span className="sub">경고 단계 {data.stagesSet ? (data.stage ?? '-') : '기준 미정'}</span>
        </div>
        <div>
          <span className="label">통금 위반</span>
          <span className="value">
            {data.breachCount}
            <small>회 / 외출 기록 {data.outingCount}건</small>
          </span>
          <span className="sub">통금 {data.curfew}</span>
        </div>
        <div>
          <span className="label">결석 신청</span>
          <span className="value">
            {data.absences.length}
            <small>건</small>
          </span>
          <span className="sub">대기 {data.absences.filter((a) => a.status === 'pending').length}</span>
        </div>
        <div>
          <span className="label">외박 신청</span>
          <span className="value">
            {data.overnights.length}
            <small>건</small>
          </span>
          <span className="sub">대기 {data.overnights.filter((o) => o.status === 'pending').length}</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>
            패널티 이력 <small>({data.penalties.length}건)</small>
          </h2>
          <Link to={`/penalties?q=${s.stId}`} className="more">
            패널티 승인 &gt;
          </Link>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>발생일</th>
                <th>위반 종류</th>
                <th className="left">근거</th>
                <th>점수</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {data.penalties.length === 0 ? (
                <tr className="empty">
                  <td colSpan={6}>패널티 기록이 없습니다.</td>
                </tr>
              ) : (
                data.penalties.map((p) => (
                  <tr key={p.id}>
                    <td>{md(p.date)}</td>
                    <td>{p.kindName}</td>
                    <td className="left">{p.basis}</td>
                    <td>{p.score === null ? <span className="muted">미정</span> : p.score}</td>
                    <td>
                      <Status s={p.status} />
                    </td>
                    <td>{mdhm(p.decidedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.attendance && <Attendance a={data.attendance} />}

      <section className="panel">
        <div className="panel-head">
          <h2>
            상담 기록 <small>({data.counseling.length}건 · 내용은 상세에서)</small>
          </h2>
          <Link to={`/counseling/new?stId=${s.stId}`} className="more">
            상담 기록 작성 &gt;
          </Link>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>상담일</th>
                <th className="left">제목</th>
                <th>작성자</th>
                <th>후속 조치</th>
              </tr>
            </thead>
            <tbody>
              {data.counseling.length === 0 ? (
                <tr className="empty">
                  <td colSpan={4}>상담 기록이 없습니다.</td>
                </tr>
              ) : (
                data.counseling.map((n) => (
                  <tr key={n.id}>
                    <td>{md(n.date)}</td>
                    <td className="left">
                      <Link to={`/counseling/${n.id}`}>{n.title}</Link>
                    </td>
                    <td>{n.author}</td>
                    <td>
                      <FollowUp n={n} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            외출·귀가 기록 <small>(최근 {data.outings.length}건 / 전체 {data.outingCount}건)</small>
          </h2>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>밤</th>
                <th>외출</th>
                <th>귀가</th>
                <th>외출 시간</th>
                <th>출입구</th>
                <th className="left">통금</th>
              </tr>
            </thead>
            <tbody>
              {data.outings.length === 0 ? (
                <tr className="empty">
                  <td colSpan={6}>외출 기록이 없습니다.</td>
                </tr>
              ) : (
                data.outings.map((o) => (
                  <tr key={o.id}>
                    <td>{md(o.night)}</td>
                    <td>{o.outAt ? mdhm(o.outAt) : <span className="muted">기록 없음</span>}</td>
                    <td>{o.inAt ? mdhm(o.inAt) : <span className="text-amber">외출 중</span>}</td>
                    <td>{duration(o.minutes)}</td>
                    <td>{o.campus}</td>
                    <td className="left">
                      {o.breach ? <span className="text-red">{o.breach}</span> : o.overnightUntil ? <span className="text-blue" title={o.overnightTrip ?? undefined}>외박 허용 ~{md(o.overnightUntil)}{o.overnightTrip && ' (학교 여행)'}</span> : <span className="muted">-</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row">
        <section className="panel">
          <div className="panel-head">
            <h2>
              결석 신청 <small>({data.absences.length}건)</small>
            </h2>
          </div>
          <div className="panel-body">
            <table className="tbl center">
              <thead>
                <tr>
                  <th>결석일</th>
                  <th>종류</th>
                  <th>교시</th>
                  <th className="left">사유</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.absences.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={5}>신청이 없습니다.</td>
                  </tr>
                ) : (
                  data.absences.map((a) => (
                    <tr key={a.id}>
                      <td>{md(a.date)}</td>
                      <td>{KIND[a.kind] ?? a.kind}</td>
                      <td>{a.periods.length ? `${a.periods.join('·')}교시` : '종일'}</td>
                      <td className="left">
                        {a.reason}
                        {a.comment && <div className="muted small">메모: {a.comment}</div>}
                      </td>
                      <td>
                        <Status s={a.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>
              외박·여행 신청 <small>({data.overnights.length}건)</small>
            </h2>
          </div>
          <div className="panel-body">
            <table className="tbl center">
              <thead>
                <tr>
                  <th>기간</th>
                  <th>박</th>
                  <th className="left">사유</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.overnights.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={4}>신청이 없습니다.</td>
                  </tr>
                ) : (
                  data.overnights.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap">
                        {md(o.from)} ~ {md(o.until)}
                      </td>
                      <td>{o.nights}</td>
                      <td className="left">
                        {o.destination && <strong>{o.destination} </strong>}
                        {o.reason}
                        {!!o.companions?.length && <div className="muted small">동행: {o.companions.join(', ')}</div>}
                        {o.comment && <div className="muted small">메모: {o.comment}</div>}
                      </td>
                      <td>
                        <Status s={o.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>
            생활 요청 <small>({data.lifeRequests.length}건)</small>
          </h2>
          {!manager && (
            <Link to="/requests/life" className="more">
              생활 요청 처리 &gt;
            </Link>
          )}
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>접수</th>
                <th>종류</th>
                <th className="left">내용</th>
                <th>상태</th>
                <th className="left">답변</th>
              </tr>
            </thead>
            <tbody>
              {data.lifeRequests.length === 0 ? (
                <tr className="empty">
                  <td colSpan={5}>요청이 없습니다.</td>
                </tr>
              ) : (
                data.lifeRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{mdhm(r.submittedAt)}</td>
                    <td>{LIFE_CATEGORY[r.category] ?? r.category}</td>
                    <td className="left">{r.content}</td>
                    <td className={LIFE_STATUS_CLASS[r.status]}>{LIFE_STATUS[r.status]}</td>
                    <td className="left">
                      {r.reply ?? '-'}
                      {r.handledBy && <div className="muted small">{r.handledBy}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            학교 여행 <small>({data.trips.length}건)</small>
          </h2>
          <Link to="/trips" className="more">
            학교 여행 &gt;
          </Link>
        </div>
        <div className="panel-body">
          <table className="tbl center">
            <thead>
              <tr>
                <th>일정</th>
                <th className="left">여행</th>
                <th>신청</th>
                <th>상태</th>
                <th className="left">제외 사유</th>
              </tr>
            </thead>
            <tbody>
              {data.trips.length === 0 ? (
                <tr className="empty">
                  <td colSpan={5}>신청한 여행이 없습니다.</td>
                </tr>
              ) : (
                data.trips.map((x) => (
                  <tr key={x.id}>
                    <td className="nowrap">{tripDates(x.trip)}</td>
                    <td className="left">
                      <Link to={`/trips/${x.trip.id}`}>{x.trip.title}</Link>
                      <span className="muted small"> · {x.trip.place}</span>
                      {x.trip.status === 'cancelled' && <span className="text-red small"> ({TRIP_STATUS.cancelled})</span>}
                    </td>
                    <td className="nowrap">{mdhm(x.createdAt)}</td>
                    <td className={SIGNUP_STATUS_CLASS[x.status]}>{SIGNUP_STATUS[x.status]}</td>
                    <td className="left">
                      {x.reason ?? '-'}
                      {x.handledBy && <div className="muted small">{x.handledBy}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const REASON: Record<string, string> = { excused: '사유 인정', requested: '결석 신청 승인', pending: '신청 처리 전', unexcused: '무단' };
const REASON_CLASS: Record<string, string> = { excused: 'text-blue', requested: 'text-blue', pending: 'text-amber', unexcused: 'text-red' };

/** 강사 포털 출석(지난 30일): 합계와 결석·지각 목록. 출석·사유 인정은 강사 포털이 정하고 여기서는 읽기만 한다 */
function Attendance({ a }: { a: NonNullable<StudentFile['attendance']> }) {
  const c = a.counts;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          수업 출석{' '}
          <small>
            ({md(a.from)} ~ {md(a.to)} · 강사 포털)
          </small>
        </h2>
      </div>
      <div className="panel-body">
        {c.sessions === 0 ? (
          <p className="muted">이 기간 강사 포털 출석 기록이 없습니다.</p>
        ) : (
          <>
            <p>
              수업 {c.sessions} · 출석 {c.present} · 지각 {c.late}
              {c.lateMin > 0 && ` (${c.lateMin}분)`} · 결석 {c.absent}
              {c.absent > 0 && (
                <span className="muted">
                  {' '}
                  (사유 인정 {c.excused} · 신청 승인 {c.requested} · 처리 전 {c.pendingRequest} · <span className={c.unexcused > 0 ? 'text-red' : ''}>무단 {c.unexcused}</span>)
                </span>
              )}
              {c.unchecked > 0 && <span className="muted"> · 체크 전 {c.unchecked}</span>}
            </p>
            {a.rows.length > 0 && (
              <table className="tbl center">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>시각</th>
                    <th className="left">수업</th>
                    <th>강사</th>
                    <th>결과</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {a.rows.map((r, i) => (
                    <tr key={`${r.day}-${r.time}-${i}`}>
                      <td>{md(r.day)}</td>
                      <td>{r.time}</td>
                      <td className="left">{[r.subject || '수업', r.room].filter(Boolean).join(' · ')}</td>
                      <td>{r.teacher || '-'}</td>
                      <td className={r.result === 'AB' ? 'text-red' : 'text-amber'}>{r.result === 'AB' ? '결석' : r.lateMin ? `지각 ${r.lateMin}분` : '지각'}</td>
                      <td className={r.reason ? REASON_CLASS[r.reason] : 'muted'}>
                        {r.reason ? REASON[r.reason] : '-'}
                        {r.requestKind && <span className="muted"> ({KIND[r.requestKind] ?? r.requestKind})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {a.more > 0 && <p className="muted small">결석·지각 {a.more}건 더 있음(최근 {a.rows.length}건만 보임)</p>}
          </>
        )}
      </div>
    </section>
  );
}
