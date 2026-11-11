import { useState, type CSSProperties } from 'react';
import { ContentPage, campusName, str, textOf, useItems } from '../../content';
import type { ContentItem } from '../../contentKinds';
import { Sheet } from '../../consult/Sheet';
import { t } from '../../i18n';
import { toneOf } from '../../tone';

// 구글 드라이브 '보기' 주소는 화면 안에 넣을 수 없어 미리보기 주소로 바꾼다
const frameUrl = (url: string) => url.replace(/^(https:\/\/drive\.google\.com\/file\/d\/[\w-]+)\/(view|edit)\b.*$/, '$1/preview');

// 모집 중 → 마감 → 지난 시즌
const STATE_ORDER = ['모집 중', '마감', '지난 시즌'];
const STATE_STYLE: Record<string, CSSProperties> = {
  '모집 중': { background: 'var(--accent-tint)', color: 'var(--accent-ink)' },
  마감: { background: 'var(--surface-2)', color: 'var(--ink-2)' },
  '지난 시즌': { background: 'var(--surface-2)', color: 'var(--muted)' },
};

/**
 * 코스·생활 › 주니어·가족 캠프(CL-053, 명세 4.3 '캠프'). 상담 추천에는 나오지 않는다.
 * 캠프 카드 + 브로슈어 PDF 화면 안에서 보기·내려받기·링크 복사. 가격은 브로슈어 안에만 있고 화면 글에는 쓰지 않는다.
 * 대상 국가는 공통 칸 '노출 국가'(DB 정책이 거름). 업로드 일자는 최종 업데이트일(없으면 처음 넣은 날).
 */
export default function Camps() {
  const { data, error } = useItems('camp');
  const [pdf, setPdf] = useState<ContentItem | null>(null);
  const [copied, setCopied] = useState('');
  const rank = (it: ContentItem) => {
    const i = STATE_ORDER.indexOf(str(it, 'state'));
    return i < 0 ? STATE_ORDER.length : i;
  };
  const list = [...(data ?? [])].sort((a, b) => rank(a) - rank(b));
  const copy = async (it: ContentItem) => {
    try {
      await navigator.clipboard.writeText(str(it, 'brochure_url'));
      setCopied(it.id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('브로슈어 주소를 복사하세요', str(it, 'brochure_url'));
    }
  };

  return (
    <ContentPage title={t('menu.camps')} items={data} error={error}>
      <div className="cards">
        {list.map((it) => {
          const points = str(it, 'points').split('\n').map((s) => s.trim()).filter(Boolean);
          const url = str(it, 'brochure_url');
          const rows: [string, string][] = [
            ['시즌', str(it, 'season')], ['기간', str(it, 'period')], ['입학 가능일', str(it, 'start_dates')], ['대상', str(it, 'target')],
          ];
          return (
            <article key={it.id} className={'card' + (str(it, 'state') === '지난 시즌' ? ' off' : '')} data-tone={toneOf(it.campus)}>
              <div className="card-title">
                <strong>{textOf(it).title}</strong>
                {str(it, 'state') && <span className="chip" style={STATE_STYLE[str(it, 'state')]}>{str(it, 'state')}</span>}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>{str(it, 'type') || campusName(it.campus)}</span>
              {str(it, 'summary') && <span style={{ fontSize: 14.5 }}>{str(it, 'summary')}</span>}
              <table className="kv compact">
                <tbody>
                  {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
                  {it.countries.length > 0 && <tr><th>대상 국가</th><td>{it.countries.join(', ')}</td></tr>}
                </tbody>
              </table>
              {points.length > 0 && (
                <ul className="points">{points.slice(0, 3).map((p) => <li key={p}>{p}</li>)}</ul>
              )}
              <div className="camp-foot">
                {url ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setPdf(it)}>브로슈어 보기</button>
                    <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer" download>내려받기</a>
                    <button type="button" className="btn btn-sm" onClick={() => copy(it)}>{copied === it.id ? '복사했습니다' : '링크 복사'}</button>
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>브로슈어 준비 중</span>
                )}
                <span className="muted" style={{ fontSize: 12 }}>
                  {[str(it, 'version') && `버전 ${str(it, 'version')}`, `업로드 ${it.updated_on ?? it.updated_at.slice(0, 10)}`].filter(Boolean).join(' · ')}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {pdf && (
        <Sheet title={`${textOf(pdf).title} 브로슈어`} onClose={() => setPdf(null)}>
          <iframe className="pdf-frame" src={frameUrl(str(pdf, 'brochure_url'))} title={`${textOf(pdf).title} 브로슈어`} />
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            화면에 보이지 않으면 <a href={str(pdf, 'brochure_url')} target="_blank" rel="noreferrer">새 탭에서 열기 ↗</a>
          </p>
        </Sheet>
      )}
    </ContentPage>
  );
}
