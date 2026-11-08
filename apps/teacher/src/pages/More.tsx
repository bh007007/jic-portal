import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHead, Section } from '../ui';

// 메뉴 검토표 'LMS' 시트 순서. 업체 시간표·출석 데이터가 필요한 메뉴는 연결 뒤 연다(원칙 V1·V6, C8).
const PLANNED: [string, string][] = [
  ['출석 체크', '수업 중 휴대폰으로(원칙 L7). 업체 수업 시간표 연결 뒤'],
  ['출석 확인 · 사유별 합계', '출석 원본이 생기면'],
  ['결석 신청 승인', '지금은 인트라넷 › 신청 처리에서 한다(원칙 L4, 같은 DB 함수)'],
  ['무단결석 목록', '출석 원본이 생기면. 패널티 승인은 인트라넷'],
  ['그로스 리포트 · Daily Recall · IELTS 기록', '스피킹 리포트 사이트 연결 방식 결정 뒤(원칙 L10)'],
  ['녹음', '보관 기간 결정 뒤(원칙 L9)'],
  ['수업 변경 · 옵션 클래스', '스케줄러용. 업체 시간표 연결 뒤(원칙 L6)'],
];

export default function More() {
  const { me } = useAuth();
  return (
    <>
      <PageHead title="더보기" />
      {me?.isManager && (
        <Section title="관리 (매니저·직원)">
          <ul className="menu">
            <li><Link to="/tests">시험 종류 · CEFR 대응</Link></li>
            <li><Link to="/staff">강사 목록</Link></li>
          </ul>
        </Section>
      )}
      <Section title="준비 중">
        <ul className="planned">
          {PLANNED.map(([name, why]) => (
            <li key={name}>
              <strong>{name}</strong>
              <span className="muted small">{why}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
