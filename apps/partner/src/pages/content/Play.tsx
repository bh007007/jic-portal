import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContentPage, VideoCard, YouTube, campusName, str, textOf, useCampusFilter, useItems } from '../../content';
import { Sheet } from '../../consult/Sheet';
import { t } from '../../i18n';

/**
 * 상담 › JIC Play(CL-047): 관리자 포털 '사진·영상 › JIC Play 영상'의 유튜브 영상. 영상 파일은 포털에 올리지 않고 유튜브(일부 공개)에서 재생한다.
 * 누르면 같은 화면 위 큰 창에서 재생(다른 메뉴·새 창으로 가지 않음). 홈 '새 영상'에서 오면 ?v=<id> 로 그 영상을 연다.
 */
export default function Play() {
  const { data, error } = useItems('video');
  const { bar, match } = useCampusFilter(data);
  const [type, setType] = useState('');
  const [params, setParams] = useSearchParams();
  const open = data?.find((v) => v.id === params.get('v')) ?? null;
  const types = [...new Set((data ?? []).map((v) => str(v, 'type')).filter(Boolean))];
  const list = (data ?? []).filter((v) => match(v) && (!type || str(v, 'type') === type));

  return (
    <ContentPage title={t('menu.play')} items={data} error={error}>
      {(bar || types.length > 1) && (
        <div className="box box-body filter-box">
          {bar}
          {types.length > 1 && (
            <div className="filter-row" role="group" aria-label="유형">
              {['', ...types].map((x) => (
                <button key={x || 'all'} type="button" className={'btn btn-sm' + (type === x ? ' btn-primary' : '')} onClick={() => setType(x)}>{x || '모든 유형'}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {list.length === 0 ? (
        <div className="state">고른 조건에 맞는 영상이 없습니다.</div>
      ) : (
        <div className="cards">
          {list.map((v) => <VideoCard key={v.id} it={v} onOpen={() => setParams({ v: v.id }, { replace: true })} />)}
        </div>
      )}
      {open && (
        <Sheet title={textOf(open).title} onClose={() => setParams({}, { replace: true })}>
          <YouTube url={str(open, 'youtube')} title={textOf(open).title} />
          <p className="muted" style={{ fontSize: 13, margin: '12px 0 4px' }}>{[campusName(open.campus), str(open, 'type'), str(open, 'length')].filter(Boolean).join(' · ')}</p>
          {textOf(open).body && <p className="pre" style={{ margin: '4px 0 0' }}>{textOf(open).body}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <a className="btn btn-sm" href={str(open, 'youtube')} target="_blank" rel="noreferrer">유튜브에서 열기 ↗</a>
            {str(open, 'drive') && <a className="btn btn-sm" href={str(open, 'drive')} target="_blank" rel="noreferrer">원본 파일(드라이브) ↗</a>}
          </div>
        </Sheet>
      )}
    </ContentPage>
  );
}
