/** 날짜 표시. 데이터의 날짜는 'YYYY-MM-DD'(필리핀 현지 날짜), 제출 시각은 ISO 문자열이다. */
const pad = (n: number) => String(n).padStart(2, '0');

const parts = (date: string) => {
  const [y, m, d] = date.split('-');
  return { y, m, d };
};

/** 2026.11.10 */
export const ymd = (date: string) => (date ? date.replace(/-/g, '.') : '-');

/** 11.10 */
export const md = (date: string) => {
  const { m, d } = parts(date);
  return `${m}.${d}`;
};

/** 요일 번호(0=일요일) */
export const dayOfWeek = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();

/** 제출 시각: 11.09 21:40 (이 기기 시간대) */
export const mdhm = (iso: string) => {
  const t = new Date(iso);
  return `${pad(t.getMonth() + 1)}.${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

/** 처리 시각: 2026.11.09 21:40 */
export const ymdhm = (iso: string) => {
  const t = new Date(iso);
  return `${t.getFullYear()}.${pad(t.getMonth() + 1)}.${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

/** 생년월일 1995-03-25 → 19950325 (로그인 안내용) */
export const compactDate = (date: string) => date.replace(/\D/g, '');
