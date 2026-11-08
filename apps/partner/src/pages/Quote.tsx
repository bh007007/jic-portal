import { useAuth } from '../auth';
import { loadSettings, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, OutLink, PageHead } from '../ui';

const ROUTES: [string, string, string][] = [
  ['quote_kr', 'KR', 'KRW'],
  ['quote_jp', 'JP', 'JPY'],
  ['quote_usd', 'USD', 'USD'],
  ['quote_usd_new', 'USD-New', 'USD'],
];

// 5.1 견적: 기존 견적 사이트로 연결만 한다. 포털에서 가격을 입력하지 않는다(원칙 Q1).
export default function Quote() {
  const { member } = useAuth();
  const { data, error } = useLoad(loadSettings);
  if (!data) return <Loading error={error} />;
  const preferred = member?.currency ?? 'KRW';
  return (
    <>
      <PageHead title={t('nav.quote')} />
      <Box>
        <div className="box-body">
          <table className="tbl center">
            <thead><tr><th>경로</th><th>통화</th><th>견적 사이트</th></tr></thead>
            <tbody>
              {ROUTES.map(([key, label, cur]) => (
                <tr key={key} style={cur === preferred ? { background: 'var(--primary-soft)' } : undefined}>
                  <td className="strong">{label}</td>
                  <td>{cur}{cur === preferred ? <span className="muted"> (기본)</span> : ''}</td>
                  <td><OutLink href={data[key]} className="btn btn-sm">열기</OutLink></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>기본 통화는 '내 계정'에서 바꿀 수 있습니다. 가격은 견적 사이트가 기준입니다.</p>
        </div>
      </Box>
    </>
  );
}
