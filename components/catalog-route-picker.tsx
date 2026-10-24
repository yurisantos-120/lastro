'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useCatalogPicker, type CatalogRequest } from './use-catalog-picker';

export type RouteOption = { id: number; title: string };

export function CatalogRoutePicker({ request, value, onChange }: {
  request: CatalogRequest;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { search, setSearch, page, setPage, options: routes, pages, total, loading, error, retry } = useCatalogPicker<RouteOption>({
    request, resource: 'routes', itemResource: 'record', value, requiredKind: 'general',
    loadError: 'Não foi possível consultar as rotas.',
  });
  return <div className="space-y-2">
    <Input aria-label="Buscar rota cadastrada" placeholder="Buscar rota…" maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} />
    <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2" value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
      <option value="">Sem vínculo — manter descrição livre</option>
      {value && !routes.some((route) => route.id === value) && <option value={value}>Rota vinculada #{value}</option>}
      {routes.map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}
    </select>
    {pages > 1 && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
      <span>Página {page} de {Math.max(1, pages)} · {total} rotas</span>
      <Button type="button" variant="outline" size="sm" disabled={loading || page >= pages} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
    </div>}
    {loading && <output className="text-xs text-slate-500">Carregando rotas…</output>}
    {error && <Alert variant="error" className="text-xs">{error} <Button type="button" variant="outline" size="sm" onClick={retry}>Tentar novamente</Button></Alert>}
    {!loading && !error && total === 0 && <p className="text-xs text-slate-500">Nenhuma rota encontrada. Ajuste a busca ou mantenha a descrição livre.</p>}
  </div>;
}
