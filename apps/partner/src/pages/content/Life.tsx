import { useState } from 'react';
import { ContentPage, DayTimeline, PhotoGrid, campusName, str, textOf, useCampusFilter, useItems, usePhotos } from '../../content';
import type { ContentItem } from '../../contentKinds';
import { today } from '../../data';
import { t } from '../../i18n';
import { Box } from '../../ui';
import { toneOf } from '../../tone';

/**
 * 코스·생활 › 학생의 하루(명세 4.3): 캠퍼스·코스별 시간표. 실제 한 학생이 아니라 '예시 학생'임을 화면에 표시한다(CL-030).
 * 상담 ③도 같은 자료를 추천 캠퍼스·코스에 맞춰 자동으로 보여 준다.
 */
export function Day() {
  const { data, error } = useItems('day');
  const { campus, bar, match } = useCampusFilter(data);
  const photos = usePhotos(['day'], campus);
  const list = (data ?? []).filter(match);
  // 캠퍼스 × 코스 묶음. 코스 칸이 비면 그 캠퍼스 공통
  const groups: { key: string; campus: string; course: string; items: ContentItem[] }[] = [];
  for (const it of list) {
    const key = `${it.campus}|${str(it, 'course')}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(it);
    else groups.push({ key, campus: it.campus, course: str(it, 'course'), items: [it] });
  }
  return (
    <ContentPage title={t('menu.day')} items={data} error={error}>
      {bar && <div className="box box-body filter-box">{bar}</div>}
      <PhotoGrid photos={photos} max={6} className="wide" />
      {groups.map((g) => (
        <Box key={g.key} className="tone-box" title={<span data-tone={toneOf(g.campus)} className="tone-title">{[campusName(g.campus), g.course].filter(Boolean).join(' · ')} <span className="chip">예시 학생</span></span>}>
          <div className="box-body"><DayTimeline items={g.items} /></div>
        </Box>
      ))}
    </ContentPage>
  );
}

/** 코스·생활 › 학생 생활 › 액티비티 */
export function Activities() {
  const { data, error } = useItems('activity');
  const { campus, bar, match } = useCampusFilter(data);
  const photos = usePhotos(['activity'], campus);
  return (
    <ContentPage title={t('menu.activities')} items={data} error={error}>
      {bar && <div className="box box-body filter-box">{bar}</div>}
      <PhotoGrid photos={photos} max={8} className="wide" />
      <div className="cards">
        {(data ?? []).filter(match).map((it) => (
          <div key={it.id} className="card" data-tone={toneOf(it.campus)}>
            <div className="card-title"><strong>{textOf(it).title}</strong><span className="muted" style={{ fontSize: 12 }}>{campusName(it.campus) || '전 캠퍼스'}</span></div>
            {str(it, 'schedule') && <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>{str(it, 'schedule')}</span>}
            {textOf(it).body && <span className="pre" style={{ fontSize: 14, color: 'var(--ink-2)' }}>{textOf(it).body}</span>}
          </div>
        ))}
      </div>
    </ContentPage>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : `${d.slice(5).replace('-', '.')} (${WEEK[dt.getDay()]})`;
};
const TYPE_TONE: Record<string, string> = { 입학: 'var(--accent)', 픽업: 'var(--new)', 시험: 'var(--cha)', 휴일: 'var(--muted)', 이벤트: 'var(--mco)' };

/** 코스·생활 › 학생 생활 › 활동 달력(명세 4.5 '행사 일정'): 달마다 묶은 목록. 기본은 이번 달부터, '지난 일정'으로 앞 달도 */
export function Calendar() {
  const { data, error } = useItems('event');
  const { campus, bar, match } = useCampusFilter(data);
  const photos = usePhotos(['event'], campus);
  const [type, setType] = useState('');
  const [past, setPast] = useState(false);
  const month = today().slice(0, 7);
  const list = (data ?? [])
    .filter((it) => match(it) && (!type || str(it, 'type') === type) && str(it, 'date') && (past || str(it, 'date').slice(0, 7) >= month))
    .sort((a, b) => str(a, 'date').localeCompare(str(b, 'date')));
  const months = [...new Set(list.map((it) => str(it, 'date').slice(0, 7)))];
  const types = [...new Set((data ?? []).map((it) => str(it, 'type')).filter(Boolean))];
  return (
    <ContentPage title={t('menu.calendar')} items={data} error={error}>
      <div className="box box-body filter-box">
        {bar}
        {types.length > 1 && (
          <div className="filter-row" role="group" aria-label="종류">
            {['', ...types].map((x) => (
              <button key={x || 'all'} type="button" className={'btn btn-sm' + (type === x ? ' btn-primary' : '')} onClick={() => setType(x)}>{x || '모든 종류'}</button>
            ))}
          </div>
        )}
        <label style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> 지난 일정도 보기
        </label>
      </div>
      <PhotoGrid photos={photos} max={6} className="wide" />
      {months.length === 0 && <div className="state">앞으로 예정된 일정이 없습니다.</div>}
      {months.map((m) => (
        <Box key={m} title={`${m.slice(0, 4)}년 ${Number(m.slice(5))}월`}>
          <ul className="list event-list">
            {list.filter((it) => str(it, 'date').startsWith(m)).map((it) => (
              <li key={it.id}>
                <span className="date-l">{dayLabel(str(it, 'date'))}</span>
                <span className="tag" style={{ color: TYPE_TONE[str(it, 'type')] ?? 'var(--ink-2)' }}>{str(it, 'type')}</span>
                <span className="title">
                  {textOf(it).title}
                  {textOf(it).body && <span className="muted pre" style={{ display: 'block', fontSize: 12.5 }}>{textOf(it).body}</span>}
                </span>
                <span className="date">{campusName(it.campus) || '전 캠퍼스'}</span>
              </li>
            ))}
          </ul>
        </Box>
      ))}
    </ContentPage>
  );
}
