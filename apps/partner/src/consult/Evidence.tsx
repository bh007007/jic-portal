import { useEffect, useState } from 'react';
import { YouTube, signMedia, str, textOf } from '../content';
import type { ContentItem } from '../contentKinds';
import { Sheet } from './Sheet';

const isImage = (url: string) => /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url);

/**
 * 추천 이유의 '증거 보기'(CL-050, 명세 3장): 같은 화면 위에 크게 열리는 창. 사진(사진 보관함, 서명 주소)·영상(JIC Play, 같은 화면 재생)·근거 자료(리포트·양식 이미지).
 * 다른 메뉴나 새 창으로 가지 않고, 닫으면 같은 자리로.
 */
export default function EvidenceSheet({ title, items, onClose }: { title: string; items: ContentItem[]; onClose: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    signMedia(items.filter((it) => it.kind === 'photo').map((it) => str(it, 'path'))).then(setUrls).catch(() => setUrls({}));
  }, [items]);
  return (
    <Sheet title={`증거 · ${title}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((it) => {
          const { title: t, body } = textOf(it);
          const file = str(it, 'file_url');
          return (
            <figure key={it.id} style={{ margin: 0 }}>
              {it.kind === 'photo' && (urls[str(it, 'path')] ? <img src={urls[str(it, 'path')]} alt={t} style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }} /> : <div className="state">사진을 불러오는 중…</div>)}
              {it.kind === 'video' && <YouTube url={str(it, 'youtube')} title={t} />}
              {it.kind === 'evidence' && file && (isImage(file)
                ? <img src={file} alt={t} style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }} />
                : <a className="btn" href={file} target="_blank" rel="noreferrer">자료 열기 ↗</a>)}
              {(t || body) && (
                <figcaption style={{ marginTop: 8 }}>
                  {t && <strong>{t}</strong>}
                  {body && <div className="pre muted" style={{ fontSize: 13.5 }}>{body}</div>}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
    </Sheet>
  );
}
