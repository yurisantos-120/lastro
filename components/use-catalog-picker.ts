'use client';

import { useEffect, useState } from 'react';

export type CatalogRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type CatalogOption = { id: number };
type ListResource = 'categories' | 'routes';
type ItemResource = 'category' | 'record';

export function useCatalogPicker<T extends CatalogOption>({
  request, resource, itemResource, value, scope, requiredKind, loadError,
}: {
  request: CatalogRequest;
  resource: ListResource;
  itemResource: ItemResource;
  value: number | null;
  scope?: string;
  requiredKind?: string;
  loadError: string;
}) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: T[]; pages: number; total: number }>({ items: [], pages: 0, total: 0 });
  const [selected, setSelected] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const params = new URLSearchParams({ resource, page: String(page), pageSize: '30', q: term });
        if (scope) params.set('scope', scope);
        const response = await request(`/api/data?${params}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(loadError);
        const body = await response.json() as Record<string, unknown> | null;
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(loadError);
        const items = body[resource];
        if (!Array.isArray(items) || typeof body.pages !== 'number' || typeof body.total !== 'number') throw new Error(loadError);
        if (!controller.signal.aborted) setData({ items: items as T[], pages: body.pages, total: body.total });
      } catch { if (!controller.signal.aborted) setError(loadError); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [request, resource, scope, page, term, refresh, loadError]);

  useEffect(() => {
    if (!value || data.items.some((item) => item.id === value)) return;
    const controller = new AbortController();
    void request(`/api/data?resource=${itemResource}&id=${value}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as Record<string, unknown> : null)
      .then((body) => {
        const item = body?.[itemResource] as (T & { kind?: string }) | null | undefined;
        if (!controller.signal.aborted && item && (!requiredKind || item.kind === requiredKind)) setSelected(item);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [request, value, data.items, itemResource, requiredKind]);

  const options = selected && selected.id === value && !data.items.some((item) => item.id === selected.id)
    ? [selected, ...data.items] : data.items;

  return { search, setSearch, page, setPage, options, pages: data.pages, total: data.total, loading, error, retry: () => setRefresh((current) => current + 1) };
}
