import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { PORTALS } from '../portals';
import { Panel } from './ui';

interface Row {
  day: string;
  start_time: string;
  campus: string;
  subject: string;
  teacher_name: string;
  room: string;
  result: 'AT' | 'AB' | 'TA' | null;
  late_min: number | null;
  excused: boolean;
  request_kind: 'sick' | 'official' | 'personal' | null;
  request_status: 'pending' | 'approved' | 'rejected' | null;
}

const TEACHER_URL = PORTALS.find((p) => p.key === 'teacher')?.url ?? '/teacher/';
const RESULT: Record<string, string> = { AT: '출석', AB: '결석', TA: '지각' };
const KIND: Record<string, string> = { sick: '병결', official: '공결', personal: '개인' };
const STATUS: Record<string, string> = { pending: '처리 전', approved: '인정', rejected: '반려' };
const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** 결석 사유: 사유 인정 / 그날 승인된 결석 신청 / 무단(강사 포털 출석 확인·인트라넷 무단결석 패널티와 같은 기준) */
function reason(r: Row) {
  if (r.result !== 'AB') return r.result === 'TA' && r.late_min ? `${r.late_min}분 지각` : '';
  if (r.excused) return '사유 인정';
  if (r.request_kind && r.request_status === 'approved') return KIND[r.request_kind] ?? r.request_kind;
  return '무단';
}

/**
 * 학생 상세의 '강사 포털 출석'(최근 4주, lms_student_attendance, 20261109080000_attendance_summary.sql).
 * 강사가 강사 포털에서 체크한 수업별 출석을 직원이 같은 DB에서 본다(원칙 C2). 결석·지각만 줄로, 합계는 제목에.
 * 데이터는 Supabase 에만 있어 배포 주소(로그인)에서만 나온다. 로컬 데이터 실행에서는 패널을 그리지 않는다.
 */
export default function LmsAttendance({ stId }: { stId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const today = manilaToday();
  const from = shift(today, -27);

  useEffect(() => {
    if (!supabase || !stId) return;
    let alive = true;
    supabase.rpc('lms_student_attendance', { p_student_no: stId, p_from: from, p_to: today }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(/lms_student_attendance|PGRST202|does not exist/.test(e.message + e.code) ? '강사 포털 출석 함수가 아직 없습니다(Supabase 마이그레이션 적용 전).' : e.message);
      else setRows((data ?? []) as Row[]);
    });
    return () => {
      alive = false;
    };
  }, [stId, from, today]);

  if (!supabase) return null;
  const all = rows ?? [];
  const n = (res: Row['result']) => all.filter((r) => r.result === res).length;
  const unexcused = all.filter((r) => reason(r) === '무단').length;
  const issues = all.filter((r) => r.result !== 'AT');
  return (
    <Panel
      title={<>강사 포털 출석 <small>({from} ~ {today}{rows ? ` · 출석 ${n('AT')} · 결석 ${n('AB')}${unexcused ? `(무단 ${unexcused})` : ''} · 지각 ${n('TA')}` : ''})</small></>}
      extra={<a className="more" href={`${TEACHER_URL}${TEACHER_URL.endsWith('/') ? '' : '/'}students/${encodeURIComponent(stId)}`}>강사 포털에서 보기 &gt;</a>}
    >
      {error ? (
        <div className="state-msg">{error}</div>
      ) : !rows ? (
        <div className="state-msg">불러오는 중…</div>
      ) : (
        <table className="tbl center" style={{ minWidth: 640 }}>
          <thead>
            <tr><th>날짜</th><th>시각</th><th>과목·교실</th><th>강사</th><th>결과</th><th className="left">사유·결석 신청</th></tr>
          </thead>
          <tbody>
            {all.length === 0 && <tr className="empty"><td colSpan={6}>최근 4주 강사 포털 출석 기록이 없습니다.</td></tr>}
            {all.length > 0 && issues.length === 0 && <tr className="empty"><td colSpan={6}>결석·지각 없음</td></tr>}
            {issues.map((r, i) => (
              <tr key={r.day + r.start_time + i}>
                <td className="nowrap">{r.day}</td>
                <td>{r.start_time}</td>
                <td>{[r.subject, r.room].filter(Boolean).join(' · ') || r.campus}</td>
                <td className="muted">{r.teacher_name}</td>
                <td className={r.result === 'AB' ? 'text-red strong' : r.result ? 'strong' : 'muted'}>{r.result ? RESULT[r.result] : '미체크'}</td>
                <td className="left">
                  {reason(r)}
                  {r.request_kind && !(r.result === 'AB' && !r.excused && r.request_status === 'approved') && (
                    <span className="muted"> · 결석 신청 {KIND[r.request_kind]} {r.request_status ? STATUS[r.request_status] : ''}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
