import { useState } from 'react';
import { Link } from 'react-router-dom';
import { campusName, ContentPage, useItems } from '../../content';
import { faqCategories, faqMatch, str, textOf } from '../../contentText';
import { t } from '../../i18n';
import { screenTitle } from '../../menu';

/**
 * 상담 › 상담 자료 › FAQ(CL-030·037 메뉴, 11/12 레오님 결정: 입력은 관리자 포털 '파트너 포털 관리 › 화면 콘텐츠 › FAQ').
 * 질문을 누르면 답이 펼쳐진다. 분야별 거르기와 검색. 지점 직원 아이디도 본다(STAFF_PATHS).
 * 노출 국가·순서·언어별 문구는 다른 화면 콘텐츠와 같다(명세 4.0). 게시 전이면 '준비 중'.
 */
export default function Faq() {
  const { data, error } = useItems('faq');
  const [cat, setCat] = useState('');
  const [kw, setKw] = useState('');
  const cats = faqCategories(data ?? []);
  const list = (data ?? []).filter((it) => faqMatch(it, cat, kw));

  return (
    <ContentPage title={t('menu.faq')} items={data} error={error}>
      <div className="box box-body filter-box">
        {cats.length > 1 && (
          <div className="filter-row" role="group" aria-label="분야">
            {['', ...cats].map((c) => (
              <button key={c || 'all'} type="button" className={'btn btn-sm' + (cat === c ? ' btn-primary' : '')} onClick={() => setCat(c)}>{c || '모든 분야'}</button>
            ))}
          </div>
        )}
        <input className="input" style={{ maxWidth: 260, marginLeft: 'auto', height: 32 }} placeholder="질문 검색" aria-label="질문 검색" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <div className="state">고른 조건에 맞는 질문이 없습니다.</div>
      ) : (
        <div className="faq">
          {list.map((it) => {
            const { title, body } = textOf(it);
            const link = str(it, 'link');
            return (
              <details key={it.id} className="box faq-item">
                <summary>
                  <span className="faq-q">{title}</span>
                  {str(it, 'category') && <span className="faq-cat">{str(it, 'category')}</span>}
                  {it.campus && <span className="faq-cat">{campusName(it.campus)}</span>}
                </summary>
                <div className="faq-a">
                  {body && <p className="pre">{body}</p>}
                  {/* 포털 안 주소(/로 시작)면 그 화면으로, 아니면 글 그대로 */}
                  {link && (link.startsWith('/') ? <Link to={link}>{screenTitle(link)} ›</Link> : <p className="pre muted">{link}</p>)}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </ContentPage>
  );
}
