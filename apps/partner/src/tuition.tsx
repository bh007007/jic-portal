import type { Campus, Currency, PriceBook } from '../../../packages/quote/src';
import { CAMPUS_LABEL, CURRENCIES, CURRENCY_LABEL, localFeeRows, manilaToday, money, noticeFor, peso, type ActiveBook } from './priceBook';
import { supabase } from './supabase';
import { Box } from './ui';

/**
 * 학비표 표(CL-038·CL-057): 관리자 포털 '가격표 › 견적 가격'의 승인 버전(price_books)을 4주 단가로 보인다.
 * '비용·등록 › 학비표'와 상담 ⑤ 비용(CL-049)이 같이 쓰고, 견적(/quote)과 같은 가격 버전을 읽는다.
 * 커미션·프로모션·환율은 없다. 기간별 금액·할인·프로모션은 견적에서 계산한다.
 */

/** 지금 적용 중인 승인 가격 버전. 못 읽으면 null(지점 직원 아이디는 정책상 0줄 → null, CL-043) */
export async function loadActiveBook(): Promise<ActiveBook | null> {
  const { data, error } = await supabase
    .from('price_books').select('version, label, effective_from, data')
    .eq('status', 'approved').lte('effective_from', manilaToday())
    .order('effective_from', { ascending: false }).order('version', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as ActiveBook;
  return { ...row, effective_from: String(row.effective_from).slice(0, 10) };
}

/** 통화 고르기: JIC 직원 화면만(지점은 지점 국가의 가격 체계로 고정, CL-063) */
export function CurrencyPick({ cur, onChange }: { cur: Currency; onChange: (c: Currency) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      통화
      <select value={cur} onChange={(e) => onChange(e.target.value as Currency)}>
        {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
      </select>
    </label>
  );
}

/** campus 를 주면(상담 ⑤) 그 캠퍼스의 코스·숙소만 보인다(현지 비용은 공통, 그 캠퍼스에 없는 줄만 뺌) */
export function TuitionTables({ book, cur, campus }: { book: PriceBook; cur: Currency; campus?: Campus }) {
  const mine = (c: Campus) => !campus || c === campus;
  const courses = book.courses.filter((c) => mine(c.campus));
  const dorms = book.dorms.filter((d) => mine(d.campus));
  const fees = localFeeRows(book, campus);
  return (
    <>
      <Box title="코스 (4주 기준)">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th>캠퍼스</th><th className="left">코스</th><th className="num">{CURRENCY_LABEL[cur]}</th><th className="num">교재비(₱)</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>{CAMPUS_LABEL[c.campus]}</td>
                  <td className="left strong">{c.id}{c.guarantee && <span className="muted" style={{ fontWeight: 400 }}> · 8주 고정</span>}</td>
                  <td className="num">{money(cur, c.price[cur])}</td>
                  <td className="num">{peso(c.textbookPhp)}</td>
                </tr>
              ))}
              {courses.length === 0 && <tr className="empty"><td colSpan={4}>코스 가격이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
      <Box title="숙소 (4주 기준)">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th>캠퍼스</th><th className="left">숙소</th><th className="num">{CURRENCY_LABEL[cur]}</th></tr></thead>
            <tbody>
              {dorms.map((d) => (
                <tr key={d.id}><td>{CAMPUS_LABEL[d.campus]}</td><td className="left strong">{d.id}</td><td className="num">{money(cur, d.price[cur])}</td></tr>
              ))}
              {dorms.length === 0 && <tr className="empty"><td colSpan={3}>숙소 가격이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
      <Box title="등록금 · 현지 비용">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th className="left">이름</th><th className="left">기준</th><th className="num">금액</th></tr></thead>
            <tbody>
              <tr><td className="left strong">등록금</td><td className="left muted">1회</td><td className="num">{money(cur, book.registration[cur])}</td></tr>
              {fees.map((f) => (
                <tr key={f.key}><td className="left">{f.name}</td><td className="left muted">{f.basis}</td><td className="num">{peso(f.php)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>현지 비용은 페소(₱) 금액입니다(환산하지 않음). {noticeFor(cur)}</p>
        </div>
      </Box>
    </>
  );
}
