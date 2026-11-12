import { useAuth } from '../auth';
import { loadItems, str, textOf } from '../content';
import { byCountryOrder, loadCampuses, useLoad } from '../data';
import { t } from '../i18n';
import { Loading, PageHead, Text } from '../ui';
import { toneOf } from '../tone';
import { CAMPUS_CARD_COURSES } from '../campusCards';

/**
 * 캠퍼스 › 캠퍼스 한눈에 보기(CL-079, 11/12). 교육 방향·분위기·코스·학생 구성을 우열 없이 나란히 보여 준다(직접 비교·순위는 하지 않음).
 * 교육 방향·분위기는 관리자 포털 '캠퍼스·코스 내용'의 캠퍼스 칸, 코스는 캠퍼스 카드와 같은 목록(CL-080),
 * 학생 구성은 '학교 현황 통계'(school_stat, 그 캠퍼스 것, 기준일과 함께). 가격은 넣지 않는다(CL-055, 학비표에서).
 */
export default function CampusCompare() {
  const { member } = useAuth();
  const { data, error } = useLoad(async () => ({
    campuses: await loadCampuses(),
    stats: await loadItems(['school_stat']).catch(() => []),
  }));
  if (!data) return <Loading error={error} />;
  const open = data.campuses.filter((c) => c.status === 'open');
  const stats = byCountryOrder(data.stats, member?.country);
  const rows: [string, (id: string) => JSX.Element][] = [
    ['교육 방향', (id) => <Text value={open.find((c) => c.id === id)?.direction} />],
    ['분위기', (id) => <Text value={open.find((c) => c.id === id)?.environment} />],
    ['코스', (id) => <span>{(CAMPUS_CARD_COURSES[id] ?? []).join(' · ') || t('common.empty')}</span>],
    [
      '학생 구성',
      (id) => {
        const mine = stats.filter((s) => s.campus === id);
        return mine.length ? (
          <ul className="plain">
            {mine.map((s) => (
              <li key={s.id}>
                {textOf(s).title}: {str(s, 'value')}
                {str(s, 'as_of') && <span className="muted"> ({str(s, 'as_of')} 기준)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">{t('common.preparing')}</span>
        );
      },
    ],
  ];
  return (
    <>
      <PageHead title={t('menu.campusCompare')} />
      <p className="page-intro">캠퍼스마다 교육 방향과 분위기가 다릅니다. 어느 쪽이 낫다는 뜻이 아니라, 학생에게 맞는 곳을 고르도록 차이를 나란히 보여 줍니다. 가격은 학비표에서 봅니다.</p>
      <div className="compare-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">항목</th>
              {open.map((c) => <th key={c.id} scope="col"><span className={`badge ${toneOf(c.id)}`}>{c.name}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {open.map((c) => <td key={c.id}>{cell(c.id)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
