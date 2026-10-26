export const pointDimensionFields = ['municipality', 'client', 'operationalRegion'] as const;
export type PointDimensionField = (typeof pointDimensionFields)[number];

export function pointDimensionKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}
