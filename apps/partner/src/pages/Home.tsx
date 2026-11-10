import { Link } from 'react-router-dom';
import { courseLabel, isActivePromotion, loadCampuses, loadCourses, loadSettings, useLoad, type Notice } from '../data';
import { t } from '../i18n';
import { must, supabase } from '../supabase';
import { Box, OutLink, TAG_COLOR } from '../ui';

// 1.2 로그인 후 홈(CL-040, 11/10): 상담 시작(가장 크게) → 바로가기 4개(견적·공실·자료실·방문 신청) → 캠퍼스 상태
// → 공지·프로모션 → 새 영상(JIC Play, 준비 중) → 뉴스레터 최신호. 공지·프로모션·영상의 국가별 순서는 CL-036(개발 예정).
// 2차에는 대표 홈에 처리할 인보이스·내 학생 요약을 더한다.
export default function Home() {
  const { data } = useLoad(async () => {
    const [campuses, courses, settings, notices] = await Promise.all([
      loadCampuses(),
      loadCourses(),
      loadSettings(),
      must<Notice[]>(supabase.from('partner_notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30)),
    ]);
    return { campuses, courses, settings, notices };
  });
  const notices = (data?.notices ?? []).filter((n) => n.kind === 'notice').slice(0, 5);
  const promos = (data?.notices ?? []).filter((n) => n.kind === 'promotion' && isActivePromotion(n)).slice(0, 3);
  const s = data?.settings ?? {};

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
        <Link to="/quote"><strong>견적</strong><span>KR · JP · USD · USD-New</span></Link>
        <Link to="/vacancy"><strong>공실 확인</strong><span>최종 확정은 JIC 담당자 확인</span></Link>
        <Link to="/resources"><strong>자료실</strong><span>가격표 · 브로슈어 · 사진 · 규정</span></Link>
        <Link to="/visit"><strong>방문 신청</strong><span>학교 방문 · 내 방문 내역</span></Link>
      </nav>

      <Box title="캠퍼스" extra={<Link className="more" to="/campuses">캠퍼스·코스 ›</Link>}>
        <div className="box-body">
          <div className="cards">
            {(data?.campuses ?? []).map((c) => {
              const cs = (data?.courses ?? []).filter((x) => x.campus_id === c.id);
              return c.status === 'open' ? (
                <Link key={c.id} className="card" to={`/campuses/${c.id}`}>
                  <div className="card-title"><strong>{c.name}</strong><span className="muted" style={{ fontSize: 12 }}>코스 {cs.length}</span></div>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.tagline}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.7 }}>{cs.map(courseLabel).join(' · ')}</span>
                </Link>
              ) : (
                <div key={c.id} className="card off">
                  <div className="card-title"><strong>{c.name}</strong><span className="chip">{t('common.preparing')}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      </Box>

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

      <Box title={<>새 영상 (JIC Play) <span className="chip">{t('common.preparing')}</span></>} extra={<Link className="more" to="/play">JIC Play ›</Link>}>
        <p className="empty">영상 목록은 준비 중입니다.</p>
      </Box>

      <Box title="뉴스레터 최신호" extra={<Link className="more" to="/newsletter">뉴스레터 ›</Link>}>
        <div className="box-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <OutLink href={s.newsletter_latest}>최신호 보기</OutLink>
          <OutLink href={s.newsletter_archive}>지난 호</OutLink>
        </div>
      </Box>

    </>
  );
}
