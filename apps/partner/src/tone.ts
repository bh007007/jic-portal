import { useEffect } from 'react';

/** 캠퍼스 색(디자인 원칙 D2·2.1): 색은 정보다. 캠퍼스를 구분할 때만 쓰고, 늘 캠퍼스 이름과 함께 쓴다. */
export type Tone = 'pre' | 'cha' | 'new' | 'mco';
const TONES: Record<string, Tone> = { premium: 'pre', challenger: 'cha', new: 'new', mco: 'mco' };
export const toneOf = (campusId?: string | null): Tone | undefined => TONES[campusId ?? ''];

/** 한 캠퍼스에 속한 화면이면 강조색을 그 캠퍼스 색으로(body[data-campus]). 화면을 떠나면 되돌린다 */
export function useCampusTone(campusId?: string | null) {
  useEffect(() => {
    const tone = toneOf(campusId);
    if (tone) document.body.dataset.campus = tone;
    else delete document.body.dataset.campus;
    return () => {
      delete document.body.dataset.campus;
    };
  }, [campusId]);
}
