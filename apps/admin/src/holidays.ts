import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Holiday {
  day: string;
  campus: string; // '' = 모든 캠퍼스
  name: string;
  kind: 'public' | 'school';
}

/**
 * 기간 안의 휴일(기초관리 > 휴일, Supabase holidays). 로컬 데이터 실행이나 표가 아직 없을 때는 빈 목록.
 * campus 를 주면 모든 캠퍼스 휴일과 그 캠퍼스 휴일만.
 */
export function useHolidays(from: string, to: string, campus = ''): Map<string, Holiday[]> {
  const [rows, setRows] = useState<Holiday[]>([]);
  useEffect(() => {
    if (!supabase || !from || !to) return;
    let alive = true;
    supabase
      .from('holidays')
      .select('day, campus, name, kind')
      .gte('day', from)
      .lte('day', to)
      .order('day')
      .then(({ data, error }) => alive && setRows(error ? [] : ((data ?? []) as Holiday[])));
    return () => {
      alive = false;
    };
  }, [from, to]);
  const map = new Map<string, Holiday[]>();
  for (const h of rows) {
    if (campus && h.campus && h.campus !== campus) continue;
    map.set(h.day, [...(map.get(h.day) ?? []), h]);
  }
  return map;
}
