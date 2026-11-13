import { useEffect, useId, useRef, useState } from 'react';
import { isBesaDay } from '../quote/src';
import { QV_TEXT, type QvLang } from './text';
import './quote-view.css';

/**
 * 연수 시작일 달력(기획 '견적 수정 목록 1113' 견적-5, 시안 04). 브라우저 기본 날짜 칸은 날짜별 색칠이 안 돼 직접 만든다.
 * - 일요일만 고를 수 있다(월~토는 흐린 글자). BESA 단체 픽업일(2주마다 일요일, packages/quote isBesaDay)은 연한 회색
 * - 고른 날은 진한 배경 + 흰 글자(BESA 날이어도 고른 색이 먼저). 달력 아래 설명 문구(범례)는 넣지 않는다
 * - 견적 화면과 2차 학생등록이 같이 쓴다. Esc·바깥 누르기로 닫힌다
 */
export interface StartDateCalendarProps {
  /** YYYY-MM-DD(일요일) */
  value: string;
  onChange: (day: string) => void;
  /** 칸 위 이름표의 id(화면 읽기 프로그램이 '연수 시작일'로 읽게) */
  labelledBy?: string;
  /** 표시할 날(기본 BESA 픽업일) */
  marked?: (day: string) => boolean;
  lang?: QvLang;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function parts(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

export default function StartDateCalendar({ value, onChange, labelledBy, marked = isBesaDay, lang = 'ko' }: StartDateCalendarProps) {
  const T = QV_TEXT[lang];
  const id = useId();
  const sel = parts(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({ y: sel?.y ?? today.getFullYear(), m: sel?.m ?? today.getMonth() + 1 }));
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLButtonElement>(null);

  // 열 때는 고른 날의 달부터
  useEffect(() => {
    if (open && sel) setView({ y: sel.y, m: sel.m });
  }, [open]); // 고른 날이 바뀔 때마다 달을 옮기지는 않는다(다른 달을 넘겨 보는 중일 수 있음)
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); field.current?.focus(); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);

  const move = (delta: number) => setView((v) => {
    const t = new Date(Date.UTC(v.y, v.m - 1 + delta, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
  });
  const pick = (day: string) => { onChange(day); setOpen(false); field.current?.focus(); };

  // 그 달을 덮는 주(일요일 시작)
  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const rows = Math.ceil((lead + days) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    const t = new Date(Date.UTC(view.y, view.m - 1, 1 - lead + i));
    return { day: ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), d: t.getUTCDate(), dow: i % 7, inMonth: t.getUTCMonth() + 1 === view.m };
  });

  return (
    <div className="qcal" ref={box}>
      <button
        ref={field}
        type="button"
        className={'qcal-field' + (open ? ' open' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-pop`}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}-val` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${id}-val`}>{sel ? T.date(sel.y, sel.m, sel.d) : T.pick}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
        </svg>
      </button>
      {open && (
        <div className="qcal-pop" id={`${id}-pop`} role="dialog" aria-label={T.calendar}>
          <div className="qcal-head">
            <button type="button" className="qcal-nav" aria-label={T.prevMonth} onClick={() => move(-1)}>‹</button>
            <span className="qcal-title" aria-live="polite">{T.month(view.y, view.m)}</span>
            <button type="button" className="qcal-nav" aria-label={T.nextMonth} onClick={() => move(1)}>›</button>
          </div>
          <div className="qcal-grid">
            {T.weekdays.map((w, i) => <span key={w} className={'qcal-wd' + (i === 0 ? ' sun' : '')}>{w}</span>)}
            {cells.map((c) => {
              if (!c.inMonth) return <span key={c.day} className={'qcal-off other' + (c.dow === 0 ? ' sun' : '')} aria-hidden="true">{c.d}</span>;
              if (c.dow !== 0) return <span key={c.day} className="qcal-off" aria-hidden="true">{c.d}</span>;
              const isSel = c.day === value;
              const besa = marked(c.day);
              return (
                <button
                  key={c.day}
                  type="button"
                  className={'qcal-day' + (besa ? ' besa' : '') + (isSel ? ' sel' : '')}
                  aria-pressed={isSel}
                  aria-label={`${T.dayLabel(view.y, view.m, c.d)}${besa ? ` · ${T.besaDay}` : ''}`}
                  onClick={() => pick(c.day)}
                >
                  {c.d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
