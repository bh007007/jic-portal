import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createLife, useApi, type LifeCategory, type LifeList } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { errorText, useI18n } from '../i18n';

/** 생활 요청 쓰기(업체 '요청사항(학생)'·'ID 카드 교체'): 종류 + 내용. */
export default function LifeNew() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<LifeList>('/api/life-requests');
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <SubTitle title={t('life.title')} />
      {!data.canRequest ? (
        <p className="state-msg">{t('life.noEnrollment')}</p>
      ) : (
        <LifeForm list={data} onDone={(id) => navigate(`/requests/life/${id}`, { replace: true })} />
      )}
    </>
  );
}

function LifeForm({ list, onDone }: { list: LifeList; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [category, setCategory] = useState<LifeCategory | ''>('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!category) {
      setError(errorText(t, 'invalid_category'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rec = await createLife({ category, content });
      onDone(rec.id);
    } catch (err) {
      setError(errorText(t, (err as ApiError).code, { n: list.contentMax }));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset className="form-field">
        <legend>{t('life.category')}</legend>
        <div className="chips">
          {list.categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? 'on' : ''}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setError(null);
              }}
            >
              {t(`life.cat.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-field">
        <label htmlFor="life-content">{t('life.content')}</label>
        <textarea id="life-content" rows={5} required maxLength={list.contentMax} placeholder={t('life.contentPh')} value={content} onChange={(e) => setContent(e.target.value)} />
        <span className="form-hint right">
          {content.length} / {list.contentMax}
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t('form.submitting') : t('form.submit')}
      </button>
      <p className="form-hint">{t('life.openLimit', { n: list.openMax })}</p>
    </form>
  );
}
