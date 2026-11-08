/** 시각 표시는 필리핀 시간(Asia/Manila) 기준. 태블릿·PC 시간대 설정과 관계없이 같게 보인다. */
const TZ = 'Asia/Manila';
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 21:46 */
export const hm = (iso: string | null | undefined) => (iso ? hmFmt.format(new Date(iso)) : '-');
/** 2026-11-05 (현지 날짜) */
export const localDate = (iso: string | number) => dateFmt.format(new Date(iso));
/** 11-05 21:46 */
export const mdhm = (iso: string | null | undefined) => (iso ? `${localDate(iso).slice(5)} ${hm(iso)}` : '-');
/** 2026-11-05 → 11-05 */
export const md = (date: string) => date.slice(5);
/** 164 → 2시간 44분 */
export function duration(min: number | null) {
  if (min === null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}시간 ${String(m).padStart(2, '0')}분` : `${m}분`;
}
const WEEK = '일월화수목금토';
/** 2026-11-07 (토) */
export const dateWithDay = (date: string) => `${date} (${WEEK[new Date(date + 'T00:00:00Z').getUTCDay()]})`;
