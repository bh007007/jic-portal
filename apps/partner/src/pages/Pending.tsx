import { useAuth } from '../auth';
import { supabase } from '../supabase';
import { Box, Msg } from '../ui';

// 로그인은 했지만 아직 승인된 지점 계정이 아닐 때
export default function Pending() {
  const { request, member, session, reload } = useAuth();
  const isStaff = member?.role === 'staff';
  const status = member
    ? member.status === 'suspended' ? (isStaff ? 'staffSuspended' : 'suspended') : isStaff ? 'ownerSuspended' : 'suspended'
    : request?.status ?? 'none';
  const text: Record<string, string> = {
    pending: 'JIC 관리자가 등록 신청을 확인하고 있습니다. 승인되면 이 화면 대신 포털이 열립니다.',
    approved: '승인되었습니다. 새로고침하세요.',
    rejected: '등록 신청이 반려되었습니다.',
    suspended: '이 계정은 사용이 중지되었습니다. JIC 담당자에게 문의하세요.',
    staffSuspended: '지점 대표가 이 직원 아이디를 정지했습니다. 지점 대표에게 문의하세요.',
    ownerSuspended: '지점 대표 아이디가 사용 중지되어 직원 아이디도 쓸 수 없습니다. 지점 대표에게 문의하세요.',
    none: `이 계정에는 등록 신청이나 직원 등록 기록이 없습니다. 지점 직원이면 지점 대표에게 이 이메일(${session?.user.email ?? ''})을 직원으로 등록해 달라고 한 뒤 다시 로그인하세요. 지점 대표 아이디는 등록 신청 화면에서 신청합니다.`,
  };
  return (
    <div className="auth">
      <Box title="계정 확인">
        <div className="box-body form">
          <Msg kind={status === 'pending' || status === 'approved' ? 'warn' : 'err'}>{text[status]}</Msg>
          {request && (
            <table className="kv">
              <tbody>
                <tr><th>아이디</th><td>{session?.user.email}</td></tr>
                <tr><th>에이전시</th><td>{request.agency_name} {request.branch}</td></tr>
                <tr><th>신청일</th><td>{request.created_at.slice(0, 10)}</td></tr>
                {request.review_note && <tr><th>관리자 메모</th><td className="pre">{request.review_note}</td></tr>}
              </tbody>
            </table>
          )}
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            {status === 'none' && <button type="button" className="btn btn-primary" onClick={() => reload()}>다시 확인</button>}
            <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>
          </div>
        </div>
      </Box>
    </div>
  );
}
