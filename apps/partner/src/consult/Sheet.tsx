import { useEffect, useRef, type ReactNode } from 'react';
import type { Course, CourseContent } from '../data';
import { courseLabel } from '../data';
import { Text } from '../ui';

/**
 * 상담 모드에서 같은 화면 위에 크게 여는 창(CL-049·050: 다른 메뉴나 새 창으로 가지 않는다, 닫으면 같은 자리로).
 * 코스 상세와 추천 이유의 증거(CL-050, 다음 단계)가 쓴다. Esc 또는 배경을 누르면 닫힌다.
 */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** 코스 상세(공통 템플릿, CoursePage 와 같은 칸) — 상담 모드 안에서 보여 준다 */
export function CourseSheet({ course, content, campusName, onClose }: { course: Course; content?: CourseContent; campusName?: string; onClose: () => void }) {
  return (
    <Sheet title={<>{courseLabel(course)} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{campusName}</span></>} onClose={onClose}>
      <table className="kv">
        <tbody>
          <tr><th>한 줄 소개</th><td><Text value={content?.summary} /></td></tr>
          <tr><th>추천 대상</th><td><Text value={content?.target} /></td></tr>
        </tbody>
      </table>
      {course.levels.length > 0 && (
        <div className="scroll" style={{ marginTop: 16 }}>
          <table className="tbl center">
            <thead><tr><th>단계·옵션</th><th>수업량</th><th>수업 강도</th><th className="left">포함 내용</th></tr></thead>
            <tbody>
              {course.levels.map((l) => (
                <tr key={l.name}>
                  <td className="strong">{l.name}</td>
                  <td><Text value={l.lessons} /></td>
                  <td><Text value={l.intensity} /></td>
                  <td className="left"><Text value={l.includes} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 style={{ margin: '18px 0 6px' }}>수업 구성 · 시간표 · 교재</h3>
      <Text value={content?.structure} />
      <h3 style={{ margin: '18px 0 6px' }}>학습 결과물 · 실제 사례</h3>
      <Text value={content?.outcomes} />
    </Sheet>
  );
}
