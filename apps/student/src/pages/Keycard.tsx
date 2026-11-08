import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, useApi, type Profile } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { errorText, useI18n } from '../i18n';

interface Keycard {
  code: string;
  expiresAt: string;
  period: number;
  now: string;
}

/** QR 을 SVG 로(어두운 칸만 한 path). 화면을 밝게 보이도록 흰 여백을 둔다. */
function QrSvg({ text, size }: { text: string; size: number }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n: count + 8, d: path };
  }, [text]);
  return (
    <svg className="qr-svg" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** 출입 QR: 1분마다 바뀌는 서명된 값(서버가 만든다). 끝나기 3초 전에 새로 받는다. 가드 태블릿 카메라·스캐너가 읽는다. */
export default function KeycardPage() {
  const { t } = useI18n();
  const me = useApi<Profile>('/api/me');
  const [card, setCard] = useState<{ k: Keycard; offset: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const fetching = useRef(false);

  async function load() {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const k = await api<Keycard>('/api/keycard');
      setCard({ k, offset: Date.parse(k.now) - Date.now() });
      setError(null);
    } catch (e) {
      setError(errorText(t, (e as ApiError).code === 'network' ? 'qr_offline' : (e as ApiError).code));
    }
    fetching.current = false;
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    // 화면이 꺼지지 않게(지원하는 기기만)
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => {
      clearInterval(timer);
      void lock?.release().catch(() => undefined);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const left = card ? Math.max(0, Math.ceil((Date.parse(card.k.expiresAt) - (now + card.offset)) / 1000)) : 0;
  useEffect(() => {
    if (card && left <= 3) void load();
  }, [card, left]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me.error) return <LoadError onRetry={me.reload} />;
  if (!me.data) return <Loading />;
  return (
    <>
      <SubTitle title={t('qr.title')} back="/" />
      <div className="qr-page">
        {card ? (
          <>
            <QrSvg text={card.k.code} size={260} />
            <p className="qr-name">
              {me.data.student.name} <span className="muted">{me.data.student.stId}</span>
            </p>
            <p className="muted" role="timer">
              {t('qr.left', { s: left })}
            </p>
          </>
        ) : !error ? (
          <Loading />
        ) : null}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-hint">{t('qr.hint')}</p>
      </div>
    </>
  );
}
