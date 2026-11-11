import { useState, type ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { today } from '../../data';
import { Box, Msg, PageHead } from '../../ui';
import { STATUS_TABS, sampleStudents, type SampleStudent, type StudentStatus } from './sample';

/**
 * My Students(CL-051, 화면 명세 6장). 데이터 연동은 2차(P6): 지금은 메뉴와 화면 모양만, 모든 학생은 가짜 예시이고 화면마다 '예시'·'2차 연동 예정'을 보인다.
 * 연동되면 자기 지점 학생만(업체 담당자 번호 tr_am_id ↔ 지점 계정 legacy_am_id), 졸업 후 2주까지. 사유가 담긴 패널티 내용·학생 사진(동의 전)은 보이지 않는다.
 * 비용(인보이스·납부)은 지점 대표만(CL-032·051). 지금은 메뉴 자체가 대표만이다(11/10 결정, 2차에 직원에게 열지는 leo-todo).
 */
function Notice() {
  return (
    <Msg kind="info">
      <strong>2차 연동 예정</strong> · 지금 보이는 학생은 모두 <strong>예시(가짜 데이터)</strong>입니다. 연동되면 우리 지점 학생만 보이고, 졸업한 학생은 졸업 후 2주까지 보입니다.
    </Msg>
  );
}
const Sample = () => <span className="chip">예시</span>;

function StudentsNav() {
  return (
    <nav className="filter-row" aria-label="My Students">
      <NavLink end to="/students" className={({ isActive }) => 'btn btn-sm' + (isActive ? ' btn-primary' : '')}>학생 목록</NavLink>
      <NavLink to="/students/arrivals" className={({ isActive }) => 'btn btn-sm' + (isActive ? ' btn-primary' : '')}>입학·픽업 일정</NavLink>
    </nav>
  );
}

function Frame({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHead title="My Students" side={<StudentsNav />} />
      <Notice />
      <Box title={<>{title} <Sample /></>}>{children}</Box>
    </>
  );
}

/** 학생 목록: 탭(입학 예정·재학·졸업·취소), 이름·캠퍼스·코스·기간·입학일 */
export function StudentList() {
  const all = sampleStudents(today());
  const [tab, setTab] = useState<StudentStatus>('current');
  const list = all.filter((s) => s.status === tab);
  return (
    <Frame title="학생 목록">
      <div className="box-body" style={{ paddingBottom: 0 }}>
        <div className="filter-row" role="tablist" aria-label="학생 상태">
          {STATUS_TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={'btn btn-sm' + (tab === k ? ' btn-primary' : '')} onClick={() => setTab(k)}>
              {label} {all.filter((s) => s.status === k).length}
            </button>
          ))}
        </div>
      </div>
      <div className="box-body scroll">
        {list.length === 0 ? <p className="empty">학생이 없습니다.</p> : (
          <table className="tbl center">
            <thead><tr><th className="left">이름</th><th>캠퍼스</th><th className="left">코스</th><th>기간</th><th>입학일</th><th>종료일</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="left strong"><Link to={`/students/${s.id}`}>{s.name}</Link></td>
                  <td>{s.campus}</td>
                  <td className="left">{s.course}</td>
                  <td>{s.weeks + (s.extension?.weeks ?? 0)}주{s.extension && <span className="muted" style={{ fontSize: 12 }}> (연장 {s.extension.weeks}주)</span>}</td>
                  <td>{s.start}</td>
                  <td>{s.extension?.end ?? s.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Frame>
  );
}

/** 입학·픽업 일정: 도착일·항공편·픽업 여부·입학일(입학 예정 + 최근 재학) */
export function Arrivals() {
  const list = sampleStudents(today()).filter((s) => s.status === 'upcoming' || s.status === 'current').sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Frame title="입학·픽업 일정">
      <div className="box-body scroll">
        <table className="tbl center">
          <thead><tr><th className="left">이름</th><th>입학일</th><th>도착일·시각</th><th>항공편</th><th className="left">공항</th><th>픽업</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td className="left strong"><Link to={`/students/${s.id}`}>{s.name}</Link><div className="muted" style={{ fontSize: 12 }}>{s.campus} · {s.course}</div></td>
                <td>{s.start}</td>
                {s.arrival ? (
                  <>
                    <td>{s.arrival.date} {s.arrival.time}</td>
                    <td>{s.arrival.flight}</td>
                    <td className="left">{s.arrival.airport}</td>
                    <td className={s.arrival.pickup ? 'strong' : 'muted'}>{s.arrival.pickup ? '픽업' : '없음'}</td>
                  </>
                ) : <td colSpan={4} className="text-amber">항공편 정보를 아직 받지 못했습니다</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

const DETAIL_TABS = [['course', '연수'], ['study', '학업'], ['life', '생활'], ['cost', '비용']] as const;
type DetailTab = (typeof DETAIL_TABS)[number][0];

/** 학생 상세: 연수 / 학업 / 생활 / 비용(대표만) */
export function StudentDetail() {
  const { id } = useParams();
  const { agencyStaff } = useAuth();
  const s = sampleStudents(today()).find((x) => x.id === id);
  const [tab, setTab] = useState<DetailTab>('course');
  if (!s) return <Frame title="학생 상세"><p className="empty">예시 학생을 찾을 수 없습니다. <Link to="/students">학생 목록</Link></p></Frame>;
  // 비용은 지점 대표만(CL-032·051)
  const tabs = DETAIL_TABS.filter(([k]) => k !== 'cost' || !agencyStaff);
  return (
    <Frame title={<>{s.name} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{s.campus} · {s.course} · {STATUS_TABS.find(([k]) => k === s.status)?.[1]}</span></>}>
      <div className="box-body" style={{ paddingBottom: 0 }}>
        <div className="filter-row" role="tablist" aria-label="학생 상세">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={'btn btn-sm' + (tab === k ? ' btn-primary' : '')} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="box-body">
        {tab === 'course' && <CourseTab s={s} />}
        {tab === 'study' && <StudyTab s={s} />}
        {tab === 'life' && <LifeTab s={s} />}
        {tab === 'cost' && !agencyStaff && <CostTab s={s} />}
      </div>
      <div className="box-foot"><Link to="/students">‹ 학생 목록</Link></div>
    </Frame>
  );
}

function CourseTab({ s }: { s: SampleStudent }) {
  return (
    <table className="kv">
      <tbody>
        <tr><th>코스 · 단계</th><td>{s.course}{s.level !== '-' && ` · ${s.level}`}</td></tr>
        <tr><th>기숙사</th><td>{s.dorm}</td></tr>
        <tr><th>기간</th><td>{s.start} ~ {s.end} ({s.weeks}주)</td></tr>
        <tr><th>연장</th><td>{s.extension ? `${s.extension.weeks}주 연장 · ${s.extension.end}까지` : '없음'}</td></tr>
      </tbody>
    </table>
  );
}

function StudyTab({ s }: { s: SampleStudent }) {
  if (s.status === 'upcoming' || s.status === 'cancelled') return <p className="empty">입학 뒤에 출석·성적이 보입니다.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={{ margin: '0 0 8px' }}>출석 요약</h3>
        {s.attendance ? (
          <div className="stat-row">
            <div><span className="muted">출석률</span><strong>{s.attendance.rate}%</strong></div>
            <div><span className="muted">결석</span><strong>{s.attendance.absent}</strong></div>
            <div><span className="muted">지각</span><strong>{s.attendance.late}</strong></div>
            <div><span className="muted">수업</span><strong>{s.attendance.total}</strong></div>
          </div>
        ) : <span className="muted">-</span>}
      </div>
      <div>
        <h3 style={{ margin: '0 0 8px' }}>성적 · 레벨 (CEFR)</h3>
        {s.tests.length > 0 && (
          <div className="cefr-steps" aria-label="CEFR 변화">
            {s.tests.map((t, i) => <span key={t.date}>{i > 0 && <span className="arrow">→</span>}<b>{t.cefr}</b></span>)}
          </div>
        )}
        <table className="tbl center">
          <thead><tr><th>날짜</th><th className="left">시험</th><th>점수</th><th>CEFR</th></tr></thead>
          <tbody>{s.tests.map((t) => <tr key={t.date}><td>{t.date}</td><td className="left">{t.name}</td><td>{t.score}</td><td className="strong">{t.cefr}</td></tr>)}</tbody>
        </table>
      </div>
      <div>
        <h3 style={{ margin: '0 0 8px' }}>그로스 리포트</h3>
        {s.reports.length === 0 ? <span className="muted">-</span> : (
          <ul className="list" style={{ padding: 0 }}>
            {s.reports.map((r) => <li key={r.month + r.title}><span className="title">{r.title}</span><span className="date">{r.month}</span><span className="chip">준비 중</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function LifeTab({ s }: { s: SampleStudent }) {
  return (
    <table className="kv">
      <tbody>
        <tr><th>패널티 합계</th><td>{s.penalty ? `${s.penalty.points}점` : '-'}</td></tr>
        <tr><th>경고 단계</th><td>{s.penalty?.stage ?? '-'} <span className="muted" style={{ fontSize: 12 }}>· 사유는 보이지 않습니다(P6)</span></td></tr>
        <tr><th>사진</th><td><span className="muted">학생이 동의하면 보입니다</span> <span className="chip">준비 중</span></td></tr>
      </tbody>
    </table>
  );
}

function CostTab({ s }: { s: SampleStudent }) {
  return (
    <>
      <table className="tbl center">
        <thead><tr><th>인보이스</th><th className="left">항목</th><th>금액</th><th>납부</th></tr></thead>
        <tbody>
          {s.invoices.map((v) => (
            <tr key={v.no}>
              <td>{v.no}</td>
              <td className="left">{v.item}</td>
              <td className="muted">{v.amount}</td>
              <td className={v.status === '완납' ? 'text-green strong' : v.status === '미납' ? 'text-red' : 'text-amber'}>{v.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>지점 대표 아이디만 보입니다. 인보이스·서류 화면은 R7 결정 뒤에 만듭니다.</p>
    </>
  );
}
