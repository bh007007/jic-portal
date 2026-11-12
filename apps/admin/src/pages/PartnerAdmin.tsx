import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type { ContentKind } from '../../../partner/src/contentKinds';
import { supabase } from '../supabase';
import { PageTitle } from '../components/ui';
import { Members, Requests, Stats } from './AgencyPortal';
import Visits from './agency/Visits';
import Rules from './agency/Rules';
import Content from './agency/Content';
import Resources from './agency/Resources';
import Notices from './agency/Notices';
import Settings from './agency/Settings';
import ContentItems from './agency/ContentItems';
import Photos from './agency/Photos';
import Reasons from './agency/Reasons';

/**
 * 파트너 포털 관리 메뉴 7개(CL-045, 화면 명세 4장): 지점 계정 / 상담 설정 / 화면 콘텐츠 / 사진·영상 / 공지·일정 / 방문 신청 / 통계·설정.
 * 11/11까지의 두 메뉴('계정·방문·통계', '추천·콘텐츠·공지')를 하는 일 기준으로 나눴다. 화면 모양은 지금 관리 앱 모양(11/12 메뉴 확정 뒤 새 디자인, CL-041).
 * 메뉴별 권한(누가 보고 입력하는지)은 11/12 권한 정리에서 정한다(Q-4). 지금은 직원(is_staff) 모두.
 */
type Screen = { key: string; label: string; render: () => JSX.Element };
// 종류마다 새 화면(key): 탭을 바꾸면 입력 중이던 다른 종류의 칸·메시지가 남지 않게
const items = (kind: ContentKind) => () => <ContentItems key={kind} kind={kind} />;

export const PARTNER_MENUS: { key: string; label: string; screens: Screen[] }[] = [
  { key: 'accounts', label: '지점 계정', screens: [
    { key: 'requests', label: '가입 승인', render: () => <Requests /> },
    { key: 'members', label: '지점 계정', render: () => <Members /> },
  ] },
  { key: 'consult', label: '상담 설정', screens: [
    { key: 'rules', label: '추천 규칙', render: () => <Rules /> },
    { key: 'reasons', label: '추천 이유', render: () => <Reasons /> },
    { key: 'playbook', label: '플레이북', render: items('playbook') },
    { key: 'evidence', label: '근거 자료', render: items('evidence') },
  ] },
  { key: 'content', label: '화면 콘텐츠', screens: [
    { key: 'courses', label: '캠퍼스·코스 내용', render: () => <Content /> },
    { key: 'about', label: 'JIC 소개', render: items('about') },
    { key: 'teachers', label: '선생님', render: items('teacher') },
    { key: 'day', label: '학생의 하루', render: items('day') },
    { key: 'activities', label: '액티비티', render: items('activity') },
    { key: 'camps', label: '캠프', render: items('camp') },
    // FAQ(11/12 레오님 결정: 입력은 화면 콘텐츠, 에이전시 포털 '상담 자료 › FAQ')
    { key: 'faq', label: 'FAQ', render: items('faq') },
  ] },
  { key: 'media', label: '사진·영상', screens: [
    { key: 'photos', label: '사진 보관함', render: () => <Photos /> },
    { key: 'videos', label: 'JIC Play 영상', render: items('video') },
    { key: 'downloads', label: '다운로드 센터', render: () => <Resources /> },
  ] },
  { key: 'notices', label: '공지·일정', screens: [
    { key: 'notices', label: '공지·프로모션', render: () => <Notices /> },
    { key: 'newsletter', label: '뉴스레터', render: items('newsletter') },
    { key: 'events', label: '행사 일정', render: items('event') },
    { key: 'status', label: '캠퍼스 상태', render: items('campus_status') },
  ] },
  { key: 'visits', label: '방문 신청', screens: [
    { key: 'visits', label: '방문 신청', render: () => <Visits /> },
  ] },
  { key: 'stats', label: '통계·설정', screens: [
    { key: 'usage', label: '사용 통계', render: () => <Stats /> },
    { key: 'school', label: '학교 현황 통계', render: items('school_stat') },
    { key: 'links', label: '링크·안내', render: () => <Settings /> },
    { key: 'contacts', label: '담당자 연락처', render: items('contact') },
  ] },
];

export default function PartnerAdmin() {
  const { menu: key = 'accounts' } = useParams();
  const [params, setParams] = useSearchParams();
  const menu = PARTNER_MENUS.find((m) => m.key === key) ?? PARTNER_MENUS[0];
  const screen = menu.screens.find((s) => s.key === params.get('tab')) ?? menu.screens[0];
  const path = `홈 > 파트너 포털 관리 > ${menu.label}`;
  if (!supabase) {
    return (
      <>
        <PageTitle title={menu.label} path={path} />
        <div className="state-msg">에이전시 포털 내용은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 없습니다.</div>
      </>
    );
  }
  return (
    <>
      <PageTitle title={menu.label} path={path} />
      {menu.screens.length > 1 && (
        <div role="tablist" aria-label={menu.label} className="tabs">
          {menu.screens.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={screen.key === s.key} onClick={() => setParams(s.key === menu.screens[0].key ? {} : { tab: s.key }, { replace: true })}>
              {s.label}
            </button>
          ))}
          <div className="fill" />
        </div>
      )}
      {screen.render()}
    </>
  );
}

/** 11/11까지의 주소(/agency-portal, /agency-content)로 들어오면 새 메뉴로 보낸다(에이전시 포털의 '관리자 포털' 링크 등) */
const OLD: Record<string, Record<string, string>> = {
  'agency-portal': { '': 'accounts', requests: 'accounts', members: 'accounts?tab=members', visits: 'visits', stats: 'stats' },
  'agency-content': { '': 'consult', rules: 'consult', content: 'content', resources: 'media?tab=downloads', notices: 'notices', settings: 'stats?tab=links' },
};
export function OldPartnerRoute() {
  const { pathname, search } = useLocation();
  const page = pathname.replace(/^\/+/, '').split('/')[0];
  const tab = new URLSearchParams(search).get('tab') ?? '';
  return <Navigate to={`/partner/${OLD[page]?.[tab] ?? OLD[page]?.[''] ?? 'accounts'}`} replace />;
}
