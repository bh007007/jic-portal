import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

// 브라우저 내장 QR 읽기(Chrome·안드로이드 등). 없으면 jsQR 로 읽는다(아이패드 Safari 등).
type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** 같은 QR 값을 다시 읽지 않는 시간: 학생이 화면을 계속 비추고 있어도 한 번만 처리한다(QR 값은 1분마다 바뀐다). */
const SAME_CODE_MS = 30_000;

/**
 * 가드 태블릿 카메라로 카드키 QR 을 읽는다. 읽을 때마다 onCode(값)를 부른다(같은 값은 30초 동안 한 번).
 * 카메라는 https(또는 이 PC의 개발 서버)에서만 열린다. 화면을 떠나거나 끄면 카메라를 끈다.
 */
export function QrCamera({ facing, onCode }: { facing: 'user' | 'environment'; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onCode);
  handler.current = onCode;

  useEffect(() => {
    setError(null);
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const seen = new Map<string, number>();
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    let detector: Detector | null = null;
    try {
      detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
    } catch {
      detector = null;
    }

    const read = async (v: HTMLVideoElement): Promise<string | null> => {
      if (detector) {
        try {
          return (await detector.detect(v))[0]?.rawValue ?? null;
        } catch {
          detector = null; // 내장 읽기가 안 되면 jsQR 로
        }
      }
      if (!g) return null;
      const scale = Math.min(1, 640 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      g.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };

    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const code = await read(v).catch(() => null);
        const now = Date.now();
        for (const [k, at] of seen) if (now - at > SAME_CODE_MS) seen.delete(k);
        if (code && !seen.has(code)) {
          seen.set(code, now);
          handler.current(code);
        }
      }
      timer = window.setTimeout(() => void tick(), 200);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 주소에서는 카메라를 쓸 수 없습니다(https 주소에서 여세요).');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
        void tick();
      })
      .catch((e: { name?: string }) => setError(e?.name === 'NotAllowedError' ? '카메라 사용을 허용해 주세요(브라우저 주소창의 카메라 권한).' : '카메라를 열지 못했습니다.'));
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  return error ? <p className="guard-camera-error">{error}</p> : <video ref={video} className="guard-video" playsInline muted aria-label="카메라" />;
}
