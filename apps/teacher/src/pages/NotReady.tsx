import { Link } from 'react-router-dom';

export default function NotReady({ title }: { title: string }) {
  return (
    <div className="state">
      <p><strong>{title}</strong>: 준비 중인 화면입니다.</p>
      <Link to="/more">더보기</Link>
    </div>
  );
}
