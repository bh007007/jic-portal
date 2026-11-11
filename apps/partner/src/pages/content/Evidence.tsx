import { useState } from 'react';
import { ContentPage, campusName, str, textOf, useCampusFilter, useItems } from '../../content';
import type { ContentItem } from '../../contentKinds';
import { Sheet } from '../../consult/Sheet';
import { t } from '../../i18n';

const isImage = (url: string) => /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url);

/**
 * 상담 › 상담 자료 › 근거 자료(명세 4.2): 리포트·양식·사진 등 상담 때 보여 줄 근거. 이미지는 같은 화면 위에 크게, PDF·드라이브는 새 탭.
 * 추천 이유의 증거(CL-050)도 다음 단계에서 이 자료를 고른다.
 */
export default function Evidence() {
  const { data, error } = useItems('evidence');
  const { bar, match } = useCampusFilter(data);
  const [kw, setKw] = useState('');
  const [open, setOpen] = useState<ContentItem | null>(null);
  const k = kw.trim().toLowerCase();
  const list = (data ?? []).filter((it) => match(it) && (!k || `${textOf(it).title} ${textOf(it).body} ${str(it, 'course')}`.toLowerCase().includes(k)));

  return (
    <ContentPage title={t('menu.evidence')} items={data} error={error}>
      <div className="box box-body filter-box">
        {bar}
        <input className="input" style={{ maxWidth: 260, marginLeft: 'auto', height: 32 }} placeholder="근거 자료 검색" aria-label="근거 자료 검색" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <div className="state">고른 조건에 맞는 자료가 없습니다.</div>
      ) : (
        <div className="cards">
          {list.map((it) => {
            const { title, body } = textOf(it);
            const url = str(it, 'file_url');
            const meta = [campusName(it.campus), str(it, 'course')].filter(Boolean).join(' · ');
            return (
              <div key={it.id} className="card">
                {url && isImage(url) && (
                  <button type="button" className="evidence-thumb" onClick={() => setOpen(it)} aria-label={`${title} 크게 보기`}>
                    <img src={url} alt="" loading="lazy" />
                  </button>
                )}
                <strong>{title}</strong>
                {meta && <span className="muted" style={{ fontSize: 12.5 }}>{meta}</span>}
                {body && <span className="pre" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{body}</span>}
                {url && (
                  <div>
                    {isImage(url)
                      ? <button type="button" className="btn btn-sm" onClick={() => setOpen(it)}>크게 보기</button>
                      : <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">자료 열기 ↗</a>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {open && (
        <Sheet title={textOf(open).title} onClose={() => setOpen(null)}>
          <img src={str(open, 'file_url')} alt={textOf(open).title} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
          {textOf(open).body && <p className="pre" style={{ margin: '12px 0 0' }}>{textOf(open).body}</p>}
        </Sheet>
      )}
    </ContentPage>
  );
}
