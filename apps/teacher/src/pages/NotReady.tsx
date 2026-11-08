import { Link } from 'react-router-dom';
import { useT } from '../i18n';

export default function NotReady({ title }: { title: string }) {
  const { t } = useT();
  return (
    <div className="state">
      <p><strong>{title}</strong>: {t('notReady')}</p>
      <Link to="/more">{t('more')}</Link>
    </div>
  );
}
