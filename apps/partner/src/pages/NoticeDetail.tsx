import { Link, useParams } from 'react-router-dom';
import { useLoad, type Notice } from '../data';
import { must, supabase } from '../supabase';
import { Box, Loading, PageHead, TAG_COLOR, Text } from '../ui';

export default function NoticeDetail() {
  const { id = '' } = useParams();
  const { data, error } = useLoad(() => must<Notice>(supabase.from('partner_notices').select('*').eq('id', Number(id)).single()), [id]);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={data.kind === 'promotion' ? '프로모션' : '공지'} side={<Link className="btn" to={`/notices${data.kind === 'promotion' ? '?tab=promotion' : ''}`}>목록</Link>} />
      <Box
        title={<><span style={{ color: TAG_COLOR[data.tag] ?? 'var(--ink-2)', fontSize: 13, marginRight: 8 }}>{data.tag}</span>{data.title}</>}
        extra={<span className="muted" style={{ fontSize: 12 }}>{data.created_at.slice(0, 10)}</span>}
      >
        <div className="box-body" style={{ lineHeight: 1.8 }}>
          {data.kind === 'promotion' && (
            <table className="kv" style={{ marginBottom: 14 }}>
              <tbody>
                <tr><th>기간</th><td>{data.starts_on ?? '-'} ~ {data.ends_on ?? '-'}</td></tr>
                <tr><th>대상</th><td>{data.target || '-'}</td></tr>
              </tbody>
            </table>
          )}
          <Text value={data.body} />
        </div>
      </Box>
    </>
  );
}
