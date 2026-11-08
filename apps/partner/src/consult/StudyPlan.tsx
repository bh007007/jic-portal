import type { Member } from '../auth';
import type { Course, CourseContent, RuleSet } from '../data';
import { answerLabel, type Answers } from './engine';

interface Props {
  set: RuleSet;
  answers: Answers;
  course: Course;
  campusName: string;
  alt: Course | null;
  level: string | null;
  weeks: number | null;
  content?: CourseContent;
  quote: { currency: string; amount: string; memo: string };
  member: Member | null;
  onBack: () => void;
  onDownload: () => void;
}

const firstLine = (s?: string | null) => (s ?? '').split('\n')[0];

// 2.6 학습계획서: A4 1~2장. 'PDF로 저장'은 브라우저 인쇄 창에서 'PDF로 저장'을 고른다. 학생 정보 입력란은 없다.
export default function StudyPlan({ set, answers, course, campusName, alt, level, weeks, content, quote, member, onBack, onDownload }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const courseUrl = `${location.origin}/courses/${course.id}`;
  const print = () => {
    onDownload();
    window.print();
  };
  const mail = () => {
    onDownload();
    const subject = encodeURIComponent(`JIC 학습계획서 · ${course.name}`);
    const body = encodeURIComponent('학습계획서 PDF를 첨부해 보내 주세요.\n\n코스 상세: ' + courseUrl);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <>
      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" className="btn btn-lg" onClick={onBack}>‹ 이전</button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-lg" onClick={mail}>메일 프로그램 열기</button>
          <button type="button" className="btn btn-lg" onClick={print}>프린트</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={print}>PDF 다운로드</button>
        </div>
      </div>
      <p className="no-print muted" style={{ margin: 0, fontSize: 12 }}>
        PDF 다운로드를 누르면 인쇄 창이 열립니다. 대상을 'PDF로 저장'으로 고르세요. 학생이 동의하면 에이전시 메일에 직접 첨부해 보냅니다.
      </p>

      <article className="plan" aria-label="학습계획서 미리보기">
        <div className="plan-head">
          <h1>학습계획서</h1>
          <span><strong style={{ color: 'var(--brand)', fontStyle: 'italic', fontWeight: 900 }}>JIC</strong> · {today}</span>
        </div>

        <h2>학생 상담 결과</h2>
        <table className="kv">
          <tbody>
            {set.questions.map((q) => (
              <tr key={q.id}><th>{q.label}</th><td>{answerLabel(set, q.id, answers[q.id])}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>추천 코스</h2>
        <table className="kv">
          <tbody>
            <tr><th>1순위</th><td><strong>{campusName} · {course.name}{level ? ` ${level}` : ''}</strong></td></tr>
            {alt && <tr><th>대안</th><td>{alt.name}</td></tr>}
            <tr><th>권장 기간</th><td>{weeks ? `${weeks}주` : '-'}{answers.weeks && weeks && Number(answers.weeks) !== weeks ? ` (희망 ${answers.weeks}주)` : ''}</td></tr>
          </tbody>
        </table>

        <h2>추천 이유</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>수업 방식</strong> {firstLine(content?.reason_learning) || '-'}</li>
          <li><strong>성장 확인</strong> {firstLine(content?.reason_growth) || '-'}</li>
          <li><strong>학습 환경</strong> {firstLine(content?.reason_environment) || '-'}</li>
        </ul>

        <h2>견적</h2>
        <p style={{ margin: 0 }}>
          {quote.amount ? <strong>{quote.currency} {quote.amount}</strong> : '견적 사이트에서 확인'}
          {quote.memo && <span className="pre"> · {quote.memo}</span>}
        </p>

        <h2>자세히 보기</h2>
        <p style={{ margin: 0 }}>{courseUrl}</p>

        <p className="muted" style={{ marginTop: 20, fontSize: 11 }}>
          최종 반 배정은 입학 테스트와 운영 조건에 따릅니다. 견적은 작성일 기준이며 확정 금액은 인보이스로 안내합니다.
          {member ? ` · 상담: ${member.agency_name}${member.branch ? ' ' + member.branch : ''}` : ''}
        </p>
      </article>
    </>
  );
}
