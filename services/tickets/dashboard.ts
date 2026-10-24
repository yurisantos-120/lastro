import type { OperationalState } from './operations.ts';

export const defaultNocTimeZone = 'America/Sao_Paulo';
export type DashboardState =
  | OperationalState
  | 'unstarted'
  | 'unconfirmed'
  | 'active';
export type DateBucket = 'today' | 'yesterday' | 'earlier';
export interface DashboardFilters {
  page: number;
  pageSize: number;
  state: DashboardState | '';
  from: string;
  to: string;
  occurrence: string;
  route: string;
  organization: string;
  glpiId: string;
}
export interface DashboardCounts {
  total: number;
  confirmed: number;
  active: number;
  in_progress: number;
  pending: number;
  normalized: number;
  closed: number;
  unstarted: number;
  unconfirmed: number;
}
export interface DashboardTicket {
  rfoStatus?: 'pending' | 'completed' | null;
  id: number;
  title: string;
  glpiTicketId: number | null;
  resultState: string;
  glpiStatus: number | null;
  state: OperationalState | null;
  openedAt: string;
  lastSyncedAt: string | null;
  updatedAt: string | null;
  occurrenceType: string;
  routeDescription: string;
  routeTitle: string | null;
  responsibleOrganization: string;
  pendingReason: string;
  lastObservation: string;
  guidance: string;
}
export interface DashboardData {
  rfoAvailable?: boolean;
  items: DashboardTicket[];
  counts: DashboardCounts;
  page: number;
  pageSize: number;
  totalPages: number;
  timeZone: string;
  generatedAt: string;
  lastSyncedAt: string | null;
}
export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DashboardError';
  }
}
export function validateNocTimeZone(value = defaultNocTimeZone): string {
  new Intl.DateTimeFormat('en', { timeZone: value }).format();
  return value;
}
export function nocDay(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dateBucket(
  value: string,
  now: string,
  timeZone: string,
): DateBucket {
  const today = nocDay(now, timeZone);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const day = nocDay(value, timeZone);
  return day === today ? 'today' : day === yesterday ? 'yesterday' : 'earlier';
}
// Locate the first instant of a civil day; this handles midnight DST gaps and variable offsets.
export function startOfNocDay(day: string, timeZone: string): string {
  const center = Date.parse(`${day}T00:00:00Z`);
  let low = center - 36 * 3600000,
    high = center + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (nocDay(new Date(middle), timeZone) < day) low = middle + 1;
    else high = middle;
  }
  return new Date(low).toISOString();
}
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
}
export function parseDashboardFilters(
  params: URLSearchParams,
): DashboardFilters {
  const allowed = new Set([
    'page',
    'pageSize',
    'state',
    'from',
    'to',
    'occurrence',
    'route',
    'organization',
    'glpiId',
  ]);
  for (const key of params.keys())
    if (!allowed.has(key) || params.getAll(key).length > 1)
      throw new DashboardError('Filtro não reconhecido ou repetido.');
  const text = (key: string, max = 240) => {
    const value = (params.get(key) ?? '').trim();
    if (value.length > max)
      throw new DashboardError('Filtro excede o limite permitido.');
    return value;
  };
  const integer = (key: string, fallback: number, max: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    )
      throw new DashboardError('Paginação inválida.');
    return Number(value);
  };
  const state = text('state');
  if (
    ![
      '',
      'in_progress',
      'pending',
      'normalized',
      'closed',
      'unstarted',
      'unconfirmed',
      'active',
    ].includes(state)
  )
    throw new DashboardError('Situação inválida.');
  const civilDate = (key: string) => {
    const value = text(key, 10);
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    )
      throw new DashboardError('Data inválida.');
    return value;
  };
  const from = civilDate('from'),
    to = civilDate('to'),
    glpiId = text('glpiId', 20);
  if (from && to && from > to)
    throw new DashboardError('A data inicial deve anteceder a final.');
  if (
    glpiId &&
    (!/^[1-9]\d*$/.test(glpiId) || !Number.isSafeInteger(Number(glpiId)))
  )
    throw new DashboardError('Número GLPI inválido.');
  return {
    page: integer('page', 1, 1000000),
    pageSize: integer('pageSize', 20, 50),
    state: state as DashboardFilters['state'],
    from,
    to,
    glpiId,
    occurrence: text('occurrence', 160),
    route: text('route', 500),
    organization: text('organization'),
  };
}
