/**
 * 시제품 V74 콘텐츠 묶음(11/11, CL-041)의 파일 이름으로 사진 보관함의 화면 위치·캠퍼스·순서를 미리 고른다(명세 4.4 '첫 내용은 콘텐츠 묶음을 한 번에').
 * 관리자 포털 사진 보관함이 여러 장을 올릴 때 '파일 이름으로 자동 분류'를 켜면 쓴다. 고른 값은 올린 뒤 고칠 수 있다.
 * 기준: 묶음의 00_파일_안내.xlsx — 02 사진 묶음(pk번호_묶음_항목 키), 03 관리자 업로드(화면 자리_o순서_번호), 04 화면 고정(한글 이름).
 * 학비표 이미지·서약서·영상 표지는 사진 보관함에 넣지 않는다(학비표는 가격표에서 읽음 CL-038, 영상은 유튜브 CL-047).
 */
export interface PhotoGuess {
  placement: string;
  campus: string;
  sort: number;
  caption: string;
  /** 올리지 않는 파일이면 그 까닭 */
  skip?: string;
}

const CAMPUS: Record<string, string> = { pre: 'premium', cha: 'challenger', mco: 'mco', new: 'new', jun: 'premium' };

/** 묶음 항목 키(02 사진 묶음의 PHOTO_ 뒤) → 화면 위치·캠퍼스 */
function byKey(key: string): { placement: string; campus: string } {
  const k = key.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = k.match(/^t_(pre|cha)$/))) return { placement: 'campus_card', campus: CAMPUS[m[1]] };
  if (k === 't_jun' || /^jr_/.test(k) || /^fam_/.test(k)) return { placement: 'camp', campus: 'premium' };
  if (/^mco_/.test(k) || /^s_mco_/.test(k)) return { placement: 'camp', campus: 'mco' };
  if (k === 'g_why') return { placement: 'why_jic', campus: '' };
  if ((m = k.match(/^g_s(pre|cha)$/))) return { placement: 'campus_gallery', campus: CAMPUS[m[1]] };
  if (k === 'g_course') return { placement: 'academic', campus: '' };
  if (k === 'g_day') return { placement: 'day', campus: '' };
  if (k === 'g_life') return { placement: 'consult', campus: '' };
  if (k === 'g_dorm') return { placement: 'dorm', campus: '' };
  if ((m = k.match(/^(pre|cha)_f\d+$/))) return { placement: 'campus_gallery', campus: CAMPUS[m[1]] };
  if (/^cls_/.test(k) || /^s_test\d*$/.test(k)) return { placement: 'academic', campus: '' };
  if ((m = k.match(/^s_(pre|cha)_(room|bed|desk|common|ext|bath)/))) return { placement: 'dorm', campus: CAMPUS[m[1]] };
  if ((m = k.match(/^s_(pre|cha)_(meal\d*|hall)$/))) return { placement: 'meals', campus: CAMPUS[m[1]] };
  if (k === 's_cha_event') return { placement: 'event', campus: 'challenger' };
  if (/^s_(zumba|yoga|golf|barista\d*|magic\d*|ai|special)$/.test(k)) return { placement: 'activity', campus: '' };
  if (/^c_ov\d+$/.test(k)) return { placement: 'campus_gallery', campus: 'challenger' };
  if (/^c_(r\d+|2\d\d)_\d+$/.test(k)) return { placement: 'dorm', campus: 'challenger' };
  return { placement: '', campus: '' };
}

/** 관리자 업로드(03)의 화면 자리(topic) → 화면 위치·캠퍼스 */
function byTopic(topic: string): { placement: string; campus: string; caption?: string } {
  let m: RegExpMatchArray | null;
  if ((m = topic.match(/^hero_campus_(pre|cha|new)$/))) return { placement: 'campus_hero', campus: CAMPUS[m[1]] };
  if ((m = topic.match(/^spot_(pre|cha)_academic$/))) return { placement: 'academic', campus: CAMPUS[m[1]] };
  if ((m = topic.match(/^map_(pre|cha)$/))) return { placement: 'map', campus: CAMPUS[m[1]] };
  if ((m = topic.match(/^gal_(pre|cha)$/))) return { placement: 'campus_gallery', campus: CAMPUS[m[1]] };
  if ((m = topic.match(/^list_(pre|cha)$/))) return { placement: 'campus_card', campus: CAMPUS[m[1]] };
  if (topic === 'tile_mco') return { placement: 'camp', campus: 'mco' };
  if (topic === 'baguio_hero') return { placement: 'baguio', campus: '' };
  if ((m = topic.match(/^act_(.+)$/))) return { placement: 'activity', campus: '', caption: m[1] };
  return { placement: '', campus: '' }; // guide_01 등은 직원이 고른다
}

