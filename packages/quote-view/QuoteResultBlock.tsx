import type { ReactNode } from 'react';
import { CAMPUS_NAME, moneyText, pesoText, type Campus, type QuoteView, type ViewAdjust, type ViewItem } from '../quote/src';
import { QV_TEXT, type QvLang } from './text';
import './quote-view.css';

/**
 * 견적 결과 블록(기획 '견적 수정 목록 1113' 견적-1~4). 계산은 packages/quote(R-014), 내용은 presentQuote.
 * 1차 에이전시 포털 견적·상담 ⑤와 2차 학생등록 3단계·인보이스가 이 부품 하나를 쓴다(같은 계산 + 같은 모양).
 * - 순서: 머리 → 코스 → 숙소 → 코스+숙소 → 등록금 → 할인·추가요금 → 총 학비 → 현지비용
 * - 할인은 파랑(--discount) + 선물 아이콘, 추가요금은 주황(--surcharge) + 원·그래프 아이콘. 이름은 검정, 색은 금액·아이콘에만
 * - 금액 앞에 항상 − / + (색만으로 구분하지 않음, D2·D7). 혼합 등록은 줄마다 캠퍼스 칩
 * - 넣지 않는 것: 유학원 커미션(학생에게 보이는 블록, CL-076 ④ — 인보이스는 블록 아래 after 에 따로), 현지비용 원화 환산
 * 색 변수가 없는 앱(관리자 포털)에서도 같은 값이 나오게 CSS 에 기본값을 둔다.
 */
export interface QuoteResultBlockProps {
  view: QuoteView;
  /** 머리 제목(기본 '견적'). 학생등록·인보이스는 자기 제목을 쓴다 */
  title?: ReactNode;
  /** 머리 오른쪽(인쇄·PDF 버튼 등) */
  actions?: ReactNode;
  /** 머리 아래(인쇄용 학생 정보 등) */
  top?: ReactNode;
  /** 현지비용 안내 아래 작은 글씨(가견적 안내 등) */
  footnote?: ReactNode;
  /** 블록 아래(인보이스의 커미션 등, 학생 화면에는 넣지 않음) */
  after?: ReactNode;
  lang?: QvLang;
  className?: string;
}

/** 할인 아이콘: lucide gift(18px, 선 1.6) */
export function GiftIcon() {
  return (
    <svg className="qv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
/** 추가요금 아이콘: 원 + 오르는 그래프(기획 4장 SVG 그대로, lucide 에 없음) */
export function SurchargeIcon() {
  return (
    <svg className="qv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="6,15 9.9,11.1 12.9,14.1 18,9" />
      <polyline points="14.4,9 18,9 18,12.6" />
    </svg>
  );
}
/** 캠퍼스 칩(혼합 등록의 코스·숙소 줄, 견적-4) */
export function CampusChip({ campus }: { campus: Campus }) {
  return <span className={`qv-chip ${campus}`}>{CAMPUS_NAME[campus]}</span>;
}

export default function QuoteResultBlock({ view, title, actions, top, footnote, after, lang = 'ko', className }: QuoteResultBlockProps) {
  const T = QV_TEXT[lang];
  const m = (n: number) => moneyText(view.currency, n);

  const itemRow = (x: ViewItem) => (
    <div key={x.key} className="qv-line">
      <div className="qv-name">
        <span className="qv-title">
          {x.name}
          {view.mixed && <CampusChip campus={x.campus} />}
        </span>
        <span className="qv-small">{T.weeks(x.weeks)} · {x.from} ~ {x.to}</span>
      </div>
      <span className="qv-amt">{m(x.amount)}</span>
    </div>
  );
  const adjustRow = (a: ViewAdjust) => (
    <div key={a.key} className={`qv-adj ${a.kind}`}>
      {a.kind === 'discount' ? <GiftIcon /> : <SurchargeIcon />}
      <div className="qv-name">
        <span className="qv-title">{a.name}</span>
        {a.basis && <span className="qv-small">{a.basis}</span>}
      </div>
      <span className="qv-amt" aria-label={`${a.kind === 'discount' ? T.discount : T.surcharge} ${m(a.amount)}`}>
        {a.kind === 'discount' ? '−' : '+'}{m(a.amount)}
      </span>
    </div>
  );

  return (
    <>
      <section className={'qv' + (className ? ` ${className}` : '')} aria-label={typeof title === 'string' ? title : T.title}>
        <div className="qv-head">
          <h2>{title ?? T.title}</h2>
          {actions}
        </div>
        <p className="qv-meta">{view.start} ~ {view.end} · {T.weeks(view.weeks)} · {view.campuses.map((c) => CAMPUS_NAME[c]).join(' + ')}</p>
        {top}

        <span className="qv-sec">{T.course}</span>
        {view.courses.map(itemRow)}
        <span className="qv-sec">{T.dorm}</span>
        {view.dorms.map(itemRow)}

        <div className="qv-subtotal"><span>{T.itemsTotal}</span><span className="qv-amt">{m(view.itemsTotal)}</span></div>
        <div className="qv-reg"><span>{T.registration}</span><span className="qv-amt">{m(view.registration)}</span></div>

        {view.adjustments.length > 0 && (
          <>
            <span className="qv-sec">{T.adjust}</span>
            {view.adjustments.map(adjustRow)}
          </>
        )}
        {view.pending.length > 0 && (
          <div className="qv-pending" role="note">{view.pending.map((p) => <div key={p}>{T.pending} · {p}</div>)}</div>
        )}

        <div className="qv-total"><span>{T.total}</span><span className="qv-amt">{m(view.total)}</span></div>

        <h3 className="qv-local-h">{T.local}</h3>
        {view.local.map((l) => (
          <div key={l.key} className="qv-local">
            {l.sub ? (
              <div className="qv-name"><span>{l.label}</span><span className="qv-small">{l.sub}</span></div>
            ) : (
              <span>{l.label}</span>
            )}
            <span className="qv-amt">{pesoText(l.amount)}</span>
          </div>
        ))}
        <div className="qv-local-total"><span>{T.localTotal}</span><span className="qv-amt">{pesoText(view.localTotal)}</span></div>
        <p className="qv-notice">{view.localNotice}</p>
        {footnote && <div className="qv-foot">{footnote}</div>}
      </section>
      {after}
    </>
  );
}
