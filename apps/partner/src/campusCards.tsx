import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { campusCover, CoverPhoto, str, type Photo } from './content';
import type { Campus } from './data';
import { toneOf } from './tone';

/**
 * 캠퍼스 카드(홈·캠퍼스 목록 공용, CL-077·080, 11/12).
 * - 캠퍼스 목록은 Premium · Challenger · 캠프. New Campus는 삭제(브로슈어 기준, CL-077): '운영 중' 캠퍼스만 카드로 보인다
 * - 카드의 코스 목록은 CL-080 문구 그대로(이름은 견적 사이트 표기, CL-069). 추천 데이터의 코스는 조건표 V2.2 뒤 바뀐다(T-30)
 * - 캠프 카드 안은 지점 국가별(CL-077). 가격은 브로슈어 안에만, 상담 추천에서 빠지는 것은 CL-053 그대로
 */
export const CAMPUS_CARD_COURSES: Record<string, string[]> = {
  premium: ['Speaking Starter', 'Speaking Pro', 'Speaking Master', 'ESL TEP', 'Working Holiday 8', 'TOEIC', 'Business Master 8', 'Active Senior 5·6'],
  challenger: ['ESL', 'ESL Flex', 'IELTS', 'IELTS Guarantee'],
};

/** 캠프 카드 항목(CL-077): 한국 = 패밀리캠프(Premium) · 가족연수 · 주니어캠프(MCO), 그 밖의 국가 = 가족연수 · 주니어캠프(MCO) · 주니어캠프(Premium) */
export const CAMP_ITEMS_KR = ['패밀리캠프(Premium)', '가족연수', '주니어캠프(MCO)'];
export const CAMP_ITEMS_OTHER = ['가족연수', '주니어캠프(MCO)', '주니어캠프(Premium)'];
export const campItemsFor = (country?: string | null) => (country === '한국' ? CAMP_ITEMS_KR : CAMP_ITEMS_OTHER);

/** 캠프 화면 주소(캠퍼스 목록 안, '코스·생활 › 캠프' 메뉴는 삭제) */
export const CAMP_PATH = '/campuses/camp';

const campCover = (photos: Photo[]) =>
  photos.find((p) => p.it.campus === 'mco' && str(p.it, 'placement') === 'campus_card') ?? photos.find((p) => str(p.it, 'placement') === 'camp');

/**
 * 카드 묶음. country 가 없으면(JIC 관리자로 볼 때) 캠프 카드에 두 목록을 모두 보인다.
 * extra: 캠퍼스 카드 아래에 덧붙일 줄(홈의 캠퍼스 상태 한 줄)
 */
export function CampusCards({ campuses, photos, country, staffView, extra }: {
  campuses: Campus[];
  photos: Photo[];
  country?: string | null;
  staffView?: boolean;
  extra?: (campusId: string) => ReactNode;
}) {
  const open = campuses.filter((c) => c.status === 'open');
  const camp = staffView && !country ? null : campItemsFor(country);
  return (
    <div className="cards">
      {open.map((c) => {
        const courses = CAMPUS_CARD_COURSES[c.id] ?? [];
        return (
          <Link key={c.id} className="card has-cover" data-tone={toneOf(c.id)} to={`/campuses/${c.id}`}>
            <CoverPhoto photo={campusCover(photos, c.id)} />
            <div className="card-title"><strong>{c.name}</strong>{courses.length > 0 && <span className="muted" style={{ fontSize: 12 }}>코스 {courses.length}</span>}</div>
            {c.tagline && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.tagline}</span>}
            <span style={{ fontSize: 13, lineHeight: 1.7 }}>{courses.join(' · ')}</span>
            {extra?.(c.id)}
          </Link>
        );
      })}
      <Link className="card has-cover" data-tone="mco" to={CAMP_PATH}>
        <CoverPhoto photo={campCover(photos)} />
        <div className="card-title"><strong>캠프</strong></div>
        {camp ? (
          <span style={{ fontSize: 13, lineHeight: 1.7 }}>{camp.join(' · ')}</span>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1.7 }}>
            한국 지점: {CAMP_ITEMS_KR.join(' · ')}
            <br />그 밖의 국가: {CAMP_ITEMS_OTHER.join(' · ')}
          </span>
        )}
        <span className="muted" style={{ fontSize: 12 }}>일정·가격은 전자 브로슈어 안에</span>
      </Link>
    </div>
  );
}
