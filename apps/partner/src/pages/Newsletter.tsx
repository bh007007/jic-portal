import { loadSettings, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, OutLink, PageHead } from '../ui';

// 학교와 소통 > 뉴스레터(CL-037). CL-034: 노션에서 만든 확정본을 국가별로 포털에서 발송하는 것은 메일 서비스(R-008)가 정해진 뒤.
// 그 전까지는 지금처럼 외부 발행본 링크만 둔다(원칙 P5).
export default function Newsletter() {
  const { data, error } = useLoad(loadSettings);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={t('menu.newsletter')} />
      <Box title={t('menu.newsletter')}>
        <div className="box-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <OutLink href={data.newsletter_latest}>최신호 보기</OutLink>
          <OutLink href={data.newsletter_archive}>지난 호</OutLink>
        </div>
      </Box>
    </>
  );
}
