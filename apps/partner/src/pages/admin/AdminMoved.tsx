import { useLocation } from 'react-router-dom';
import { adminUrl } from '../../adminPortal';
import { Box, PageHead } from '../../ui';

// 예전 에이전시 포털 관리자 주소 → 관리자 포털의 화면·탭
const LINKS: { old: string; page: 'agency-portal' | 'agency-content'; tab: string; label: string }[] = [
  { old: '/admin', page: 'agency-portal', tab: '', label: '가입 승인' },
  { old: '/admin/members', page: 'agency-portal', tab: 'members', label: '지점 계정' },
  { old: '/admin/visits', page: 'agency-portal', tab: 'visits', label: '방문 신청' },
  { old: '/admin/stats', page: 'agency-portal', tab: 'stats', label: '사용 통계' },
  { old: '/admin/rules', page: 'agency-content', tab: '', label: '추천 규칙' },
  { old: '/admin/content', page: 'agency-content', tab: 'content', label: '캠퍼스·코스 내용' },
  { old: '/admin/resources', page: 'agency-content', tab: 'resources', label: '자료실' },
  { old: '/admin/notices', page: 'agency-content', tab: 'notices', label: '공지·프로모션' },
  { old: '/admin/settings', page: 'agency-content', tab: 'settings', label: '링크·안내 설정' },
];

/**
 * 에이전시 포털의 관리자 화면은 11/10 모두 JIC 관리자 포털 '파트너 포털 관리' 메뉴로 옮겼다(docs/leo-todo.md D-4 1·2단계, CL-025).
 * 메뉴 그룹 '파트너 포털 관리'(CL-025): 가입 승인·지점 계정·방문 신청·사용 통계는 '계정·방문·통계', 추천 규칙·캠퍼스·코스 내용·자료실·공지·링크 설정은 '추천·콘텐츠·공지'.
 * 예전 주소(/admin, /admin/rules …)로 들어오면 이 안내가 보인다.
 */
export default function AdminMoved() {
  const { pathname } = useLocation();
  const here = LINKS.find((l) => l.old === pathname.replace(/\/$/, '')) ?? LINKS[0];
  const group = (page: string) => LINKS.filter((l) => l.page === page);
  return (
    <>
      <PageHead title="관리자" />
      <Box title="관리자 포털로 옮겼습니다">
        <div className="box-body">
          <p style={{ marginTop: 0 }}>
            에이전시 포털의 관리 화면은 이제 JIC 관리자 포털의 <strong>파트너 포털 관리</strong> 메뉴에 있습니다. 같은 직원 계정으로 로그인합니다.
          </p>
          <p>
            <a className="btn btn-primary" href={adminUrl(here.page, here.tab)}>{here.label} 열기 ↗</a>
          </p>
          {(['agency-portal', 'agency-content'] as const).map((page) => (
            <div key={page} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 130 }}>{page === 'agency-portal' ? '계정·방문·통계' : '추천·콘텐츠·공지'}</span>
              {group(page).map((l) => (
                <a key={l.old} className="btn btn-sm" href={adminUrl(l.page, l.tab)}>{l.label}</a>
              ))}
            </div>
          ))}
        </div>
      </Box>
    </>
  );
}
