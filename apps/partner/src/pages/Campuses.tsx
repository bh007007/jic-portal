import { loadCampuses, useLoad } from '../data';
import { useAuth } from '../auth';
import { t } from '../i18n';
import { Loading, PageHead } from '../ui';
import { usePhotos } from '../content';
import { CampusCards } from '../campusCards';

// 3.1 캠퍼스 목록(CL-077, 11/12): Premium · Challenger · 캠프. New Campus는 삭제. 캠퍼스 간 강제 비교는 하지 않고,
// 차이는 같은 메뉴의 '캠퍼스 한눈에 보기' 탭에서 우열 없이 나란히 보여 준다(CL-079)
export default function Campuses() {
  const { member, staff } = useAuth();
  const { data, error } = useLoad(loadCampuses);
  const photos = usePhotos(['campus_card', 'campus_hero', 'camp']); // 사진 보관함(CL-047)
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={t('menu.campuses')} />
      <CampusCards campuses={data} photos={photos} country={member?.country} staffView={!!staff && !member} />
    </>
  );
}
