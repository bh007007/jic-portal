import { ContentPage, PhotoGrid, campusName, str, textOf, useCampusFilter, useItems, usePhotos } from '../../content';
import { CAMPUS_LABEL } from '../../contentKinds';
import { t, type MsgKey } from '../../i18n';
import { Box } from '../../ui';
import { toneOf } from '../../tone';

/** 소개 › JIC 소개 › 왜 바기오·주변 / 왜 JIC(명세 4.3 'JIC 소개'의 섹션). 사진은 사진 보관함(CL-047) 단계에서 붙인다 */
export function AboutSection({ section, titleKey }: { section: string; titleKey: MsgKey }) {
  const { data, error } = useItems('about');
  const items = data ? data.filter((it) => str(it, 'section') === section) : null;
  // 사진 보관함의 '바기오'·'왜 JIC' 사진(CL-047)
  const photos = usePhotos([section === '왜 JIC' ? 'why_jic' : 'baguio']);
  return (
    <ContentPage title={t(titleKey)} items={items} error={error}>
      <PhotoGrid photos={photos} max={6} className="wide" />
      {(items ?? []).map((it) => {
        const { title, body } = textOf(it);
        return (
          <Box key={it.id} title={title}>
            <div className="box-body pre" style={{ lineHeight: 1.75 }}>{body}</div>
          </Box>
        );
      })}
    </ContentPage>
  );
}

/** 소개 › JIC 소개 › 선생님: 캠퍼스별로 묶는다 */
export function Teachers() {
  const { data, error } = useItems('teacher');
  const { bar, match } = useCampusFilter(data);
  const list = (data ?? []).filter(match);
  const groups = Object.keys(CAMPUS_LABEL).filter((c) => list.some((it) => it.campus === c));
  return (
    <ContentPage title={t('menu.teachers')} items={data} error={error}>
      {bar && <div className="box box-body filter-box">{bar}</div>}
      {groups.map((c) => (
        <Box key={c || 'common'} title={campusName(c) || '공통'}>
          <div className="box-body">
            <div className="cards">
              {list.filter((it) => it.campus === c).map((it) => (
                <div key={it.id} className="card" data-tone={toneOf(it.campus)}>
                  <strong style={{ fontSize: 17 }}>{textOf(it).title}</strong>
                  {str(it, 'subject') && <span className="muted" style={{ fontSize: 13 }}>{str(it, 'subject')}</span>}
                  {str(it, 'intro') && <span style={{ fontSize: 14 }}>{str(it, 'intro')}</span>}
                </div>
              ))}
            </div>
          </div>
        </Box>
      ))}
    </ContentPage>
  );
}

/** 소개 › JIC 소개 › 학교 현황(명세 4.7 '학교 현황 통계'): 확인된 값만 게시. 항목마다 기준일 */
export function SchoolStats() {
  const { data, error } = useItems('school_stat');
  return (
    <ContentPage title={t('menu.school')} items={data} error={error}>
      <Box>
        <div className="box-body scroll">
          <table className="tbl">
            <thead><tr><th>캠퍼스</th><th className="left">항목</th><th className="left">값</th><th>기준일</th></tr></thead>
            <tbody>
              {(data ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="muted">{campusName(it.campus) || '전체'}</td>
                  <td className="left strong">{textOf(it).title}</td>
                  <td className="left pre">{str(it, 'value')}</td>
                  <td>{str(it, 'as_of')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </ContentPage>
  );
}
