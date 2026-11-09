/**
 * 휴대폰 사진을 줄여서 data URL 로(진단서 사진 11/10 결정 I10). 긴 변 1600px JPEG, 1MB(서버 상한)를 넘으면 화질을 낮춘다.
 * 사진 위치 정보(EXIF)는 캔버스로 다시 그리면서 빠진다.
 */
const MAX_SIDE = 1600;
const MAX_BYTES = 1024 * 1024;

export async function shrinkImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('invalid_image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('invalid_image'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (((data.length - data.indexOf(',') - 1) * 3) / 4 <= MAX_BYTES) return data;
    }
    throw new Error('image_too_large');
  } finally {
    URL.revokeObjectURL(url);
  }
}
