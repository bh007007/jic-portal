import { Link } from 'react-router-dom';
import { loadPublicCampuses, useLoad } from '../data';
import { t } from '../i18n';
import { Box } from '../ui';

// 1.1 대시보드 (공개): 로그인 전 입구. 가격·공실·프로모션은 보이지 않는다.
export default function PublicHome() {
  const { data: campuses } = useLoad(loadPublicCampuses);
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div>
          <span className="eyebrow">{t('brand.slogan')}</span>
          <h1 id="hero-h">JIC 파트너 전용 포털</h1>
          <span className="sub">학생과 화면을 함께 보며 코스를 추천하고, 견적·공실·자료·등록까지 연결합니다.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="cta" to="/login">로그인</Link>
          <Link className="cta cta-ghost" to="/signup">등록 신청</Link>
        </div>
      </section>

      <Box title="캠퍼스">
        <div className="box-body">
          <div className="cards">
            {(campuses ?? []).map((c) =>
              c.status === 'open' ? (
                <Link key={c.id} className="card" to={`/login?next=/campuses/${c.id}`}>
                  <div className="card-title"><strong>{c.name}</strong></div>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.tagline}</span>
                </Link>
              ) : (
                <div key={c.id} className="card off">
                  <div className="card-title"><strong>{c.name}</strong><span className="chip">{t('common.preparing')}</span></div>
                </div>
              ),
            )}
          </div>
        </div>
      </Box>
    </>
  );
}
