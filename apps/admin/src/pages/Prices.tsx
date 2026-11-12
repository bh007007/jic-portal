import { useState } from 'react';
import { fmt, useApi, type PriceList, type PriceRow, type PriceTab } from '../api';
import { saveCsv, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle } from '../components/ui';
import { useSearchForm } from '../useSearchForm';
import { supabase } from '../supabase';
import QuotePrices from './QuotePrices';

const KEYS = ['campus', 'kind', 'q'] as const;

// 업체 포털: 마케팅 > 통계 > 예상 금액(가격표), 기초코드 > 기타비용·환율, 유학원관리 > Commission.
const TABS: [PriceTab, string][] = [
  ['course', '코스'],
  ['dorm', '기숙사'],
  ['etc', '기타비용'],
  ['promo', '프로모션'],
  ['comm', '커미션'],
  ['exchange', '환율'],
];

const money = (n?: number) => (n ? fmt(n) : '');
const rateText = (n?: number) => (n ? n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '');
/** 통화쌍 코드(USDKRW) → USD/KRW */
const pairLabel = (k: string) => (k.length === 6 ? `${k.slice(0, 3)}/${k.slice(3)}` : k);
const period = (r: { start: string; end: string }) => (r.start || r.end ? `${r.start || '…'} ~ ${r.end?.startsWith('2099') ? '' : r.end || ''}` : '');
const PRICE_COLS: Column<PriceRow>[] = [
  ['원(KRW)', (r) => r.krw ?? ''],
  ['달러(USD)', (r) => r.usd ?? ''],
  ['엔(JPY)', (r) => r.jpy ?? ''],
  ['페소(PHP)', (r) => r.php ?? ''],
];
const COLUMNS: Record<PriceTab, Column<PriceRow>[]> = {
  course: [['캠퍼스', (r) => r.campus], ['코스', (r) => r.name], ['종류', (r) => r.kind], ['기준 주 수', (r) => r.weeks ?? ''], ['정해진 주 수', (r) => r.weekOnly || ''], ...PRICE_COLS, ['적용 시작', (r) => r.start], ['적용 끝', (r) => r.end]],
  dorm: [['캠퍼스', (r) => r.campus], ['기숙사', (r) => r.name], ['구분', (r) => r.kind], ['성별', (r) => r.gender ?? ''], ['정원', (r) => r.max || ''], ...PRICE_COLS, ['적용 시작', (r) => r.start], ['적용 끝', (r) => r.end]],
  etc: [['종류', (r) => r.kind], ['이름', (r) => r.name], ...PRICE_COLS, ['포인트', (r) => r.point ?? ''], ['순서', (r) => r.order ?? ''], ['적용 시작', (r) => r.start], ['적용 끝', (r) => r.end], ['메모', (r) => r.memo ?? '']],
  promo: [['이름', (r) => r.name], ['종류', (r) => r.kind], ['대상', (r) => r.target ?? ''], ['통화', (r) => r.currency ?? ''], ['캠퍼스', (r) => r.campus], ['국가', (r) => r.country ?? ''], ['등록 시작', (r) => r.start], ['등록 끝', (r) => r.end], ['노출 시작', (r) => r.showStart ?? ''], ['노출 끝', (r) => r.showEnd ?? ''], ['중복 허용', (r) => (r.stacking ? 'Y' : 'N')], ['우선순위', (r) => r.priority ?? ''], ['설명', (r) => r.note ?? '']],
  comm: [['단위', (r) => r.level ?? ''], ['구분', (r) => r.kind], ['국가', (r) => r.country ?? ''], ['에이전시', (r) => r.name], ['최소 주', (r) => r.minWeek || ''], ['최대 주', (r) => r.maxWeek || ''], ['비율(%)', (r) => r.rate ?? ''], ['적용 시작', (r) => r.start], ['적용 끝', (r) => r.end], ['메모', (r) => r.memo ?? '']],
  exchange: [['통화쌍', (r) => r.name], ['환율', (r) => r.rate ?? ''], ['TTB', (r) => r.ttb || ''], ['TTS', (r) => r.tts || ''], ['적용 시작', (r) => r.start], ['적용 끝', (r) => r.end]],
};

function PriceCells({ r }: { r: PriceRow }) {
  return (
    <>
      <td className="num">{money(r.krw)}</td>
      <td className="num">{money(r.usd)}</td>
      <td className="num">{money(r.jpy)}</td>
      <td className="num">{money(r.php)}</td>
    </>
  );
}
const PRICE_HEADS = (
  <>
    <th className="num">원</th>
    <th className="num">달러</th>
    <th className="num">엔</th>
    <th className="num">페소</th>
  </>
);

