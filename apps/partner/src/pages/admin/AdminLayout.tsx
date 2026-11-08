import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PageHead } from '../../ui';

const MENU: [string, string][] = [
  ['/admin', '계정 승인'],
  ['/admin/members', '지점 계정'],
  ['/admin/rules', '추천 규칙'],
  ['/admin/content', '캠퍼스·코스 내용'],
  ['/admin/resources', '자료실'],
  ['/admin/notices', '공지·프로모션'],
  ['/admin/visits', '방문 신청'],
  ['/admin/stats', '사용 통계'],
  ['/admin/settings', '링크·안내 설정'],
];

// 12 관리자 (JIC 전용). 직원(staff_users)만 들어온다.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHead title="관리자" side={<span>다국어 문구 관리(12.8)는 준비 중</span>} />
      <nav className="admin-nav" aria-label="관리자 메뉴">
        {MENU.map(([to, label]) => (
          <NavLink key={to} to={to} end>{label}</NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
