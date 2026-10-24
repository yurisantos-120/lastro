import { containsSensitiveText } from '../../lib/sensitive-text.ts';
import {
  defaultNocTimeZone,
  nextDay,
  nocDay,
  validateNocTimeZone,
} from '../tickets/dashboard.ts';
import type { DashboardTicket } from '../tickets/dashboard.ts';

export type Shift = 'day' | 'night';
export interface ShiftConfig {
  timeZone: string;
  dayStart: string;
  nightStart: string;
  rotation: '12x36';
}
export interface ShiftPeriod {
  date: string;
  shift: Shift;
  startAt: string;
  endAt: string;
  key: string;
}
export interface HandoffPreview {
  config: ShiftConfig;
  period: ShiftPeriod;
  items: DashboardTicket[];
  token: string;
  generatedAt: string;
}
export interface DeliverInput {
  operationKey: string;
  date: string;
  shift: Shift;
  previewToken: string;
  notes: string;
  guidance: string;
}
export interface HandoffSummary {
  id: string;
  period: ShiftPeriod;
  deliveredName: string;
  deliveredAt: string;
  receivedName: string | null;
  receivedAt: string | null;
}
export interface HandoffList {
  page: number;
  total: number;
  items: HandoffSummary[];
  available: HandoffSummary | null;
  config: ShiftConfig;
}
export interface HandoffRecord {
  id: string;
  config: ShiftConfig;
  period: ShiftPeriod;
  items: DashboardTicket[];
  notes: string;
  guidance: string;
  deliveredBy: number;
  deliveredName: string;
  deliveredAt: string;
  receipt: {
    receivedBy: number;
    receivedName: string;
    receivedAt: string;
  } | null;
}
export class HandoffError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'HandoffError';
    this.code = code;
    this.status = status;
  }
}
export function shiftConfig(
  env: {
    NOC_TIME_ZONE?: string;
    NOC_DAY_SHIFT_START?: string;
    NOC_NIGHT_SHIFT_START?: string;
  } = {},
): ShiftConfig {
  const timeZone = validateNocTimeZone(env.NOC_TIME_ZONE ?? defaultNocTimeZone);
  const dayStart = env.NOC_DAY_SHIFT_START ?? '07:00',
    nightStart = env.NOC_NIGHT_SHIFT_START ?? '19:00';
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (
    ![dayStart, nightStart].every((time) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
    ) ||
    (minutes(nightStart) - minutes(dayStart) + 1440) % 1440 !== 720
  )
    throw new HandoffError(
      'SHIFT_CONFIGURATION',
      'Configure dois turnos complementares de 12 horas.',
      503,
    );
  return { timeZone, dayStart, nightStart, rotation: '12x36' };
}
function civilInstant(date: string, time: string, zone: string) {
  // Solve wall time in the configured zone without assuming a fixed UTC offset.
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  const wall = (value: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const p = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:00Z`;
  };
  for (let i = 0; i < 4; i++) instant += target - Date.parse(wall(instant));
  if (wall(instant) !== `${date}T${time}:00Z`)
    throw new HandoffError(
      'SHIFT_TIME_INVALID',
      'Horário inexistente neste dia/fuso. Revise a configuração.',
    );
  return new Date(instant).toISOString();
}
export function shiftPeriod(
  config: ShiftConfig,
  date: string,
  shift: Shift,
): ShiftPeriod {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
    !['day', 'night'].includes(shift)
  )
    throw new HandoffError('INVALID_PERIOD', 'Turno ou data inválidos.');
  const start = shift === 'day' ? config.dayStart : config.nightStart;
  const end = shift === 'day' ? config.nightStart : config.dayStart;
  return {
    date,
    shift,
    startAt: civilInstant(date, start, config.timeZone),
    endAt: civilInstant(
      end <= start ? nextDay(date) : date,
      end,
      config.timeZone,
    ),
    key: `${config.timeZone}/${date}/${shift}`,
  };
}
export function suggestedPeriod(config: ShiftConfig, now: Date): ShiftPeriod {
  const today = nocDay(now, config.timeZone);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const candidates = [today, yesterday].flatMap((date) =>
    (['day', 'night'] as const).map((shift) =>
      shiftPeriod(config, date, shift),
    ),
  );
  return candidates
    .filter((period) => period.endAt <= now.toISOString())
    .sort((a, b) => b.endAt.localeCompare(a.endAt))[0];
}
export function redactText(value: string): string {
  return containsSensitiveText(value) ? '[Conteúdo sensível omitido]' : value;
}
export function safeSummary(items: DashboardTicket[]): DashboardTicket[] {
  return items.map(
    (item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          typeof value === 'string' ? redactText(value) : value,
        ]),
      ) as unknown as DashboardTicket,
  );
}
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
export function operationKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      value,
    )
  )
    throw new HandoffError(
      'INVALID_KEY',
      'Identificador da operação inválido.',
    );
  return value.toLowerCase();
}
export function parseDelivery(raw: unknown): DeliverInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new HandoffError('INVALID_DELIVERY', 'Entrega inválida.');
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          'operationKey',
          'date',
          'shift',
          'previewToken',
          'notes',
          'guidance',
        ].includes(key),
    ) ||
    typeof body.date !== 'string' ||
    !['day', 'night'].includes(body.shift as string) ||
    typeof body.previewToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.previewToken)
  )
    throw new HandoffError('INVALID_DELIVERY', 'Campos de entrega inválidos.');
  const text = (key: string) => {
    const value = body[key] ?? '';
    if (
      typeof value !== 'string' ||
      value.length > 10000 ||
      containsSensitiveText(value) ||
      value.includes('\0')
    )
      throw new HandoffError(
        'SENSITIVE_OR_INVALID_TEXT',
        'Observações e orientações não podem conter credenciais ou texto inválido.',
      );
    return value.trim();
  };
  return {
    operationKey: operationKey(body.operationKey),
    date: body.date,
    shift: body.shift as Shift,
    previewToken: body.previewToken,
    notes: text('notes'),
    guidance: text('guidance'),
  };
}
