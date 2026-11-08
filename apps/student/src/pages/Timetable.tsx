import { SubTitle } from '../components/Layout';
import { useI18n } from '../i18n';

// 시간표는 업체 포털 추출본에 없고 LMS 연결 후 붙인다(docs/student-app.md).
export default function Timetable() {
  const { t } = useI18n();
  return (
    <>
      <SubTitle title={t('short.timetable')} back="/" />
      <p className="state-msg">{t('tt.notReady')}</p>
    </>
  );
}
