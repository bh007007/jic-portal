import { Link } from 'react-router-dom';
import { useApi, type AbsenceList } from '../api';
import { AbsenceRow } from '../components/absence';
import { IconForm } from '../components/icons';
import { LoadError, Section } from '../components/Layout';
import { useI18n } from '../i18n';

export default function Requests() {
  const { t } = useI18n();
  const abs = useApi<AbsenceList>('/api/absences');
  return (
    <>
      <div className="page-head">
        <h1>{t('req.title')}</h1>
      </div>
      <div className="pad">
        <Link to="/requests/absence/new" className="btn btn-primary btn-block">
          <IconForm size={18} w={1.8} />
          {t('req.newAbsence')}
        </Link>
      </div>
      <Section labelId="hist-h" title={t('req.history')}>
        {abs.error ? (
          <LoadError onRetry={abs.reload} />
        ) : !abs.data ? (
          <p className="list-empty">{t('common.loading')}</p>
        ) : abs.data.rows.length === 0 ? (
          <p className="list-empty">{t('home.noAbsences')}</p>
        ) : (
          abs.data.rows.map((a) => <AbsenceRow key={a.id} a={a} />)
        )}
      </Section>
    </>
  );
}
