/**
 * 학생 사진(11/10 결정 I9): 직원이 인트라넷 '사진 관리'에서 올리고 Student File·사진 관리에서 본다.
 * 파일은 저장소(배포 Supabase Storage 'student-photos', 로컬 폴더)의 '<학생번호>/<번호>.<확장자>', 올릴 때마다 기록(PhotoLog)을 남긴다.
 * 학생의 지금 사진 = 그 학생의 가장 최근 기록. 지우지 않는다(바꾸면 새로 올린다). DB 는 20261110160000_student_photos.sql.
 */

/** 올린 기록 한 건 */
export interface StudentPhoto {
  id: string;
  stId: string;
  path: string;
  contentType: string;
  size: number;
  /** staff = 직원이 올림, vendor = 업체 사진을 한꺼번에 옮김 */
  source: 'staff' | 'vendor';
  uploadedBy: string;
  uploadedAt: string;
}

/** 올린 기록 저장소(배포: student_photos 표와 DB 함수 student_photo_record, 로컬: 파일) */
export interface PhotoLog {
  all(): Promise<StudentPhoto[]>;
  /** 파일을 저장소에 올린 뒤 기록한다. 배포는 DB 함수가 파일이 있는지 확인한다 */
  add(v: Omit<StudentPhoto, 'source'>): Promise<StudentPhoto>;
}

/** 학생별 가장 최근 기록(지금 사진) */
export function latestPhotos(list: StudentPhoto[]): Map<string, StudentPhoto> {
  const out = new Map<string, StudentPhoto>();
  for (const p of list) {
    const cur = out.get(p.stId);
    if (!cur || p.uploadedAt > cur.uploadedAt || (p.uploadedAt === cur.uploadedAt && p.id > cur.id)) out.set(p.stId, p);
  }
  return out;
}

/** 저장 경로: '<학생번호>/<번호>.<확장자>'(DB 의 student_photos_path_check 와 같은 모양, 번호는 uuid) */
export const photoPath = (stId: string, id: string, ext: string) => `${stId}/${id}.${ext}`;
export const STUDENT_NO = /^[A-Za-z0-9_-]{1,40}$/;
