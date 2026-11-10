import { COUNTRIES } from '../../../../partner/src/shared';

/**
 * 국가별 콘텐츠(CL-036): 노출 국가와 국가별 우선 순서 입력 칸(편집 표 .kv 안의 두 줄).
 * 노출 국가를 하나도 고르지 않으면 모든 나라에 보인다. 우선 순서는 그 나라 지점에서 작은 수가 먼저 보이고, 비우면 기본 순서(고정 → 최신).
 * 다른 나라 지점은 DB 정책에서 막힌다(20261110163500_partner_country_targeting.sql).
 */
export function CountryFields({ countries, order, onChange }: { countries: string[]; order: Record<string, number>; onChange: (countries: string[], order: Record<string, number>) => void }) {
  const shown = countries.length ? countries : COUNTRIES;
  const toggle = (c: string, on: boolean) => {
    const next = COUNTRIES.filter((x) => (x === c ? on : countries.includes(x)));
    // 보이지 않게 된 나라의 순서는 지운다(모든 나라로 돌아가면 그대로 둔다)
    const o = Object.fromEntries(Object.entries(order).filter(([k]) => !next.length || next.includes(k)));
    onChange(next, o);
  };
  const setOrder = (c: string, v: string) => {
    const o = { ...order };
    if (v) o[c] = Math.max(1, Math.min(99, Number(v)));
    else delete o[c];
    onChange(countries, o);
  };
  return (
    <>
      <tr>
        <th>노출 국가</th>
        <td colSpan={3}>
          {COUNTRIES.map((c) => (
            <label key={c} style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={countries.includes(c)} onChange={(e) => toggle(c, e.target.checked)} /> {c}
            </label>
          ))}
          <span className="hint">아무 나라도 고르지 않으면 모든 나라 지점에 보입니다. 지점 국가는 가입 때 고른 값입니다.</span>
        </td>
      </tr>
      <tr>
        <th>먼저 보일 순서</th>
        <td colSpan={3}>
          {shown.map((c) => (
            <label key={c} style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
              {c} <input type="number" min={1} max={99} style={{ width: 56 }} aria-label={`${c} 우선 순서`} value={order[c] ?? ''} onChange={(e) => setOrder(c, e.target.value)} />
            </label>
          ))}
          <span className="hint">그 나라 지점에서 작은 수가 먼저 보입니다. 비우면 기본 순서(고정 → 최신).</span>
        </td>
      </tr>
    </>
  );
}

export const countryText = (countries?: string[] | null) => (countries?.length ? countries.join('·') : '모든 국가');
export const orderText = (order?: Record<string, number> | null) =>
  Object.entries(order ?? {})
    .sort((a, b) => a[1] - b[1])
    .map(([c, n]) => `${c} ${n}`)
    .join(', ');
