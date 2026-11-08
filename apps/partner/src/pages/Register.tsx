import { loadSettings, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, OutLink, PageHead, Text } from '../ui';

// 7.1 등록 안내: 입학 일정·절차·서류·문의처. 실제 접수는 업체 포털에서 한다.
export default function Register() {
  const { data, error } = useLoad(loadSettings);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={t('nav.register')} side={<OutLink href={data.register_url} className="btn btn-primary">업체 포털 등록 화면</OutLink>} />
      <Box title="입학 일정 · 신청 절차 · 필요 서류 · 문의처">
        <div className="box-body" style={{ lineHeight: 1.8 }}><Text value={data.register_guide} /></div>
      </Box>
      {data.contact_email && <p className="muted" style={{ margin: 0 }}>파트너 문의: <a href={`mailto:${data.contact_email}`}>{data.contact_email}</a></p>}
    </>
  );
}
