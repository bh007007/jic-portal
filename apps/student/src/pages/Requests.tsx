import { Link } from 'react-router-dom';
import { useApi, type AbsenceList, type LifeList, type OvernightList } from '../api';
import { AbsenceRow, LifeRowLink, OvernightRowLink } from '../components/absence';
import { IconCalendar, IconForm } from '../components/icons';
import { LoadError, Section } from '../components/Layout';
import { useI18n } from '../i18n';

export default function Requests() {
  const { t } = useI18n();
  const abs = useApi<AbsenceList>('/api/absences');
  const ov = useApi<OvernightList>('/api/overnights');
  const life = useApi<LifeList>('/api/life-requests');
  return (
    <>
      <div className="page-head">
        <h1>{t('req.title')}</h1>
      </div>
      <div className="pad btn-pair">
        <Link to="/requests/absence/new" className="btn btn-primary">
          <IconForm size={18} w={1.8} />
          {t('req.newAbsence')}
        </Link>
        <Link to="/requests/overnight/new" className="btn btn-primary">
          <IconForm size={18} w={1.8} />
          {t('req.newOvernight')}
        </Link>
        <Link to="/requests/life/new" className="btn btn-primary">
          <IconForm size={18} w={1.8} />
          {t('req.newLife')}
        </Link>
        <Link to="/trips" className="btn btn-primary">
          <IconCalendar size={18} w={1.8} />
          {t('req.trips')}
        </Link>
      </div>
      <Section labelId="hist-abs" title={t('req.absences')}>
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
      <Section labelId="hist-ov" title={t('req.overnights')}>
        {ov.error ? (
          <LoadError onRetry={ov.reload} />
        ) : !ov.data ? (
          <p className="list-empty">{t('common.loading')}</p>
        ) : ov.data.rows.length === 0 ? (
          <p className="list-empty">{t('home.noAbsences')}</p>
        ) : (
          ov.data.rows.map((o) => <OvernightRowLink key={o.id} o={o} />)
        )}
      </Section>
      <Section labelId="hist-life" title={t('req.life')}>
        {life.error ? (
          <LoadError onRetry={life.reload} />
        ) : !life.data ? (
          <p className="list-empty">{t('common.loading')}</p>
        ) : life.data.rows.length === 0 ? (
          <p className="list-empty">{t('home.noAbsences')}</p>
        ) : (
          life.data.rows.map((r) => <LifeRowLink key={r.id} r={r} />)
        )}
      </Section>
    </>
  );
}
