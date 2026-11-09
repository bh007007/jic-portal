import type { Course } from './data';

// 관리자 포털(apps/admin '에이전시 포털 콘텐츠')도 가져다 쓰는 값. Supabase·화면·문구(i18n)에 기대지 않아야 한다(관리자 앱이 이 파일만 읽어도 되게).

/** 화면에 보이는 코스 이름(CL-009) */
export const courseLabel = (c: Pick<Course, 'name' | 'display_name'>) => c.display_name || c.name;

/** 보는 사람 기기의 오늘(YYYY-MM-DD). toISOString 은 세계 표준시라 한국·필리핀 오전에는 어제 날짜가 된다 */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtSize = (n: number | null) =>
  n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** 자료실 분류(12.4)와 파일을 올리는 저장소 버킷 */
export const RESOURCE_CATEGORIES = ['가격표', '코스 브로슈어', '시설·수업 사진·영상', '등록 서류', '학사·생활 규정'];
export const RESOURCE_BUCKET = 'partner-resources';
