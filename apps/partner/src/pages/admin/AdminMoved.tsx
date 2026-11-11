import { useLocation } from 'react-router-dom';
import { adminUrl, type AdminMenu } from '../../adminPortal';
import { Box, PageHead } from '../../ui';

// 예전 에이전시 포털 관리자 주소 → 관리자 포털 '파트너 포털 관리'의 메뉴·탭(CL-045)
const LINKS: { old: string; menu: AdminMenu; tab: string; label: string }[] = [
  { old: '/admin', menu: 'accounts', tab: '', label: '가입 승인' },
  { old: '/admin/members', menu: 'accounts', tab: 'members', label: '지점 계정' },
  { old: '/admin/rules', menu: 'consult', tab: '', label: '추천 규칙' },
  { old: '/admin/content', menu: 'content', tab: '', label: '캠퍼스·코스 내용' },
  { old: '/admin/resources', menu: 'media', tab: 'downloads', label: '다운로드 센터' },
  { old: '/admin/notices', menu: 'notices', tab: '', label: '공지·프로모션' },
  { old: '/admin/visits', menu: 'visits', tab: '', label: '방문 신청' },
  { old: '/admin/stats', menu: 'stats', tab: '', label: '사용 통계' },
  { old: '/admin/settings', menu: 'stats', tab: 'links', label: '링크·안내 설정' },
];
const MENU_LABEL: Record<AdminMenu, string> = {
  accounts: '지점 계정', consult: '상담 설정', content: '화면 콘텐츠', media: '사진·영상', notices: '공지·일정', visits: '방문 신청', stats: '통계·설정',
};

/**
 * 에이전시 포털의 관리자 화면은 11/10 모두 JIC 관리자 포털 '파트너 포털 관리' 메뉴로 옮겼다(docs/leo-todo.md D-4 1·2단계).
 * 11/11 메뉴는 7개(CL-045): 지점 계정 / 상담 설정 / 화면 콘텐츠 / 사진·영상 / 공지·일정 / 방문 신청 / 통계·설정.
 * 예전 주소(/admin, /admin/rules …)로 들어오면 이 안내가 보인다.
 */
export default function AdminMoved() {
  const { pathname } = useLocation();
  const here = LINKS.find((l) => l.old === pathname.replace(/\/$/, '')) ?? LINKS[0];
  const menus = [...new Set(LINKS.map((l) => l.menu))];
  return (
    <>
      <PageHead title="관리자" />
      <Box title="관리자 포털로 옮겼습니다">
        <div className="box-body">
          <p style={{ marginTop: 0 }}>
            에이전시 포털의 관리 화면은 이제 JIC 관리자 포털의 <strong>파트너 포털 관리</strong> 메뉴에 있습니다. 같은 직원 계정으로 로그인합니다.
          </p>
          <p>
            <a className="btn btn-primary" href={adminUrl(here.menu, here.tab)}>{here.label} 열기 ↗</a>
          </p>
          {menus.map((menu) => (
            <div key={menu} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 100 }}>{MENU_LABEL[menu]}</span>
              {LINKS.filter((l) => l.menu === menu).map((l) => (
                <a key={l.old} className="btn btn-sm" href={adminUrl(l.menu, l.tab)}>{l.label}</a>
              ))}
            </div>
          ))}
        </div>
      </Box>
    </>
  );
}