/**
 * 가격표: 견적 가격(포털 기준, 에이전시 견적이 쓰는 승인 버전, T-21) / 업체 가격표(참고, 업체 포털 추출본).
 * 11/12부터 가격 기준은 기획 정정본에서 시작한 견적 가격(CL-057·065). 업체 가격표는 대조용으로 남긴다.
 */
export default function Prices() {
  const [mode, setMode] = useState<'quote' | 'legacy'>(supabase ? 'quote' : 'legacy');
  return (
    <>
      <PageTitle title="가격표" path="홈 > 기초관리 > 가격표" />
      <div role="tablist" aria-label="가격표 종류" className="filter-tabs" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button type="button" role="tab" aria-selected={mode === 'quote'} className={'btn' + (mode === 'quote' ? ' btn-primary' : '')} onClick={() => setMode('quote')}>견적 가격 (포털 기준)</button>
        <button type="button" role="tab" aria-selected={mode === 'legacy'} className={'btn' + (mode === 'legacy' ? ' btn-primary' : '')} onClick={() => setMode('legacy')}>업체 가격표 (참고)</button>
      </div>
      {mode === 'quote' ? <QuotePrices /> : <LegacyPrices />}
    </>
  );
}

function LegacyPrices() {
  const { params, setParams, query, form, set, apply, submit } = useSearchForm(KEYS);
  const tab = (TABS.find(([k]) => k === params.get('tab')) ?? TABS[0])[0];
  const current = params.get('current') !== '0';
  const api = '/api/prices' + (query ? '?' + query : '');
  const { data, error } = useApi<PriceList>(api);
  const ready = data && data.tab === tab;
  const tabLabel = TABS.find(([k]) => k === tab)![1];
  const showCampus = tab === 'course' || tab === 'dorm' || tab === 'promo';
  const showKind = tab === 'etc' || tab === 'course' || tab === 'exchange';
  // 업체 환율 표의 TTB·TTS 는 지금 모두 비어 있어 값이 있을 때만 칸을 보인다.
  const showSpread = ready && tab === 'exchange' && data.rows.some((r) => r.ttb || r.tts);

  return (
    <>
      <div role="tablist" aria-label="가격표 구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams(key === 'course' ? (current ? {} : { current: '0' }) : { tab: key, ...(current ? {} : { current: '0' }) })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={submit}>
        <div className="search-grid">
          {showCampus && (
            <label className="field">
              <span>캠퍼스</span>
              <select value={form.campus} onChange={set('campus')}>
                <option value="">전체</option>
                {ready && data.facets.campuses.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
          {showKind && (
            <label className="field">
              <span>{tab === 'exchange' ? '통화쌍' : '종류'}</span>
              <select value={form.kind} onChange={set('kind')}>
                <option value="">전체</option>
                {ready && data.facets.kinds.map((k) => <option key={k} value={k}>{tab === 'exchange' ? pairLabel(k) : k}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>검색어</span>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </label>
          <div className="field">
            <span>기간</span>
            <label>
              <input type="checkbox" checked={current} onChange={(e) => apply({ current: e.target.checked ? '' : '0' })} />
              지금 적용되는 것만
            </label>
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams(tab === 'course' ? {} : { tab })}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!ready ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>
              총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>건
              <span className="muted"> · 기준일 {data.refDate}{current ? ' 적용분' : ' 전체 기간'}</span>
              {tab === 'course' && data.coursesWithoutPrice > 0 && <span className="muted"> · 가격이 없는 코스 {fmt(data.coursesWithoutPrice)}개</span>}
            </span>
            <span className="toolbar-right">
              <DownloadButton run={() => saveCsv(`가격표_${tabLabel}_${data.refDate}.csv`, COLUMNS[tab], data.rows)} />
            </span>
          </div>

          {tab === 'course' && data.setting && (
            <div className="grid-box" style={{ marginBottom: 12 }}>
              <table className="tbl center" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>기간별 값(4주 = 100)</th>
                    {data.setting.weeks.map((_, i) => <th key={i}>{i + 1}주</th>)}
                    <th>8주 넘으면 1주마다</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="muted" style={{ fontSize: 12 }}>{period(data.setting)}</td>
                    {data.setting.weeks.map((w, i) => <td key={i}>{w}</td>)}
                    <td>+{data.setting.more}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: tab === 'exchange' ? 640 : 1100 }}>
              <thead>
                {tab === 'course' && <tr><th>캠퍼스</th><th className="left">코스</th><th>종류</th><th>기준 주 수</th>{PRICE_HEADS}<th>적용 기간</th></tr>}
                {tab === 'dorm' && <tr><th>캠퍼스</th><th className="left">기숙사</th><th>성별</th><th>정원</th>{PRICE_HEADS}<th>적용 기간</th></tr>}
                {tab === 'etc' && <tr><th>종류</th><th className="left">이름</th>{PRICE_HEADS}<th>포인트</th><th>적용 기간</th><th className="left">메모</th></tr>}
                {tab === 'promo' && <tr><th className="left">이름</th><th>종류</th><th>대상</th><th>통화</th><th>캠퍼스</th><th>등록 기간</th><th>노출 기간</th><th>중복</th><th className="left">설명</th></tr>}
                {tab === 'comm' && <tr><th>단위</th><th>구분</th><th>국가</th><th className="left">에이전시</th><th>주 수</th><th className="num">비율</th><th>적용 기간</th><th className="left">메모</th></tr>}
                {tab === 'exchange' && <tr><th>통화쌍</th><th className="num">환율</th>{showSpread && <><th className="num">TTB</th><th className="num">TTS</th></>}<th>적용 기간</th></tr>}
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={12}>{data.hasData ? '조건에 맞는 항목이 없습니다.' : '가격표가 없습니다.'}</td></tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.key} className={r.active ? '' : 'muted'}>
                    {tab === 'course' && (
                      <>
                        <td>{r.campus}</td>
                        <td className="left">{r.name}{r.weekOnly ? <span className="muted" style={{ fontSize: 12 }}> ({r.weekOnly}주 과정)</span> : null}</td>
                        <td>{r.kind}</td>
                        <td>{r.weeks}주</td>
                        <PriceCells r={r} />
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                      </>
                    )}
                    {tab === 'dorm' && (
                      <>
                        <td>{r.campus}</td>
                        <td className="left">{r.name}{r.kind ? <span className="muted" style={{ fontSize: 12 }}> ({r.kind})</span> : null}</td>
                        <td>{r.gender || '-'}</td>
                        <td>{r.max || '-'}</td>
                        <PriceCells r={r} />
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                      </>
                    )}
                    {tab === 'etc' && (
                      <>
                        <td>{r.kind}</td>
                        <td className="left">{r.name}</td>
                        <PriceCells r={r} />
                        <td>{r.point || '-'}</td>
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                        <td className="left memo-text" style={{ fontSize: 12 }}>{r.memo || <span className="muted">-</span>}</td>
                      </>
                    )}
                    {tab === 'promo' && (
                      <>
                        <td className="left">{r.name}</td>
                        <td>{r.kind}</td>
                        <td>{r.target || '전체'}</td>
                        <td>{r.currency || '-'}</td>
                        <td>{r.campus || '전체'}</td>
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                        <td className="nowrap" style={{ fontSize: 12 }}>{period({ start: r.showStart ?? '', end: r.showEnd ?? '' })}</td>
                        <td>{r.stacking ? '허용' : '-'}</td>
                        <td className="left memo-text" style={{ fontSize: 12 }}>{r.note || <span className="muted">-</span>}</td>
                      </>
                    )}
                    {tab === 'comm' && (
                      <>
                        <td>{r.level}</td>
                        <td>{r.kind}</td>
                        <td>{r.country || '-'}</td>
                        <td className="left">{r.name || '-'}</td>
                        <td>{r.minWeek || r.maxWeek ? `${r.minWeek || ''} ~ ${r.maxWeek || ''}` : '-'}</td>
                        <td className="num">{r.rate}%</td>
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                        <td className="left memo-text" style={{ fontSize: 12 }}>{r.memo || <span className="muted">-</span>}</td>
                      </>
                    )}
                    {tab === 'exchange' && (
                      <>
                        <td>{r.name}</td>
                        <td className="num">{rateText(r.rate)}</td>
                        {showSpread && (
                          <>
                            <td className="num">{rateText(r.ttb) || '-'}</td>
                            <td className="num">{rateText(r.tts) || '-'}</td>
                          </>
                        )}
                        <td className="nowrap" style={{ fontSize: 12 }}>{period(r)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
