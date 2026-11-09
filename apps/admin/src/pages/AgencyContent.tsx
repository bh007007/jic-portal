import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { PageTitle } from '../components/ui';
import Rules from './agency/Rules';
import Content from './agency/Content';
import Resources from './agency/Resources';
import Notices from './agency/Notices';
import Settings from './agency/Settings';

/**
 * 에이전시 포털 콘텐츠(2단계, 11/10 결정 '에이전시 관리 화면을 관리자 포털로 옮긴다', docs/leo-todo.md D-4).
 * 에이전시 포털에 보이는 추천 규칙(조건표)·캠퍼스·코스 내용·자료실·공지·링크 설정을 관리자 포털 한 번 로그인으로 고친다.
 * 표와 권한은 에이전시 포털 표 그대로(직원 is_staff, RLS). 가입 승인·지점 계정·방문 신청·사용 통계는 '에이전시 포털 관리'(1단계).
 */
type Tab = 'rules' | 'content' | 'resources' | 'notices' | 'settings';
const TABS: [Tab, string][] = [['rules', '추천 규칙'], ['content', '캠퍼스·코스 내용'], ['resources', '자료실'], ['notices', '공지·프로모션'], ['settings', '링크·안내 설정']];
const PATH = '홈 > 에이전시 > 에이전시 포털 콘텐츠';

export default function AgencyContent() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'rules') as Tab;
  if (!supabase) {
    return (
      <>
        <PageTitle title="에이전시 포털 콘텐츠" path={PATH} />
        <div className="state-msg">에이전시 포털 내용은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 없습니다.</div>
      </>
    );
  }
  return (
    <>
      <PageTitle title="에이전시 포털 콘텐츠" path={PATH} />
      <div role="tablist" aria-label="에이전시 포털 콘텐츠" className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'rules' ? {} : { tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
        <div className="fill" />
      </div>
      {tab === 'rules' && <Rules />}
      {tab === 'content' && <Content />}
      {tab === 'resources' && <Resources />}
      {tab === 'notices' && <Notices />}
      {tab === 'settings' && <Settings />}
    </>
  );
}
