import { PRICE_BOOK_2026 } from './prices2026';
import type { PickupDef } from './types';

/**
 * BESA 단체 픽업일(기획 '견적 수정 목록 1113' 견적-5). 날짜 규칙은 이 한 곳에 두고 견적 달력·활동 달력이 같이 쓴다.
 * 2026-01-11(일)부터 2주마다 일요일. 2026년 26개(1/11 … 12/27)는 'BESA Pick-up Schedule 2026'과 같고, 2027년도 같은 규칙(1/10, 1/24 …).
 * 기존 견적 사이트도 같은 방식이다. 첫날 전(2025년 이전)은 BESA 날로 보지 않는다.
 */
export const BESA_FIRST = '2026-01-11';
const DAY = 86400000;
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
};
const FIRST = parse(BESA_FIRST);

/** 이 날(YYYY-MM-DD)이 BESA 단체 픽업일인가 */
export function isBesaDay(day: string): boolean {
  const t = parse(day);
  if (Number.isNaN(t) || t < FIRST) return false;
  return Math.round((t - FIRST) / DAY) % 14 === 0;
}

/** 한 해의 BESA 픽업일 목록(활동 달력·확인용) */
export function besaDays(year: number): string[] {
  const out: string[] = [];
  for (let t = FIRST; new Date(t).getUTCFullYear() <= year; t += 14 * DAY) {
    if (new Date(t).getUTCFullYear() === year) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const DEFAULT_PICKUP = new Map(PRICE_BOOK_2026.pickups.map((p) => [p.id, p]));

/** BESA 단체 픽업 선택지인가: 가격 버전의 besa → 모듈 기본값(11/12 v1에는 besa 칸이 없음) */
export function isBesaPickup(p: PickupDef | undefined): boolean {
  if (!p) return false;
  return p.besa ?? DEFAULT_PICKUP.get(p.id)?.besa ?? false;
}

/** 픽업 화면 글자(공항 · 요일 · 단체 여부). 정해진 4가지(CL-064)는 모듈 표기, 그 밖은 가격 버전 이름 */
export function pickupText(p: PickupDef): string {
  return DEFAULT_PICKUP.get(p.id)?.label ?? p.label;
}

/** 시작일에 고를 수 있는 픽업인가(BESA 단체는 BESA 날만, 견적-5) */
export const pickupAllowed = (p: PickupDef | undefined, start: string) => !!p && (!isBesaPickup(p) || isBesaDay(start));
