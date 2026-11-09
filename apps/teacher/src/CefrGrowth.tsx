import { CEFR_LEVELS, cefrOf, type CefrMapping, type CourseEvent, type TestResult, type TestType } from './data';
import { useT } from './i18n';

/**
 * CEFR 공통 성장선(원칙 L2): 시험 종류가 달라도 총점을 CEFR(JIC 기준 추정 레벨)로 바꿔 한 줄로 이어 본다.
 * 코스를 바꾸면 그 날짜에 세로 점선과 새 코스 이름을 표시한다(lms_course_timeline). 대응 기준(cefr_mappings)이 없는 시험은 빠진다.
 * 코스별 성적표(시험 종류별 그래프·표)는 그 아래 그대로 있다.
 */
export default function CefrGrowth({ results, maps, types, events }: { results: TestResult[]; maps: CefrMapping[]; types: TestType[]; events: CourseEvent[] }) {
  const { t } = useT();
  const name = (code: string) => types.find((x) => x.code === code)?.name ?? code;
  const pts = results
    .filter((r) => r.section === '')
    .map((r) => {
      const cefr = cefrOf(maps, r.test_type, Number(r.value));
      return { date: r.test_date, type: r.test_type, value: r.value, cefr, idx: (CEFR_LEVELS as readonly string[]).indexOf(cefr) };
    })
    .filter((p) => p.idx >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;

  const W = 360, H = 180, L = 46, R = 12, T = 22, B = 24;
  let lo = Math.min(...pts.map((p) => p.idx));
  let hi = Math.max(...pts.map((p) => p.idx));
  if (lo === hi) (hi < CEFR_LEVELS.length - 1 ? (hi += 1) : (lo -= 1));
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date);
  const x = (d: string) => L + (t1 === t0 ? (W - L - R) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R));
  const y = (i: number) => T + (1 - (i - lo) / (hi - lo)) * (H - T - B);
  const marks = events.filter((e) => e.kind === 'change' || e.day > pts[0].date).filter((e) => e.day >= pts[0].date && e.day <= pts[pts.length - 1].date);
  const short = (s: string) => (s.length > 16 ? s.slice(0, 15) + '…' : s);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.idx).toFixed(1)}`).join(' ');
  const levels = CEFR_LEVELS.slice(lo, hi + 1);
  const label = (p: (typeof pts)[number]) => `${p.date} · ${name(p.type)} ${p.value} → ${p.cefr}`;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t('growthTitle')}: ${pts.map(label).join(', ')}`}>
        {levels.map((lv, i) => (
          <g key={lv}>
            <line x1={L} x2={W - R} y1={y(lo + i)} y2={y(lo + i)} className="grid" />
            <text x={L - 6} y={y(lo + i) + 4} textAnchor="end" className="axis">{lv}</text>
          </g>
        ))}
        {marks.map((e) => (
          <g key={e.day + e.course}>
            <line x1={x(e.day)} x2={x(e.day)} y1={T - 4} y2={H - B} className="ref" />
            <text x={Math.min(x(e.day) + 3, W - R)} y={T - 8} textAnchor={x(e.day) > W - 90 ? 'end' : 'start'} className="axis">
              {short(e.course)}
              <title>{`${e.day} · ${e.prev_course ? `${e.prev_course} → ` : ''}${e.course}`}</title>
            </text>
          </g>
        ))}
        <path d={path} className="line" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.date)} cy={y(p.idx)} r={5} className="dot"><title>{label(p)}</title></circle>
            <circle cx={x(p.date)} cy={y(p.idx)} r={14} fill="transparent"><title>{label(p)}</title></circle>
          </g>
        ))}
        <text x={L} y={H - 6} className="axis">{pts[0].date}</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="axis">{pts[pts.length - 1].date}</text>
      </svg>
      <figcaption className="muted small">{t('growthCaption', { n: pts.length })}{marks.length ? t('growthMarks') : ''}</figcaption>
    </figure>
  );
}
