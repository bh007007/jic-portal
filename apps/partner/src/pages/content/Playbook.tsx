import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ContentPage, str, textOf, useItems } from '../../content';
import { t } from '../../i18n';
import { screenTitle } from '../../menu';

/**
 * 상담 › 상담 자료 › 플레이북(CL-052, 명세 5장). 에이전트 모드에만 있고 상담 모드에는 없다.
 * 맨 위 고정 문구와 설명 문구는 명세 그대로. 질문 카드: 질문 → 답변 요점 → 보여 줄 화면 → 피할 말. 분야별 필터와 검색.
 * 내용은 기획이 확정한 뒤 관리 화면에 입력하고, 그 전에는 '준비 중'.
 */
export default function Playbook() {
  const { data, error } = useItems('playbook');
  const [area, setArea] = useState('');
  const [kw, setKw] = useState('');
  const areas = [...new Set((data ?? []).map((it) => str(it, 'area')).filter(Boolean))];
  const k = kw.trim().toLowerCase();
  const list = (data ?? []).filter(
    (it) => (!area || str(it, 'area') === area) && (!k || [textOf(it).title, str(it, 'answer'), str(it, 'show'), str(it, 'avoid')].join(' ').toLowerCase().includes(k)),
  );

  return (
    <ContentPage
      title={t('menu.playbook')}
      items={data}
      error={error}
      intro={
        <>
          <div className="staff-only" role="note">상담원 전용 · 학생에게 보여 주지 마세요</div>
          <p className="page-intro">
            플레이북은 학생이 자주 묻는 어려운 질문에 대한 JIC 표준 답변입니다. 질문마다 답변 요점과 학생에게 보여 줄 화면이 연결되어 있습니다. 상담 전에 읽어 두고, 상담 중에는 상담원 휴대폰이나 다른 창으로 열어 참고하세요.
          </p>
        </>
      }
    >
      <div className="box box-body filter-box">
        {areas.length > 1 && (
          <div className="filter-row" role="group" aria-label="분야">
            {['', ...areas].map((a) => (
              <button key={a || 'all'} type="button" className={'btn btn-sm' + (area === a ? ' btn-primary' : '')} onClick={() => setArea(a)}>{a || '모든 분야'}</button>
            ))}
          </div>
        )}
        <input className="input" style={{ maxWidth: 260, marginLeft: 'auto', height: 32 }} placeholder="질문 검색" aria-label="질문 검색" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <div className="state">고른 조건에 맞는 질문이 없습니다.</div>
      ) : (
        <div className="playbook">
          {list.map((it) => {
            const show = str(it, 'show');
            return (
              <article key={it.id} className="box playbook-card">
                <div className="box-body">
                  {str(it, 'area') && <span className="muted" style={{ fontSize: 12 }}>{str(it, 'area')}</span>}
                  <h2 className="q">{textOf(it).title}</h2>
                  <dl>
                    <dt>답변 요점</dt>
                    <dd className="pre">{str(it, 'answer')}</dd>
                    {show && (
                      <>
                        <dt>보여 줄 화면</dt>
                        {/* 포털 안 주소(/로 시작)면 그 화면으로, 아니면 글 그대로 */}
                        <dd>{show.startsWith('/') ? <Link to={show}>{screenTitle(show)} ›</Link> : <span className="pre">{show}</span>}</dd>
                      </>
                    )}
                    {str(it, 'avoid') && (
                      <>
                        <dt className="avoid">피할 말</dt>
                        <dd className="pre">{str(it, 'avoid')}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </ContentPage>
  );
}
