import { isObject } from './glpi-errors.ts';
import { containsSensitiveText } from '../../lib/sensitive-text.ts';
export type IntegrationAction =
  | 'sync'
  | 'update'
  | 'solution'
  | 'close'
  | 'associate';
export type IntegrationState = 'pending' | 'uncertain' | 'confirmed' | 'failed';
export type IntegrationRequest = {
  operationKey: string;
  action: IntegrationAction;
  expectedRevision: number;
  title?: string;
  content?: string;
  candidateId?: number;
  attestation?: string;
};
export interface IntegrationOperation {
  id: string;
  ticketId: number;
  action: IntegrationAction;
  requestJson: string;
  actorId: number;
  updatedBy: number;
  state: IntegrationState;
  code: string;
  remoteId: number;
  solutionId: number | null;
  observationJson: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export class IntegrationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const validOperationKey = (key: unknown): key is string =>
  typeof key === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    key,
  );
export function validateIntegration(input: unknown): IntegrationRequest {
  const fail = () =>
    new IntegrationError('INVALID_INTEGRATION', 'Dados da operação inválidos.');
  if (
    !isObject(input) ||
    !validOperationKey(input.operationKey) ||
    !['sync', 'update', 'solution', 'close', 'associate'].includes(
      String(input.action),
    ) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 1
  )
    throw fail();
  const action = input.action as IntegrationAction;
  const allowed = [
    'operationKey',
    'action',
    'expectedRevision',
    ...(action === 'update'
      ? ['title', 'content']
      : action === 'solution'
        ? ['content']
        : action === 'associate'
          ? ['candidateId', 'attestation']
          : []),
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw fail();
  const result: IntegrationRequest = {
    operationKey: input.operationKey,
    action,
    expectedRevision: Number(input.expectedRevision),
  };
  for (const field of action === 'update'
    ? (['title', 'content'] as const)
    : action === 'solution'
      ? (['content'] as const)
      : action === 'associate'
        ? (['attestation'] as const)
        : []) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (
      !value ||
      value.length >
        (field === 'title' ? 255 : field === 'attestation' ? 2000 : 10000) ||
      containsSensitiveText(value)
    )
      throw fail();
    result[field] = value;
  }
  if (action === 'associate') {
    if (
      !Number.isSafeInteger(input.candidateId) ||
      Number(input.candidateId) < 1
    )
      throw fail();
    result.candidateId = Number(input.candidateId);
  }
  return result;
}
