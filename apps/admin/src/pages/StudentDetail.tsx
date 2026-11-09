import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fmt, useApi, type InvoiceDetail, type InvoiceItem, type StudentDetail as Detail } from '../api';
import { Loading, PageTitle, Panel, PayText } from '../components/ui';
import LmsScores from '../components/LmsScores';

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
              <Fragment key={e.trId}>
                <tr>
                  <td>{data.enrollments.length - i}</td>
                  <td>{e.batch || '-'}</td>
                  <td>
                    {e.start} ~ {e.end} ({e.weeks}주)
                    {e.extensions.length > 0 && <div className="muted" style={{ fontSize: 12 }}>원래 종료 {e.origEnd} · 연장 {e.extensions.length}회</div>}
                  </td>
                  <td>{e.campus}</td>
                  <td className="left">{e.course}</td>
                  <td className="left">{e.dorm}</td>
                  <td>{PICK_LABEL[e.pickType] ?? (e.pickType || '-')}{e.pickPlace ? ` / ${e.pickPlace}` : ''}</td>
                  <td><PayText pay={e.pay} /></td>
                  <td className={e.status === 'current' ? 'strong' : 'muted'} style={e.status === 'current' ? { color: 'var(--primary)' } : undefined}>{e.state}</td>
                </tr>
                {e.extensions.map((x, k) => (
                  <tr key={x.ttId} style={{ fontSize: 12 }}>
                    <td />
                    <td className="muted">연장 {k + 1}</td>
                    <td>{x.start} ~ {x.end} ({x.weeks}주)</td>
                    <td colSpan={4} className="left muted">등록 {x.registered || '-'}{x.memo ? ` · ${x.memo}` : ''}</td>
                    <td colSpan={2} className="num">{x.price ? `${x.currency} ${fmt(x.price)}` : '-'}{x.paid ? ` (입금 ${fmt(x.paid)})` : ''}</td>
                  </tr>
                ))}
              </Fragment>
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
                  <tr>
                    <td rowSpan={3 + (latest.invoice.parts.length > 1 ? latest.invoice.parts.length : 0)}>학비</td>
                    <td className="left">
                      인보이스 총액
                      {latest.invoice.extensionInvoices > 0 && (
                        <span className="muted" style={{ fontSize: 12 }}> ({latest.invoice.totalPartial ? '최근 인보이스만' : `기본 + 연장 ${latest.invoice.extensionInvoices}`})</span>
                      )}
                    </td>
                    <td className="num">{latest.invoice.currency} {fmt(latest.invoice.total)}</td>
                    <td rowSpan={3 + (latest.invoice.parts.length > 1 ? latest.invoice.parts.length : 0)}><PayText pay={latest.pay} /></td>
                  </tr>
                  {latest.invoice.parts.length > 1 &&
                    latest.invoice.parts.map((p) => (
                      <tr key={p.label} style={{ fontSize: 12 }}>
                        <td className="left muted" style={{ paddingLeft: 20 }}>{p.label} {p.start && `${p.start} ~ ${p.end}`}</td>
                        <td className="num muted">{fmt(p.total)}{p.paid ? ` (입금 ${fmt(p.paid)})` : ''}</td>
                      </tr>
                    ))}
                  <tr><td className="left">입금 매칭 합계</td><td className="num strong">{latest.invoice.currency} {fmt(latest.invoice.paid)}</td></tr>
                  <tr>
                    <td className="left">미입금</td>
                    <td className={'num' + (latest.invoice.remaining ? ' text-red' : ' muted')}>{latest.invoice.currency} {fmt(latest.invoice.remaining)}</td>
                  </tr>
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

      {latest?.invoiceDetail && latest.invoice && (
        // 항목은 기본 인보이스의 것이라, 연장이 있으면 기본 인보이스 금액과 맞춰 본다.
        <InvoiceItems
          d={latest.invoiceDetail}
          currency={latest.invoice.currency}
          total={latest.invoice.parts.length > 1 ? latest.invoice.parts[0].total : latest.invoice.total}
          totalLabel={latest.invoice.parts.length > 1 ? '기본 인보이스' : '인보이스 총액'}
        />
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

      <LmsScores stId={stId} />

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

/** 최신 연수의 인보이스 항목: 학생 가격 − 에이전시 공제, 현지 비용(PHP). 업체 '현지 인보이스 납부 > 편집' 화면과 같은 값. */
function InvoiceItems({ d, currency, total, totalLabel }: { d: InvoiceDetail; currency: string; total: number; totalLabel: string }) {
  const period = (i: InvoiceItem) => [i.weeks ? `${i.weeks}주` : '', i.from && i.to ? `${i.from} ~ ${i.to}` : ''].filter(Boolean).join(' · ');
  const money = (c: string, n: number) => `${c || currency} ${fmt(n)}`;
  const net = d.itemsTotal - d.agencyTotal;
  return (
    <Panel title={<>인보이스 항목 <small>(최신 연수{d.version != null ? ` · 버전 ${d.version}` : ''})</small></>}>
      <table className="tbl center" style={{ minWidth: 720 }}>
        <thead>
          <tr><th>구분</th><th className="left">항목</th><th className="left">내용</th><th className="left">기간</th><th className="num">금액</th></tr>
        </thead>
        <tbody>
          {d.items.map((i, k) => (
            <tr key={'s' + k}>
              {k === 0 && <td rowSpan={d.items.length}>학생 가격</td>}
              <td className="left">{i.label}</td>
              <td className="left">{i.name || '-'}</td>
              <td className="left nowrap" style={{ fontSize: 12 }}>{period(i) || '-'}</td>
              <td className={'num' + (i.amount < 0 ? ' text-blue' : '')}>{money(i.currency, i.amount)}</td>
            </tr>
          ))}
          {d.agency.map((i, k) => (
            <tr key={'a' + k}>
              {k === 0 && <td rowSpan={d.agency.length}>에이전시 공제</td>}
              <td className="left">{i.label}</td>
              <td className="left">-</td>
              <td className="left">-</td>
              <td className="num">− {money(i.currency, i.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th colSpan={4} className="left">학생 가격 합계</th><td className="num">{money('', d.itemsTotal)}</td></tr>
          {d.agency.length > 0 && <tr><th colSpan={4} className="left">에이전시 공제 합계</th><td className="num">− {money('', d.agencyTotal)}</td></tr>}
          <tr><th colSpan={4} className="left">학생 가격 − 공제</th><td className="num strong">{money('', net)}</td></tr>
          <tr><th colSpan={4} className="left">{totalLabel}</th><td className={'num' + (net === total ? ' muted' : ' strong')}>{money('', total)}</td></tr>
        </tfoot>
      </table>

      {d.local.length > 0 && (
        <table className="tbl center" style={{ minWidth: 720, marginTop: 14 }}>
          <thead>
            <tr><th>구분</th><th className="left">항목</th><th className="num">청구</th><th className="num">남은 금액</th></tr>
          </thead>
          <tbody>
            {d.local.map((l, k) => (
              <tr key={'l' + k}>
                {k === 0 && <td rowSpan={d.local.length}>현지 비용</td>}
                <td className="left">{l.label}</td>
                <td className="num">{l.currency} {fmt(l.amount)}</td>
                <td className={'num' + (l.rest > 0 ? ' text-red' : ' muted')}>{fmt(l.rest)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th colSpan={2} className="left">현지 청구 합계</th><td className="num">{d.local[0]?.currency} {fmt(d.localTotal)}</td><td /></tr>
            <tr><th colSpan={2} className="left">현지 납부 합계</th><td className="num">{d.local[0]?.currency} {fmt(d.localPaidTotal)}</td><td /></tr>
          </tfoot>
        </table>
      )}
    </Panel>
  );
}
