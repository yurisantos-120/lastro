import type { ParsedDataPayload } from '../../app/api/data/validation.ts';

export type DataMethod = 'POST' | 'PUT';
export interface DataReceipt {
  key: string;
  kind: 'category' | 'record';
  method: DataMethod;
  entityId: number;
  revision: number;
  recordedAt: string;
  snapshot: Record<string, unknown>;
}
export class DataOperationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message); this.name = 'DataOperationError'; this.code = code; this.status = status;
  }
}
export function operationKey(value: string | null): string {
  if (!value || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) {
    throw new DataOperationError('INVALID_OPERATION_KEY', 'Informe uma chave UUID válida para esta intenção.', 400);
  }
  return value.toLowerCase();
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function dataFingerprint(method: DataMethod, payload: ParsedDataPayload): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson({ version: 1, method, payload })));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}
