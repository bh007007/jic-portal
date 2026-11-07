import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 검색 조건 상자 ↔ 주소창 쿼리 동기화. 조회를 누르면 쿼리에 반영되고(뒤로 가기·새로고침 유지),
 * 입력 중인 값은 form 에만 있다.
 */
export function useSearchForm<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = {}) {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const read = (p: URLSearchParams) => Object.fromEntries(keys.map((k) => [k, p.get(k) ?? defaults[k] ?? ''])) as Record<K, string>;
  const [form, setForm] = useState(() => read(params));

  useEffect(() => setForm(read(new URLSearchParams(query))), [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  return {
    params,
    query,
    form,
    set: (k: K) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })),
    apply,
    submit: (e: FormEvent) => {
      e.preventDefault();
      apply({ ...form, page: '' });
    },
    reset: () => setParams({}),
  };
}
