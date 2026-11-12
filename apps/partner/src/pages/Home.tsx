import { Link, useNavigate } from 'react-router-dom';
import { loadItems, str, textOf, usePhotos, VideoCard } from '../content';
import { updateText } from '../contentKinds';
import { byCountryOrder, isActivePromotion, loadCampuses, loadSettings, useLoad, type Notice } from '../data';
import { CampusCards } from '../campusCards';
import { useAuth } from '../auth';
import { t } from '../i18n';
import { must, supabase } from '../supabase';
import { Box, OutLink, TAG_COLOR } from '../ui';

// 1.2 로그인 후 홈(CL-040, 11/10): 상담 시작(가장 크게) → 바로가기 4개(견적·공실·자료실·방문 신청) → 캠퍼스 상태
// 캠퍼스 카드는 Premium · Challenger · 캠프(CL-077·080, 11/12, campusCards.tsx)
// → 공지·프로모션(국가별 순서, CL-036) → 새 영상(JIC Play) → 뉴스레터 최신호.
// 캠퍼스 상태 한 줄·새 영상·뉴스레터 호는 관리자 포털 '파트너 포털 관리'의 화면 콘텐츠(partner_content_items, CL-045)에서 읽는다.
// 2차에는 대표 홈에 처리할 인보이스·내 학생 요약을 더한다.
// 지점 직원 아이디(CL-032)는 상담·자료·공지만: 바로가기는 자료실만 보이고 캠퍼스 상자는 대표만 본다.
export default function Home() {
  const { member, agencyStaff, staff } = useAuth();
  const navigate = useNavigate();
  const cardPhotos = usePhotos(['campus_card', 'campus_hero', 'camp']); // 사진 보관함 '캠퍼스 카드'(CL-047)
  const { data } = useLoad(async () => {
    const [campuses, settings, notices, items] = await Promise.all([
      loadCampuses(),
      loadSettings(),
      must<Notice[]>(supabase.from('partner_notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30)),
      // 화면 콘텐츠는 못 읽어도 홈은 보인다(그 상자만 '준비 중')
      loadItems(['campus_status', 'video', 'newsletter']).catch(() => []),
    ]);
    return { campuses, settings, notices, items };
  });
  // 국가별 우선 순서(CL-036): 고정·최신 순서를 내 나라 순서로 다시 줄 세운다(노출 국가는 DB 정책이 거름)
  const ordered = byCountryOrder(data?.notices ?? [], member?.country);
  const notices = ordered.filter((n) => n.kind === 'notice').slice(0, 5);
  const promos = ordered.filter((n) => n.kind === 'promotion' && isActivePromotion(n)).slice(0, 3);
  const s = data?.settings ?? {};
  const items = byCountryOrder(data?.items ?? [], member?.country);
  // 캠퍼스 상태(명세 4.5): 캠퍼스마다 첫 줄, 갱신일 = 최종 업데이트일
  const statusOf = (campusId: string) => items.find((it) => it.kind === 'campus_status' && it.campus === campusId);
  // 새 영상: 최근에 넣은 영상 3개
  const videos = items.filter((it) => it.kind === 'video').sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
  const latestIssue = items.filter((it) => it.kind === 'newsletter').sort((a, b) => str(b, 'issued_on').localeCompare(str(a, 'issued_on')))[0];

  return (
    <>
      <section className="hero" aria-labelledby="start-h">
        <div>
          <span className="eyebrow">{t('brand.slogan')}</span>
          <h1 id="start-h">학생과 함께 상담 시작</h1>
          <span className="sub">질문 5개 · 추천 코스 · 학습계획서 PDF</span>
        </div>
        <Link className="cta" to="/consult">상담 시작</Link>
      </section>

      <nav className="links" aria-label="바로가기">
        {!agencyStaff && <Link to="/quote"><strong>견적</strong><span>코스·숙소·기간으로 바로 계산</span></Link>}
        {!agencyStaff && <Link to="/vacancy"><strong>공실 확인</strong><span>최종 확정은 JIC 담당자 확인</span></Link>}
        <Link to="/resources"><strong>자료실</strong><span>가격표 · 브로슈어 · 사진 · 규정</span></Link>
        {!agencyStaff && <Link to="/visit"><strong>방문 신청</strong><span>학교 방문 · 내 방문 내역</span></Link>}
      </nav>

      {!agencyStaff && (
      <Box title="캠퍼스" extra={<Link className="more" to="/campuses">캠퍼스 ›</Link>}>
        <div className="box-body">
          <CampusCards
            campuses={data?.campuses ?? []}
            photos={cardPhotos}
            country={member?.country}
            staffView={!!staff && !member}
            extra={(id) => {
              const st = statusOf(id);
              return st ? (
                <span className="campus-status">
                  {textOf(st).title}
                  {st.updated_on && <span className="muted"> · {updateText({ updated_on: st.updated_on, next_update: null })}</span>}
                </span>
              ) : null;
            }}
          />
        </div>
      </Box>
      )}

      <div className="row">
        <Box title="공지" extra={<Link className="more" to="/notices">더보기 +</Link>} className="grow-3">
          {notices.length === 0 ? (
            <p className="empty">등록된 공지가 없습니다.</p>
          ) : (
            <ul className="list">
              {notices.map((n) => (
                <li key={n.id}>
                  <span className="tag" style={{ color: TAG_COLOR[n.tag] ?? 'var(--ink-2)' }}>{n.pinned ? '[고정] ' : ''}{n.tag}</span>
                  <Link className="title" to={`/notices/${n.id}`}>{n.title}</Link>
                  <span className="date">{n.created_at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <div className="col grow-2">
          <Box title="프로모션" extra={<Link className="more" to="/notices?tab=promotion">전체</Link>}>
            {promos.length === 0 ? (
              <p className="empty">진행 중인 프로모션이 없습니다.</p>
            ) : (
              <ul className="list">
                {promos.map((n) => (
                  <li key={n.id}>
                    <Link className="title" to={`/notices/${n.id}`}>{n.title}</Link>
                    <span className="date">{n.ends_on ? `~${n.ends_on}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>
      </div>

      <Box title="새 영상 (JIC Play)" extra={<Link className="more" to="/play">JIC Play ›</Link>}>
        {videos.length === 0 ? (
          <p className="empty">{t('common.preparing')}입니다.</p>
        ) : (
          <div className="box-body">
            <div className="cards">
              {videos.map((v) => <VideoCard key={v.id} it={v} onOpen={() => navigate(`/play?v=${v.id}`)} />)}
            </div>
          </div>
        )}
      </Box>

      <Box title="뉴스레터 최신호" extra={<Link className="more" to="/newsletter">뉴스레터 ›</Link>}>
        {latestIssue ? (
          <ul className="list">
            <li>
              <a className="title" href={str(latestIssue, 'url')} target="_blank" rel="noreferrer">{textOf(latestIssue).title} ↗</a>
              <span className="date">{str(latestIssue, 'issued_on')}</span>
            </li>
          </ul>
        ) : (
          <div className="box-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <OutLink href={s.newsletter_latest}>최신호 보기</OutLink>
            <OutLink href={s.newsletter_archive}>지난 호</OutLink>
          </div>
        )}
      </Box>

    </>
  );
}
