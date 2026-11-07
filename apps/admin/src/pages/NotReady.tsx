import { Link } from 'react-router-dom';

export default function NotReady() {
  return (
    <div className="state-msg">
      준비 중인 화면입니다. <Link to="/">대시보드로</Link>
    </div>
  );
}
