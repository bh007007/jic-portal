import { Box } from '../../ui';

// 관리자 포털 주소(배포는 JIC 포털 Pages 의 /admin/, 로컬은 관리자 앱 개발 서버). 도메인을 바꾸면 VITE_ADMIN_PORTAL_URL 로 덮어쓴다.
const ADMIN_PORTAL =
  (import.meta.env.VITE_ADMIN_PORTAL_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/admin/' : 'https://jic-portal-916.pages.dev/admin/');
const url = (tab: string) => `${ADMIN_PORTAL.replace(/\/?$/, '/')}agency-portal${tab ? `?tab=${tab}` : ''}`;

/**
 * 가입 승인·지점 계정·방문 신청·사용 통계는 11/10 관리자 포털 '에이전시 › 에이전시 포털 관리'로 옮겼다(docs/leo-todo.md D-4 1단계).
 * 직원이 관리자 포털 한 번 로그인으로 처리한다. 예전 주소(/admin, /admin/members …)로 들어오면 이 안내가 보인다.
 */
export default function AdminMoved() {
  return (
    <Box title="관리자 포털로 옮겼습니다">
      <div className="box-body">
        <p style={{ marginTop: 0 }}>가입 승인·지점 계정·방문 신청·사용 통계는 이제 JIC 관리자 포털의 <strong>에이전시 › 에이전시 포털 관리</strong>에서 합니다. 같은 직원 계정으로 로그인합니다.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="btn btn-primary" href={url('')}>가입 승인</a>
          <a className="btn" href={url('members')}>지점 계정</a>
          <a className="btn" href={url('visits')}>방문 신청</a>
          <a className="btn" href={url('stats')}>사용 통계</a>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>추천 규칙·캠퍼스·코스 내용·자료실·공지·링크 설정은 옮기기 전까지 이 화면 위 메뉴에 있습니다.</p>
      </div>
    </Box>
  );
}
