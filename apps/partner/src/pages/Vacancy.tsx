import { loadSettings, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, OutLink, PageHead } from '../ui';

// 6.1 공실 확인: 업체 포털 공실 화면으로 연결 (로그인 없이 열림)
export default function Vacancy() {
  const { data, error } = useLoad(loadSettings);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={t('nav.vacancy')} />
      <Box>
        <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <OutLink href={data.vacancy_url} className="btn btn-primary btn-lg">공실 화면 열기</OutLink>
          <p style={{ margin: 0 }}>공실은 실시간으로 바뀝니다. 최종 확정은 JIC 담당자 확인이 필요합니다.</p>
        </div>
      </Box>
    </>
  );
}