export function guessFromName(fileName: string): PhotoGuess {
  const base = fileName.replace(/^.*[\\/]/, '');
  const stem = base.replace(/\.[^.]+$/, '');
  const ext = (base.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return { placement: '', campus: '', sort: 0, caption: '', skip: ext === 'mp4' ? '영상은 유튜브 주소로 넣습니다(JIC Play)' : '사진(jpg·png·webp)이 아닙니다' };
  let m: RegExpMatchArray | null;
  // 02 사진 묶음: pk000_PHOTO_t_pre, pk059_CAMPUS_PHOTO_CLEAN_pre, pk121_MAP_IMG_pre, pk040_FEE_IMG_pre_t, pk020_-_unused
  if ((m = stem.match(/^pk(\d{3})_(.+)$/))) {
    const sort = Number(m[1]);
    const rest = m[2];
    if (/^FEE_/.test(rest)) return { placement: '', campus: '', sort, caption: '', skip: '학비표 이미지는 사진 보관함에 넣지 않습니다(학비표는 가격표에서, CL-038)' };
    if (/^-_/.test(rest)) return { placement: '', campus: '', sort, caption: '', skip: '서약서·쓰지 않는 파일' };
    if (/^REPORT_ASSET_/.test(rest)) return { placement: '', campus: '', sort, caption: '', skip: '리포트 양식은 근거 자료로 넣습니다' };
    let k: RegExpMatchArray | null;
    if ((k = rest.match(/^CAMPUS_PHOTO_CLEAN_(pre|cha)$/))) return { placement: 'campus_hero', campus: CAMPUS[k[1]], sort, caption: '' };
    if ((k = rest.match(/^CAMPUS_PHOTO_(pre|cha)$/))) return { placement: 'campus_card', campus: CAMPUS[k[1]], sort, caption: '' };
    if ((k = rest.match(/^MAP_IMG_(pre|cha)$/))) return { placement: 'map', campus: CAMPUS[k[1]], sort, caption: '' };
    // 바기오 주변 여행지(pk020~039). 안내 시트에는 '서약서'로 적혀 있지만 실제 파일은 여행지 사진이다(11/11 넣을 때 확인)
    if ((k = rest.match(/^TRAVEL_(.+)$/))) return { placement: 'baguio', campus: '', sort, caption: k[1].replace(/_/g, ' ') };
    if ((k = rest.match(/^PHOTO_(.+)$/))) return { ...byKey(k[1]), sort, caption: '' };
    return { placement: '', campus: '', sort, caption: '' };
  }
  // 03 관리자 업로드: spot_pre_academic_o1_669860, guide_01_o-2_dbbeac, act_줌바_o0_f68f56
  if ((m = stem.match(/^(.+?)_o(-?\d+)_[0-9a-f]{6}$/))) {
    const g = byTopic(m[1]);
    return { placement: g.placement, campus: g.campus, sort: Number(m[2]), caption: g.caption ?? '' };
  }
  // 04 화면 고정: 골프_레슨_a1321db5, 수업_1대1_…, 할로윈_1_…, New캠퍼스_티저_…
  if ((m = stem.match(/^(.+?)_([0-9a-f]{8})$/))) {
    const name = m[1];
    const caption = name.replace(/_/g, ' ');
    if (/^골프/.test(name)) return { placement: 'activity', campus: '', sort: 0, caption };
    if (/^수업/.test(name)) return { placement: 'academic', campus: '', sort: 0, caption };
    if (/^할로윈/.test(name)) return { placement: 'event', campus: 'premium', sort: Number(name.match(/(\d+)$/)?.[1] ?? 0), caption: '할로윈 파티' };
    if (/^New캠퍼스/.test(name)) return { placement: 'campus_hero', campus: 'new', sort: 0, caption };
  }
  // 05 영상 표지
  if (/^JICPlay_/i.test(stem)) return { placement: '', campus: '', sort: 0, caption: '', skip: '영상 표지(유튜브 표지를 씁니다)' };
  return { placement: '', campus: '', sort: 0, caption: '' };
}
