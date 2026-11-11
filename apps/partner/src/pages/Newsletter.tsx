import { loadSettings, useLoad } from '../data';
import { UpdateLine, str, textOf, useItems } from '../content';
import { t } from '../i18n';
import { Box, Loading, OutLink, PageHead } from '../ui';

// 학교와 소통 > 뉴스레터(CL-037). 호마다 제목·발행일·링크는 관리자 포털 '공지·일정 › 뉴스레터'(CL-045)에서 넣는다.
// CL-034: 노션에서 만든 확정본을 국가별로 포털에서 발송하는 것은 메일 서비스(R-008)가 정해진 뒤(해야 할 일 T-08).
// 호 목록이 아직 없으면 지금처럼 링크·안내 설정의 최신호·지난 호 링크만 둔다(원칙 P5).
export default function Newsletter() {
  const settings = useLoad(loadSettings);
  const issues = useItems('newsletter');
  if (!settings.data || !issues.data) return <Loading error={settings.error ?? issues.error} />;
  const list = [...issues.data].sort((a, b) => str(b, 'issued_on').localeCompare(str(a, 'issued_on')));
  const s = settings.data;
  return (
    <>
      <PageHead title={t('menu.newsletter')} side={<UpdateLine items={list} />} />
      <Box title={t('menu.newsletter')}>
        {list.length === 0 ? (
          <div className="box-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <OutLink href={s.newsletter_latest}>최신호 보기</OutLink>
            <OutLink href={s.newsletter_archive}>지난 호</OutLink>
          </div>
        ) : (
          <ul className="list">
            {list.map((it, i) => (
              <li key={it.id}>
                <span className="tag" style={{ color: i === 0 ? 'var(--accent)' : 'var(--ink-2)' }}>{i === 0 ? '최신호' : ''}</span>
                <a className="title" href={str(it, 'url')} target="_blank" rel="noreferrer">{textOf(it).title} ↗</a>
                <span className="date">{str(it, 'issued_on')}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>
      {list.length > 0 && s.newsletter_archive && (
        <p style={{ margin: '0 2px' }}><OutLink href={s.newsletter_archive} className="btn btn-sm">지난 호 전체</OutLink></p>
      )}
    </>
  );
}
