'use client';

import { Building2, MapPin, Waypoints, X, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { pointDimensionFields, type PointDimensionField } from '../lib/point-dimensions';

export type PointFilterValues = Record<PointDimensionField, string>;

const labels: Record<PointDimensionField, { title: string; Icon: LucideIcon }> = {
  municipality: { title: 'Município', Icon: MapPin },
  client: { title: 'Cliente', Icon: Building2 },
  operationalRegion: { title: 'Região operacional', Icon: Waypoints },
};

export const emptyPointFilters = (): PointFilterValues => ({ municipality: '', client: '', operationalRegion: '' });

export function PointDimensionFilters({ values, onChange }: {
  values: PointFilterValues;
  onChange: (field: PointDimensionField, value: string) => void;
}) {
  return <fieldset className="mb-4 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
    <legend className="px-1 text-sm font-semibold">Organizar pontos</legend>
    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Os filtros usam o início do nome e podem ser combinados.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {pointDimensionFields.map((field) => {
        const { title, Icon } = labels[field];
        return <div key={field} className="min-w-0">
          <label htmlFor={`point-filter-${field}`} className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4" aria-hidden="true" />{title}</label>
          <div className="flex min-w-0 gap-1.5">
            <Input id={`point-filter-${field}`} type="search" maxLength={160} value={values[field]} onChange={(event) => onChange(field, event.target.value)} placeholder={`Filtrar ${title.toLowerCase()}`} />
            <Button type="button" variant="outline" size="icon" aria-label={`Limpar filtro de ${title.toLowerCase()}`} disabled={!values[field]} onClick={() => onChange(field, '')}><X className="size-4" aria-hidden="true" /></Button>
          </div>
        </div>;
      })}
    </div>
  </fieldset>;
}
