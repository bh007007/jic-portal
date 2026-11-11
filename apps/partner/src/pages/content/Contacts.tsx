import { ContentPage, campusName, str, textOf, useItems } from '../../content';
import { t } from '../../i18n';

/** 학교와 소통 › 담당자 연락처(명세 4.7): 이름, 담당 국가·캠퍼스, 역할, 연락 수단. 노출 국가로 지점 나라 담당자만 보이게 할 수 있다 */
export default function Contacts() {
  const { data, error } = useItems('contact');
  return (
    <ContentPage title={t('menu.contacts')} items={data} error={error}>
      <div className="cards">
        {(data ?? []).map((it) => (
          <div key={it.id} className="card">
            <div className="card-title"><strong>{textOf(it).title}</strong><span className="muted" style={{ fontSize: 12.5 }}>{str(it, 'role')}</span></div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {[str(it, 'countries_covered') && `담당 ${str(it, 'countries_covered')}`, campusName(it.campus)].filter(Boolean).join(' · ')}
            </span>
            {str(it, 'channels') && <span className="pre" style={{ fontSize: 14 }}>{str(it, 'channels')}</span>}
          </div>
        ))}
      </div>
    </ContentPage>
  );
}
