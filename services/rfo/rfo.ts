import { containsSensitiveText } from '../../lib/sensitive-text.ts';

export interface RfoFields {
  investigation: 'investigating' | 'confirmed';
  completion: 'pending' | 'completed';
  cause: string;
  technicalDescription: string;
  solution: string;
  responsibleTeam: string;
  notes: string;
}
export interface RfoUpdate extends RfoFields {
  operationKey: string;
  expectedRevision: number;
}
export interface RfoRecord extends RfoFields {
  ticketId: number;
  glpiTicketId: number;
  normalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  updatedBy: number;
  revision: number;
}
export interface RfoRevision {
  id: number;
  actorId: number;
  actorName: string;
  recordedAt: string;
  revision: number;
  snapshot: RfoRecord;
}
export interface RfoDetail {
  rfo: RfoRecord | null;
  normalizationAvailable: string | null;
  revisions: RfoRevision[];
  page: number;
  total: number;
}
export class RfoError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'RfoError';
    this.code = code;
    this.status = status;
  }
}
export function editableRfo(value: RfoFields): RfoFields {
  return {
    investigation: value.investigation,
    completion: value.completion,
    cause: value.cause,
    technicalDescription: value.technicalDescription,
    solution: value.solution,
    responsibleTeam: value.responsibleTeam,
    notes: value.notes,
  };
}
export function parseRfo(raw: unknown): RfoUpdate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new RfoError('INVALID_RFO', 'RFO inválida.');
  const input = raw as Record<string, unknown>;
  const allowed = new Set([
    'operationKey',
    'expectedRevision',
    'investigation',
    'completion',
    'cause',
    'technicalDescription',
    'solution',
    'responsibleTeam',
    'notes',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new RfoError('INVALID_RFO', 'Campo não permitido na RFO.');
  if (
    typeof input.operationKey !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.operationKey,
    ) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0
  )
    throw new RfoError('INVALID_RFO', 'Chave ou revisão inválida.');
  if (
    !['investigating', 'confirmed'].includes(input.investigation as string) ||
    !['pending', 'completed'].includes(input.completion as string)
  )
    throw new RfoError('INVALID_RFO', 'Situação de RFO inválida.');
  const text = (key: string, max: number) => {
    const value = input[key] ?? '';
    if (
      typeof value !== 'string' ||
      value.length > max ||
      value.includes('\0') ||
      containsSensitiveText(value)
    )
      throw new RfoError(
        'INVALID_RFO_TEXT',
        'Campo inválido ou com possível credencial. Remova informações sensíveis antes de salvar.',
      );
    return value.trim();
  };
  const result: RfoUpdate = {
    operationKey: input.operationKey.toLowerCase(),
    expectedRevision: input.expectedRevision as number,
    investigation: input.investigation as RfoFields['investigation'],
    completion: input.completion as RfoFields['completion'],
    cause: text('cause', 4000),
    technicalDescription: text('technicalDescription', 10000),
    solution: text('solution', 10000),
    responsibleTeam: text('responsibleTeam', 240),
    notes: text('notes', 10000),
  };
  if (result.investigation === 'confirmed' && !result.cause)
    throw new RfoError('CAUSE_REQUIRED', 'Informe a causa confirmada.');
  if (
    result.completion === 'completed' &&
    (result.investigation !== 'confirmed' ||
      !result.cause ||
      !result.technicalDescription ||
      !result.solution)
  )
    throw new RfoError(
      'RFO_INCOMPLETE',
      'Para concluir, confirme a causa e informe descrição técnica e solução aplicada.',
    );
  return result;
}
