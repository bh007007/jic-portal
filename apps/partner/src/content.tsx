import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { byCountryOrder, useLoad } from './data';
import { must, supabase } from './supabase';
import { CAMPUS_LABEL, MEDIA_BUCKET, type ContentItem, type ContentKind } from './contentKinds';
import { Sheet } from './consult/Sheet';
import { byTime, focusPos, listUpdate, str, textOf, youtubeId } from './contentText';

export { byTime, dayMatches, focusPos, listUpdate, str, textOf, youtubeId } from './contentText';
import { t } from './i18n';
import { Loading, PageHead } from './ui';

/**
 * 관리자 포털 '파트너 포털 관리'에서 넣은 화면 콘텐츠(partner_content_items, CL-045)를 에이전시 포털에서 읽는다.
 * - 게시된 것만(직원이 미리 봐도 에이전시와 같게). 노출 국가는 DB 정책이 거르고, 국가별 순서(CL-036)는 여기서 다시 줄 세운다.
 * - 언어별 문구(P7): 지금 화면은 한국어만이라 한국어 칸을 쓴다. 언어를 고를 수 있게 되면 textOf 에 언어를 넘긴다.
 * - 게시 전(아무것도 없으면)은 '준비 중'(C8), 화면 위에 '기준일 · 다음 업데이트 예정'(CL-054).
 */
export async function loadItems(kinds: ContentKind[]): Promise<ContentItem[]> {
  const rows = await must<ContentItem[]>(supabase.from('partner_content_items').select('*').in('kind', kinds).eq('status', 'published'));
  // 순서 칸(작은 수 먼저) → 최근에 고친 것 먼저
  return rows.sort((a, b) => a.sort - b.sort || b.updated_at.localeCompare(a.updated_at));
}

export function useItems(...kinds: ContentKind[]) {
  const { member } = useAuth();
  const r = useLoad(() => loadItems(kinds), [kinds.join(',')]);
  return { ...r, data: r.data ? byCountryOrder(r.data, member?.country) : null };
}

export const campusName = (id: string) => (id ? CAMPUS_LABEL[id] ?? id : '');

export function UpdateLine({ items }: { items: Pick<ContentItem, 'updated_on' | 'next_update'>[] }) {
  const s = listUpdate(items);
  return s ? <span className="update-line">{s}</span> : null;
}

/** 콘텐츠 화면의 공통 틀: 제목 + 기준일, 불러오는 중, 게시 전 '준비 중' */
export function ContentPage({ title, items, error, children, intro }: { title: string; items: ContentItem[] | null; error?: string | null; children: ReactNode; intro?: ReactNode }) {
  if (!items) return <><PageHead title={title} /><Loading error={error} /></>;
  return (
    <>
      <PageHead title={title} side={<UpdateLine items={items} />} />
      {intro}
      {items.length === 0 ? <div className="state">{t('common.preparing')}입니다. JIC가 내용을 확인한 뒤 게시합니다.</div> : children}
    </>
  );
}

/** 캠퍼스 고르기(전체 + 목록에 있는 캠퍼스) */
export function useCampusFilter(items: ContentItem[] | null) {
  const [campus, setCampus] = useState('');
  const ids = [...new Set((items ?? []).map((i) => i.campus).filter(Boolean))];
  const bar = ids.length > 1 ? (
    <div className="filter-row" role="group" aria-label="캠퍼스">
      {['', ...ids].map((c) => (
        <button key={c || 'all'} type="button" className={'btn btn-sm' + (campus === c ? ' btn-primary' : '')} onClick={() => setCampus(c)}>{c ? campusName(c) : '전체'}</button>
      ))}
    </div>
  ) : null;
  // 공통('') 항목은 어느 캠퍼스를 골라도 보인다
  const match = (it: ContentItem) => !campus || !it.campus || it.campus === campus;
  return { campus, bar, match };
}

