import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../data';
import { t } from '../i18n';
import { basisLabel, bookOf, currencyOf } from '../priceBook';
import { CurrencyPick, loadActiveBook, TuitionTables } from '../tuition';
import { Box, Loading, PageHead } from '../ui';

/**
 * 비용·등록 > 학비표·환불(CL-037·CL-038·CL-057). 가격은 관리자 포털 '가격표 › 견적 가격'의 승인 버전(price_books)이고
 * 여기서는 읽기만 한다(포털에서 가격 입력 안 함). 견적(/quote)과 같은 버전·같은 통화(지점 국가, CL-063)다.
 * 4주 단가와 현지 비용만 보이고, 기간별 금액·할인·프로모션은 견적에서 계산한다. 지점 대표 아이디만(CL-032·043).
 */
export default function Tuition() {
  const { member } = useAuth();
  const { data: active, loading } = useLoad(() => loadActiveBook().catch(() => null));
  const [cur, setCur] = useState(currencyOf(member?.country));
  if (loading) return <Loading />;
  const book = bookOf(active ?? null);

  return (
    <>
      <PageHead
        title={t('menu.tuition')}
        side={
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>가격 기준: {basisLabel(active ?? null)}</span>
            {!member && <CurrencyPick cur={cur} onChange={setCur} />}
          </span>
        }
      />
      <TuitionTables book={book} cur={cur} />
      <p className="muted" style={{ fontSize: 12 }}>
        모두 4주 기준 금액입니다. 기간별 금액·할인·프로모션은 <Link to="/quote">견적</Link>에서 계산합니다. 가격은 JIC 관리자 포털 가격표에서 읽습니다(CL-038).
        {!member ? ' 직원 화면: 지점은 지점 국가의 통화로만 봅니다. 커미션은 이 화면에 나오지 않습니다.' : ''}
      </p>
      <Box title="환불 규정">
        <p className="empty">{t('common.preparing')}</p>
      </Box>
    </>
  );
}
