export const operationalStates = ['in_progress', 'pending', 'normalized', 'closed'] as const;
export type OperationalState = (typeof operationalStates)[number];
export const operationalStateLabels: Record<OperationalState, string> = {
  in_progress: 'Em tratamento', pending: 'Pendente', normalized: 'Normalizado', closed: 'Fechado',
};

export interface OperationalFields {
  occurrenceType: string;
  routeDescription: string;
  routeId: number | null;
  responsibleOrganization: string;
  state: OperationalState;
  pendingReason: string;
  notes: string;
  guidance: string;
}

export interface OperationalUpdate extends OperationalFields {
  operationKey: string;
  expectedRevision: number;
  description: string;
}

export interface TicketOperation extends OperationalFields {
  ticketId: number;
  revision: number;
  openedAt: string;
  updatedAt: string;
  normalizedAt: string | null;
  closedAt: string | null;
  updatedBy: number;
}

export interface TicketOperationEvent {
  id: number;
  ticketId: number;
  actorId: number;
  actorName: string;
  occurredAt: string;
  type: 'initialized' | 'state_changed' | 'updated';
  previousState: OperationalState | null;
  nextState: OperationalState;
  description: string;
  snapshot: TicketOperation;
}

export interface OperationalDetail {
  operation: TicketOperation | null;
  events: TicketOperationEvent[];
}

export class TicketOperationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'TicketOperationError';
    this.code = code;
    this.status = status;
  }
}

export function parseOperationalUpdate(input: unknown): OperationalUpdate {
  const invalid = (message: string): never => { throw new TicketOperationError('INVALID_OPERATION', message); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Movimentação inválida.');
  const body = input as Record<string, unknown>;
  const allowed = new Set(['operationKey', 'expectedRevision', 'occurrenceType', 'routeDescription', 'routeId', 'responsibleOrganization', 'state', 'pendingReason', 'notes', 'guidance', 'description']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return invalid('Campo não reconhecido.');
  if (typeof body.operationKey !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.operationKey)) return invalid('Identificador da movimentação inválido.');
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) return invalid('Revisão inválida.');
  if (!operationalStates.includes(body.state as OperationalState)) return invalid('Situação operacional inválida.');
  const text = (key: string, max: number): string => {
    if (body[key] === undefined) return '';
    if (typeof body[key] !== 'string' || body[key].length > max || body[key].includes('\0')) return invalid(`Valor inválido em ${key}.`);
    return body[key].trim();
  };
  const routeId = body.routeId === undefined || body.routeId === null ? null : body.routeId;
  if (routeId !== null && (!Number.isSafeInteger(routeId) || (routeId as number) <= 0)) return invalid('Vínculo de rota inválido.');
  const state = body.state as OperationalState;
  const pendingReason = text('pendingReason', 2000);
  if (state === 'pending' && !pendingReason) return invalid('Informe a justificativa da pendência.');
  return {
    operationKey: body.operationKey.toLowerCase(), expectedRevision: body.expectedRevision as number,
    occurrenceType: text('occurrenceType', 160), routeDescription: text('routeDescription', 500),
    routeId: routeId as number | null, responsibleOrganization: text('responsibleOrganization', 240),
    state, pendingReason: state === 'pending' ? pendingReason : '', notes: text('notes', 10000),
    guidance: text('guidance', 10000), description: text('description', 4000),
  };
}
