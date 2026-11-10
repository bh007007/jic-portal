/**
 * 사진 파일(진단서 사진 11/10 결정 I10, 학생 사진 I9): 화면이 보낸 data URL 을 확인하고, 저장소(배포 Supabase Storage, 로컬 파일)에 둔다.
 * 파일·네트워크 의존은 저장소 쪽(supabaseFiles 는 fetch, 로컬은 localData.ts)에만 있다.
 */

/** 받는 사진 종류와 크기 상한(화면이 휴대폰에서 줄여 보낸다: 긴 변 1600px JPEG) */
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const IMAGE_MAX_BYTES = 1024 * 1024;
/** 사진을 담는 요청 본문 상한(base64 는 4/3 배) */
export const IMAGE_BODY_LIMIT = Math.ceil((IMAGE_MAX_BYTES * 4) / 3) + 4096;

export interface StoredFile {
  bytes: Uint8Array;
  contentType: string;
}
export interface FileStore {
  put(path: string, file: StoredFile): Promise<void>;
  get(path: string): Promise<StoredFile | null>;
}

/** 'data:image/jpeg;base64,...' → 바이트. 종류·크기가 맞지 않으면 오류 코드 */
export function parseImageDataUrl(v: unknown): { ok: true; file: StoredFile; ext: string } | { ok: false; error: 'invalid_image' | 'image_too_large' } {
  const m = typeof v === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(v) : null;
  if (!m) return { ok: false, error: 'invalid_image' };
  if ((m[2].length * 3) / 4 > IMAGE_MAX_BYTES + 3) return { ok: false, error: 'image_too_large' };
  let bin: string;
  try {
    bin = atob(m[2]);
  } catch {
    return { ok: false, error: 'invalid_image' };
  }
  if (bin.length > IMAGE_MAX_BYTES) return { ok: false, error: 'image_too_large' };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // 파일 머리로 종류를 한 번 더 본다(이름만 바꾼 파일을 막는다)
  const head = (n: number[]) => n.every((b, i) => bytes[i] === b);
  const real = head([0xff, 0xd8, 0xff]) ? 'image/jpeg' : head([0x89, 0x50, 0x4e, 0x47]) ? 'image/png' : head([0x52, 0x49, 0x46, 0x46]) ? 'image/webp' : null;
  if (real !== m[1]) return { ok: false, error: 'invalid_image' };
  return { ok: true, file: { bytes, contentType: m[1] }, ext: IMAGE_TYPES[m[1]] };
}

/** 바이트 → data URL(화면에 그대로 보인다) */
export function toDataUrl(f: StoredFile): string {
  let bin = '';
  for (let i = 0; i < f.bytes.length; i += 0x8000) bin += String.fromCharCode(...f.bytes.subarray(i, i + 0x8000));
  return `data:${f.contentType};base64,${btoa(bin)}`;
}

/**
 * 배포: Supabase Storage 의 버킷 하나. auth 는 로그인한 사람의 토큰 헤더(Storage RLS 가 막는다).
 * 경로는 '<폴더>/<파일>'(예: '<학생번호>/<신청 번호>.jpg'). 같은 경로에 다시 올리면 바꾼다.
 */
export function supabaseFiles(url: string, auth: Record<string, string>, bucket: string, fetchFn: typeof fetch = fetch): FileStore {
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object`;
  const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  return {
    async put(path, f) {
      const r = await fetchFn(`${base}/${bucket}/${enc(path)}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': f.contentType, 'x-upsert': 'true', 'cache-control': 'no-store' },
        body: new Blob([f.bytes as BlobPart], { type: f.contentType }),
      });
      if (!r.ok) throw new Error(`storage_${r.status}`);
    },
    async get(path) {
      const r = await fetchFn(`${base}/authenticated/${bucket}/${enc(path)}`, { headers: auth });
      if (r.status === 400 || r.status === 404) return null; // 없거나 볼 수 없음(Storage 는 둘 다 400)
      if (!r.ok) throw new Error(`storage_${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get('Content-Type') ?? 'application/octet-stream' };
    },
  };
}
