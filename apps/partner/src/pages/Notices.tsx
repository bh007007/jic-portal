import { Link, useSearchParams } from 'react-router-dom';
import { byCountryOrder, isActivePromotion, useLoad, type Notice } from '../data';
import { useAuth } from '../auth';
import { t } from '../i18n';
import { must, supabase } from '../supabase';
import { Box, Loading, PageHead, TAG_COLOR } from '../ui';

// 9.1 공지 / 9.2 프로모션 (기간이 끝난 프로모션은 '지난 프로모션'으로)
export default function Notices() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'notice';
  const { member } = useAuth();
  const { data, error } = useLoad(() =>
    must<Notice[]>(supabase.from('partner_notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false })),
  );
  if (!data) return <Loading error={error} />;
  const notices = data.filter((n) => n.kind === 'notice');
  const live = data.filter((n) => n.kind === 'promotion' && isActivePromotion(n));
  const past = data.filter((n) => n.kind === 'promotion' && !isActivePromotion(n));
  // 국가별 우선 순서(CL-036): 내 나라에 순서가 정해진 글이 먼저
  const list = byCountryOrder(tab === 'promotion' ? live : tab === 'past' ? past : notices, member?.country);

  return (
    <>
      <PageHead title={t('nav.notices')} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[['notice', `공지 (${notices.length})`], ['promotion', `진행 중 프로모션 (${live.length})`], ['past', `지난 프로모션 (${past.length})`]].map(([k, label]) => (
          <button key={k} type="button" className={'btn' + (tab === k ? ' btn-primary' : '')} onClick={() => setParams({ tab: k })}>{label}</button>
        ))}
      </div>
      <Box>
        {list.length === 0 ? (
          <p className="empty">{tab === 'notice' ? '등록된 공지가 없습니다.' : '프로모션이 없습니다.'}</p>
        ) : (
          <ul className="list">
            {list.map((n) => (
              <li key={n.id}>
                <span className="tag" style={{ color: TAG_COLOR[n.tag] ?? 'var(--ink-2)' }}>{n.pinned ? '[고정] ' : ''}{n.tag}</span>
                <Link className="title" to={`/notices/${n.id}`}>{n.title}</Link>
                <span className="date">{n.kind === 'promotion' ? `${n.starts_on ?? ''} ~ ${n.ends_on ?? ''}` : n.created_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </>
  );
}
