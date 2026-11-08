import { loadNotices } from '../data';
import { useT } from '../i18n';
import { Loading, PageHead, fmtDate, useLoad } from '../ui';

/**
 * 내부 공지(docs/roles.md: 강사·체커·스케줄러도 읽는다). 인트라넷에서 직원이 쓴 공지 중 게시 중인 것, 전체 공지 + 내 캠퍼스 공지.
 * 읽기만 한다. 쓰기·읽음 표시는 인트라넷(직원)에서 한다.
 */
export default function Notices() {
  const { t } = useT();
  const { data, error, loading } = useLoad(() => loadNotices(), []);

  return (
    <>
      <PageHead title={t('notices')} />
      {loading || error ? (
        <Loading error={error} />
      ) : (data ?? []).length === 0 ? (
        <div className="state">{t('noNotices')}</div>
      ) : (
        <ul className="cards">
          {(data ?? []).map((n) => (
            <li key={n.id}>
              <details className="notice">
                <summary>
                  <span className="card-top">
                    <strong>{n.title}</strong>
                    {n.pinned && <span className="muted small">{t('pinned')}</span>}
                  </span>
                  <span className="muted small">{[n.campus || t('allCampuses'), n.author_name, fmtDate(n.created_at)].join(' · ')}</span>
                </summary>
                <p className="notice-body">{n.content}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
