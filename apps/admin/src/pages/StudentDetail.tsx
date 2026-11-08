import { Link, useParams } from 'react-router-dom';
import { fmt, useApi, type StudentDetail as Detail } from '../api';
import { Loading, PageTitle, Panel, PayText } from '../components/ui';

const STATUS_LABEL: Record<string, string> = { current: '재학', upcoming: '입학 예정', graduated: '졸업', cancelled: '취소', other: '기타' };
const PICK_LABEL: Record<string, string> = { BESA: 'BESA 그룹', INDIVIDUAL: '개별 픽업', NO_PICKUP: '개인 이동' };

export default function StudentDetail() {
  const { stId = '' } = useParams();
  const { data, error } = useApi<Detail>(`/api/students/${encodeURIComponent(stId)}`);
  const path = '홈 > 학생관리 > 재학생 현황 > 학생 상세';

  if (!data) {
    return (
      <>
        <PageTitle title="학생 상세" path={path} />
        <Loading error={error} />
      </>
    );
  }

  const s = data.student;
  const latest = data.enrollments[0];
  const memos = data.enrollments.flatMap((e) => e.memos.map((m) => ({ ...m, batch: e.batch, start: e.start })));

  return (
    <>
      <PageTitle title="학생 상세" path={path} />

      <Panel
        title="기본 정보"
        extra={
          <div style={{ display: 'flex', gap: 6 }}>
            <Link className="btn" to="/students?tab=current">목록</Link>
          </div>
        }
      >
        <div className="row">
          <div className="photo">사진</div>
          <div style={{ flex: '1 1 520px', minWidth: 0, overflowX: 'auto' }}>
            <table className="kv" style={{ minWidth: 520 }}>
              <tbody>
                <tr>
                  <th scope="row">학생번호</th><td>{s.stId}</td>
                  <th scope="row">이름</th><td>{s.name}</td>
                </tr>
                <tr>
                  <th scope="row">성 / 이름</th><td>{s.lastName} / {s.firstName}</td>
                  <th scope="row">성별 / 나이</th><td>{s.gender || '-'} / {s.age != null ? `만 ${s.age}세` : '-'}</td>
                </tr>
                <tr>
                  <th scope="row">국적</th><td>{s.nation || '-'}</td>
                  <th scope="row">생년월일</th><td>{s.birthday || '-'}</td>
                </tr>
                <tr>
                  <th scope="row">연락처</th><td>{s.cell || '-'}</td>
                  <th scope="row">이메일</th><td>{s.email || '-'}</td>
                </tr>
                <tr>
                  <th scope="row">언어</th><td>{s.lang || '-'}</td>
                  <th scope="row">등급</th><td>{s.vip || '-'}</td>
                </tr>
                <tr>
                  <th scope="row">에이전시</th><td>{latest ? `${latest.agency}${latest.branch ? ` (${latest.branch})` : ''}` : '-'}</td>
                  <th scope="row">현재 상태</th>
                  <td>
                    {latest ? STATUS_LABEL[latest.status] : '-'}
                    {latest?.note && <span className="text-red" style={{ fontSize: 12 }}> ({latest.note} · 졸업 {latest.end})</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Panel title={<>연수 이력 <small>({data.enrollments.length}건)</small></>}>
        <table className="tbl center" style={{ minWidth: 900 }}>
          <thead>
            <tr><th>No</th><th>배치</th><th>기간</th><th>캠퍼스</th><th className="left">코스</th><th className="left">기숙사</th><th>픽업</th><th>납부</th><th>상태</th></tr>
          </thead>
          <tbody>
            {data.enrollments.map((e, i) => (
              <tr key={e.trId}>
                <td>{data.enrollments.length - i}</td>
                <td>{e.batch || '-'}</td>
                <td>{e.start} ~ {e.end} ({e.weeks}주)</td>
                <td>{e.campus}</td>
                <td className="left">{e.course}</td>
                <td className="left">{e.dorm}</td>
                <td>{PICK_LABEL[e.pickType] ?? (e.pickType || '-')}{e.pickPlace ? ` / ${e.pickPlace}` : ''}</td>
                <td><PayText pay={e.pay} /></td>
                <td className={e.status === 'current' ? 'strong' : 'muted'} style={e.status === 'current' ? { color: 'var(--primary)' } : undefined}>{e.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {latest && (
        <div className="row">
          <Panel title="기숙사" extra={<Link className="more" to="/dorm">배정 현황 &gt;</Link>}>
            <table className="kv">
              <tbody>
                <tr><th scope="row">타입</th><td>{latest.dormStay?.type || latest.dorm || '-'}</td></tr>
                <tr><th scope="row">캠퍼스</th><td>{latest.dormStay?.campus || latest.campus}</td></tr>
                <tr><th scope="row">입실 / 퇴실</th><td>{latest.dormStay ? `${latest.dormStay.from} / ${latest.dormStay.to}` : `${latest.start} / ${latest.end}`}</td></tr>
                <tr>
                  <th scope="row">방 정리</th>
                  <td className={latest.roomClear ? 'text-blue' : 'text-red'}>{latest.roomClear ? '완료' : '미완료'}</td>
                </tr>
              </tbody>
            </table>
          </Panel>

          <Panel title="회계">
            {latest.invoice ? (
              <table className="tbl center" style={{ minWidth: 400 }}>
                <thead>
                  <tr><th>구분</th><th className="left">항목</th><th>금액</th><th>상태</th></tr>
                </thead>
                <tbody>
                  <tr><td>학비</td><td className="left">입금 매칭 합계</td><td className="num strong">{latest.invoice.currency} {fmt(latest.invoice.paid)}</td><td><PayText pay={latest.pay} /></td></tr>
                  <tr>
                    <td>포인트</td>
                    <td className="left">충전 {fmt(latest.invoice.pointIn)} / 사용 {fmt(latest.invoice.pointOut)}</td>
                    <td className="num">{fmt(latest.invoice.pointBalance)} P</td>
                    <td className={latest.pointClear ? 'text-blue' : 'text-red'}>{latest.pointClear ? '정산 완료' : '정산 전'}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="muted">인보이스 기록이 없습니다.</div>
            )}
          </Panel>
        </div>
      )}

      {data.enrollments.filter((e) => e.points.length > 0).map((en) => (
        <Panel key={en.trId} title={<>포인트 내역 <small>({en.batch} · {en.start} ~ {en.end} · {en.points.length}건 · 1P = 1페소)</small></>}>
          <table className="tbl center" style={{ minWidth: 720 }}>
            <thead>
              <tr><th>일시</th><th>구분</th><th className="left">항목</th><th>금액(P)</th><th>잔액(P)</th><th>처리</th><th className="left">메모</th></tr>
            </thead>
            <tbody>
              {(() => {
                let bal = 0;
                return en.points.map((p, i) => {
                  const delta = p.kind === '충전' ? p.amount : -p.amount; // 사용이 음수면 환불
                  bal += delta;
                  return (
                    <tr key={i}>
                      <td className="nowrap">{p.dt}</td>
                      <td className={p.kind === '충전' ? 'text-blue' : ''}>{p.kind}</td>
                      <td className="left">{p.item || '-'}</td>
                      <td className="num">{delta > 0 ? '+' : ''}{fmt(delta)}</td>
                      <td className="num strong">{fmt(bal)}</td>
                      <td className="muted">{p.staff}</td>
                      <td className="left memo-text">{p.memo}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </Panel>
      ))}

      <Panel title={<>메모 <small>({memos.length}건)</small></>}>
        <table className="tbl" style={{ minWidth: 720 }}>
          <thead>
            <tr><th style={{ width: 110 }}>구분</th><th>내용</th><th style={{ width: 100 }}>배치</th></tr>
          </thead>
          <tbody>
            {memos.length === 0 && <tr className="empty"><td colSpan={3}>메모가 없습니다.</td></tr>}
            {memos.map((m, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }} className="muted">{m.kind}</td>
                <td className="memo-text">{m.text}</td>
                <td style={{ textAlign: 'center' }} className="muted">{m.batch || m.start}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