/** 같은 화면에서 재생(CL-047·명세 2장 ③). 영상 파일은 포털에 없고 유튜브에서 재생한다 */
export function YouTube({ url, title }: { url: string; title: string }) {
  const id = youtubeId(url);
  if (!id) return <a className="btn" href={url} target="_blank" rel="noreferrer">영상 열기 ↗</a>;
  return (
    <div className="video-frame">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`}
        title={title}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export const youtubeThumb = (url: string) => {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
};

/** 영상 카드(JIC Play·홈·상담 ③이 같이 씀). 누르면 onOpen */
export function VideoCard({ it, onOpen }: { it: ContentItem; onOpen: () => void }) {
  const { title, body } = textOf(it);
  const thumb = youtubeThumb(str(it, 'youtube'));
  const meta = [campusName(it.campus), str(it, 'type'), str(it, 'length')].filter(Boolean).join(' · ');
  return (
    <button type="button" className="card video-card" onClick={onOpen}>
      <span className="video-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : null}<span className="play" aria-hidden="true">▶</span></span>
      <strong>{title}</strong>
      {meta && <span className="muted" style={{ fontSize: 12.5 }}>{meta}</span>}
      {body && <span className="clamp-2" style={{ fontSize: 13, color: 'var(--ink-2)' }}>{body}</span>}
    </button>
  );
}

/** 학생의 하루 시간표(예시 학생, CL-030) */
export function DayTimeline({ items }: { items: ContentItem[] }) {
  return (
    <ol className="day-list">
      {[...items].sort(byTime).map((it) => {
        const { title, body } = textOf(it);
        return (
          <li key={it.id}>
            <span className="time">{str(it, 'time')}</span>
            <div>
              <strong>{title}</strong>
              {body && <div className="pre muted" style={{ fontSize: 13 }}>{body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 비공개 저장소(partner-media) 파일의 서명 주소. 에이전시는 게시된 사진·캠프가 가리키는 파일만 열린다(저장소 정책) */
export async function signMedia(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(list, seconds);
  const out: Record<string, string> = {};
  for (const x of data ?? []) if (x.signedUrl && x.path) out[x.path] = x.signedUrl;
  return out;
}

export interface Photo { it: ContentItem; url: string }

/** 사진 보관함(CL-047)에서 화면 위치에 맞는 게시된 사진. campus 를 주면 그 캠퍼스 + 공통 사진 */
export async function loadPhotos(placements: string[], campus?: string | null): Promise<Photo[]> {
  const items = (await loadItems(['photo'])).filter(
    (it) => placements.includes(str(it, 'placement')) && (!campus || !it.campus || it.campus === campus) && str(it, 'path'),
  );
  const urls = await signMedia(items.map((it) => str(it, 'path')));
  return items.filter((it) => urls[str(it, 'path')]).map((it) => ({ it, url: urls[str(it, 'path')] }));
}

/** 화면에서 쓰는 사진 묶음. 못 읽어도 화면은 그대로(사진만 안 나옴) */
export function usePhotos(placements: string[], campus?: string | null) {
  const { member } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const key = placements.join(',') + '|' + (campus ?? '');
  useEffect(() => {
    let alive = true;
    loadPhotos(placements, campus)
      .then((p) => alive && setPhotos(p))
      .catch(() => alive && setPhotos([]));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // 국가별 순서(CL-036)
  const ordered = byCountryOrder(photos.map((p) => ({ ...p, country_order: p.it.country_order })), member?.country);
  return ordered.map(({ it, url }) => ({ it, url }));
}

/** 사진 모음: 중심점(focus)에 맞춰 잘라 보이고, 누르면 같은 화면 위에 크게(설명 포함) */
export function PhotoGrid({ photos, max, ratio = '4 / 3', className }: { photos: Photo[]; max?: number; ratio?: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const shown = max ? photos.slice(0, max) : photos;
  const cur = open === null ? null : photos[open];
  return (
    <>
      <div className={'photo-grid ' + (className ?? '')}>
        {shown.map((p, i) => (
          <button key={p.it.id} type="button" className="photo" style={{ aspectRatio: ratio }} onClick={() => setOpen(i)} aria-label={textOf(p.it).title || '사진 크게 보기'}>
            <img src={p.url} alt={textOf(p.it).title} loading="lazy" style={{ objectPosition: focusPos(p.it) }} />
          </button>
        ))}
      </div>
      {cur && (
        <Sheet title={textOf(cur.it).title || campusName(cur.it.campus) || '사진'} onClose={() => setOpen(null)}>
          <img src={cur.url} alt={textOf(cur.it).title} style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }} />
          {photos.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(((open ?? 0) - 1 + photos.length) % photos.length)}>‹ 이전</button>
              <span className="muted" style={{ fontSize: 13 }}>{(open ?? 0) + 1} / {photos.length}</span>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(((open ?? 0) + 1) % photos.length)}>다음 ›</button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** 카드 맨 위 사진 한 장(캠퍼스 카드 등) */
export function CoverPhoto({ photo, ratio = '16 / 9' }: { photo?: Photo; ratio?: string }) {
  if (!photo) return null;
  return (
    <span className="cover-photo" style={{ aspectRatio: ratio }}>
      <img src={photo.url} alt={textOf(photo.it).title} loading="lazy" style={{ objectPosition: focusPos(photo.it) }} />
    </span>
  );
}

/** 캠퍼스 카드 사진: '캠퍼스 카드' 위치가 먼저, 없으면 '캠퍼스 대표'(준비 중 캠퍼스의 미리보기 사진 등) */
export const campusCover = (photos: Photo[], campusId: string) =>
  photos.find((p) => p.it.campus === campusId && str(p.it, 'placement') === 'campus_card') ?? photos.find((p) => p.it.campus === campusId && str(p.it, 'placement') === 'campus_hero');
