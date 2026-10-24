'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useCatalogPicker, type CatalogRequest } from './use-catalog-picker';

type CategoryOption = { id: number; name: string; scope: string };

export function CatalogCategoryPicker({ request, scope, value, onChange, name, required = false }: {
  request: CatalogRequest;
  scope?: string;
  value: number | null;
  onChange: (id: number | null) => void;
  name?: string;
  required?: boolean;
}) {
  const { search, setSearch, page, setPage, options, pages, total, loading, error, retry } = useCatalogPicker<CategoryOption>({
    request, resource: 'categories', itemResource: 'category', value, scope,
    loadError: 'Não foi possível carregar as categorias.',
  });
  return <div className="space-y-2">
    <Input aria-label="Buscar categoria" placeholder="Buscar categoria…" maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} />
    <select name={name} aria-label="Categoria" required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
      <option value="">{required ? 'Selecione uma categoria' : 'Todas as categorias'}</option>
      {value && !options.some((category) => category.id === value) && <option value={value}>Categoria #{value}</option>}
      {options.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select>
    {pages > 1 && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
      <span>Página {page} de {Math.max(1, pages)} · {total} categorias</span>
      <Button type="button" variant="outline" size="sm" disabled={loading || page >= pages} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
    </div>}
    {loading && <output className="text-xs text-slate-500">Carregando categorias…</output>}
    {error && <Alert variant="error" className="text-xs">{error} <Button type="button" variant="outline" size="sm" onClick={retry}>Tentar novamente</Button></Alert>}
    {!loading && !error && total === 0 && <p className="text-xs text-amber-700">Nenhuma categoria encontrada. Ajuste a busca ou cadastre uma categoria.</p>}
  </div>;
}
