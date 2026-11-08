import { useEffect } from 'react';
import { PORTALS } from '../portals';

const NO: Record<string, string> = { admin: '01', student: '02', agency: '03', teacher: '04' };

/** JIC 포털 첫 화면: 4개 포털로 들어가는 곳. 로그인 없이 보인다(각 포털이 자기 로그인을 한다). */
export default function Hub() {
  useEffect(() => {
    document.title = 'JIC 포털';
  }, []);
  return (
    <div className="hub">
      <header className="hub-top">
        <span className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">JIC 포털</span>
        </span>
      </header>

      <main className="hub-main">
        <h1 className="hub-title">포털 선택</h1>

        <ul className="hub-list">
          {PORTALS.map((p) => (
            <li key={p.key} className={'hub-item' + (p.url ? '' : ' off')}>
              <span className="hub-no">{NO[p.key]}</span>
              <div className="hub-body">
                {p.url ? (
                  <a href={p.url} className="hub-name">{p.name}</a>
                ) : (
                  <span className="hub-name">{p.name}</span>
                )}
                <span className="hub-users">{p.users}</span>
                {p.sub && (
                  <span className="hub-sub">
                    {p.sub.map((s) => (
                      <a key={s.label} href={s.url}>{s.label}</a>
                    ))}
                  </span>
                )}
              </div>
              {p.url ? (
                <a href={p.url} className="btn btn-primary">들어가기</a>
              ) : (
                <span className="hub-ready">준비 중</span>
              )}
            </li>
          ))}
        </ul>
      </main>

      <footer className="hub-foot">JIC English Academy · Baguio</footer>
    </div>
  );
}
