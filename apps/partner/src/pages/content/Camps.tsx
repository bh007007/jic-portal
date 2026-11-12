import { useState, type CSSProperties } from 'react';
import { ContentPage, PhotoGrid, campusName, signMedia, str, textOf, useItems, usePhotos } from '../../content';
import { MEDIA_BUCKET } from '../../contentKinds';
import { supabase } from '../../supabase';
import type { ContentItem } from '../../contentKinds';
import { Sheet } from '../../consult/Sheet';
import { t } from '../../i18n';
import { toneOf } from '../../tone';
import { useAuth } from '../../auth';
import { campItemsFor } from '../../campusCards';

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
 * 캠퍼스 › 캠프(CL-077 11/12: '코스·생활 › 캠프' 메뉴는 삭제, 캠퍼스 목록의 '캠프' 카드로 들어온다. CL-053의 카드·브로슈어·추천 제외는 그대로).
 * 캠프 순서는 지점 국가별(한국: 패밀리캠프(Premium)·가족연수·주니어캠프(MCO) / 그 밖: 가족연수·주니어캠프(MCO)·주니어캠프(Premium)), 그다음 모집 상태.
 * 캠프 카드 + 브로슈어 PDF 화면 안에서 보기·내려받기·링크 복사. 가격은 브로슈어 안에만 있고 화면 글에는 쓰지 않는다.
 * 대상 국가는 공통 칸 '노출 국가'(DB 정책이 거름). 업로드 일자는 최종 업데이트일(없으면 처음 넣은 날).
 * 브로슈어는 관리자 포털에서 올린 PDF(비공개 저장소, 서명 주소)가 먼저, 없으면 브로슈어 주소(드라이브 등). 위에는 사진 보관함의 '캠프' 사진.
 */
export default function Camps() {
  const { data, error } = useItems('camp');
  const { member } = useAuth();
  const typeOrder = campItemsFor(member?.country);
  const [pdf, setPdf] = useState<{ it: ContentItem; url: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const photos = usePhotos(['camp']);
  const path = (it: ContentItem) => str(it, 'brochure_path');
  const has = (it: ContentItem) => !!(path(it) || str(it, 'brochure_url'));
  // 올린 PDF는 서명 주소(보기 1시간, 복사한 링크는 7일), 아니면 입력한 주소
  const urlOf = async (it: ContentItem, seconds = 3600) => (path(it) ? (await signMedia([path(it)], seconds))[path(it)] ?? '' : str(it, 'brochure_url'));
  const view = async (it: ContentItem) => {
    setErr('');
    const url = await urlOf(it);
    if (!url) return setErr('브로슈어를 열지 못했습니다. 잠시 뒤 다시 해 보세요.');
    setPdf({ it, url });
  };
  const download = async (it: ContentItem) => {
    setErr('');
    if (!path(it)) return void window.open(str(it, 'brochure_url'), '_blank', 'noopener');
    const name = str(it, 'brochure_path_name') || `${textOf(it).title}.pdf`;
    const { data: signed, error: e } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path(it), 300, { download: name });
    if (e || !signed) return setErr('브로슈어를 내려받지 못했습니다.');
    window.location.href = signed.signedUrl;
  };
  const rank = (it: ContentItem) => {
    const i = STATE_ORDER.indexOf(str(it, 'state'));
    return i < 0 ? STATE_ORDER.length : i;
  };
  const typeRank = (it: ContentItem) => {
    const i = typeOrder.indexOf(str(it, 'type'));
    return i < 0 ? typeOrder.length : i;
  };
  const list = [...(data ?? [])].sort((a, b) => typeRank(a) - typeRank(b) || rank(a) - rank(b));
  const copy = async (it: ContentItem) => {
    const url = await urlOf(it, 7 * 24 * 3600);
    if (!url) return setErr('링크를 만들지 못했습니다.');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(it.id);
      setTimeout(() => setCopied(''), 2500);
    } catch {
      window.prompt('브로슈어 링크를 복사하세요', url);
    }
  };

  return (
    <ContentPage title={t('menu.camps')} items={data} error={error}>
      <PhotoGrid photos={photos} max={8} className="wide" />
      {err && <div className="msg err" role="alert">{err}</div>}
      <div className="cards">
        {list.map((it) => {
          const points = str(it, 'points').split('\n').map((s) => s.trim()).filter(Boolean);
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
                {has(it) ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => view(it)}>브로슈어 보기</button>
                    <button type="button" className="btn btn-sm" onClick={() => download(it)}>내려받기</button>
                    <button type="button" className="btn btn-sm" onClick={() => copy(it)} title={path(it) ? '복사한 링크는 7일 동안 열립니다' : undefined}>{copied === it.id ? (path(it) ? '복사했습니다(7일)' : '복사했습니다') : '링크 복사'}</button>
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
        <Sheet title={`${textOf(pdf.it).title} 브로슈어`} onClose={() => setPdf(null)}>
          <iframe className="pdf-frame" src={frameUrl(pdf.url)} title={`${textOf(pdf.it).title} 브로슈어`} />
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            화면에 보이지 않으면 <a href={pdf.url} target="_blank" rel="noreferrer">새 탭에서 열기 ↗</a>
          </p>
        </Sheet>
      )}
    </ContentPage>
  );
}
