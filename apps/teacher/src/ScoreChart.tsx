import type { CefrMapping, TestResult, TestType } from './data';

/**
 * 시험 종류 하나의 총점 추이(원칙 L2: 코스별 성적표와 CEFR 성장선). 한 줄짜리 선 그래프라 범례 없이 제목이 이름을 대신한다.
 * CEFR 대응 점수가 입력돼 있으면 가로 점선과 레벨 이름을 같이 그린다(JIC 기준 추정 레벨). 숫자는 아래 기록 표에 모두 있다.
 */
export default function ScoreChart({ type, results, maps }: { type: TestType; results: TestResult[]; maps: CefrMapping[] }) {
  const pts = results
    .filter((r) => r.test_type === type.code && r.section === '')
    .map((r) => ({ date: r.test_date, value: Number(r.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;

  // 휴대폰 폭(약 340px)에서 글자가 11px 안팎으로 보이게 좁은 화면 기준으로 그린다.
  const W = 360, H = 170, L = 34, R = 40, T = 10, B = 24;
  // 세로축은 점수가 있는 곳에 맞춘다(범위의 15% 여유, 시험 종류 범위를 넘지 않음). 단위에 맞춰 반올림.
  const vals = pts.map((p) => p.value);
  const span = Number(type.max_value) - Number(type.min_value);
  const step = Number(type.step) || 1;
  const snap = (v: number) => Math.round(v / step) * step;
  const min = Math.max(Number(type.min_value), snap(Math.min(...vals) - span * 0.15));
  const max = Math.min(Number(type.max_value), snap(Math.max(...vals) + span * 0.15));
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date);
  const x = (d: string) => L + (t1 === t0 ? (W - L - R) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const ticks = [...new Set([min, snap((min + max) / 2), max])];
  const levels = maps
    .filter((m) => m.test_type === type.code && Number(m.min_value) > min && Number(m.min_value) < max)
    .sort((a, b) => Number(a.min_value) - Number(b.min_value));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${type.name} 총점 추이 ${pts.map((p) => `${p.date} ${p.value}`).join(', ')}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {levels.map((m) => (
          <g key={m.cefr}>
            <line x1={L} x2={W - R} y1={y(Number(m.min_value))} y2={y(Number(m.min_value))} className="ref" />
            <text x={W - R + 6} y={y(Number(m.min_value)) + 4} className="axis">{m.cefr}</text>
          </g>
        ))}
        <path d={path} className="line" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.date)} cy={y(p.value)} r={5} className="dot">
              <title>{`${p.date} · ${p.value}`}</title>
            </circle>
            {/* 터치하기 쉽게 보이지 않는 큰 원 */}
            <circle cx={x(p.date)} cy={y(p.value)} r={14} fill="transparent">
              <title>{`${p.date} · ${p.value}`}</title>
            </circle>
          </g>
        ))}
        <text x={L} y={H - 6} className="axis">{pts[0].date}</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="axis">{pts[pts.length - 1].date}</text>
      </svg>
      <figcaption className="muted small">{type.name} 총점 {pts.length}회{levels.length ? ' · 점선은 CEFR 하한(JIC 기준 추정)' : ''}</figcaption>
    </figure>
  );
}
