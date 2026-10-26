import { recordKinds, type CategoryCreateInput, type CategoryUpdateInput, type RecordCreateInput, type RecordUpdateInput, type RecordDetails, type RecordKind } from '../../../db/data-types.ts';
import { pointDimensionFields } from '../../../lib/point-dimensions.ts';
import { containsSensitiveText } from '../../../lib/sensitive-text.ts';

export const MAX_REQUEST_BYTES = 64 * 1024;

export class DataValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DataValidationError';
    this.status = status;
  }
}

export type ParsedDataPayload =
  | { kind: 'category'; data: CategoryCreateInput | CategoryUpdateInput }
  | { kind: 'record'; data: RecordCreateInput | RecordUpdateInput };

type Operation = 'POST' | 'PUT';

const categoryKeys = new Set(['kind', 'id', 'revision', 'name', 'description', 'color', 'scope']);
const recordKeys = new Set(['kind', 'id', 'revision', 'title', 'categoryId', 'responsible', 'validation', 'contact', 'notes', 'recordType', 'recordKind', 'details']);
const credentialAssignment = /\b(?:senha|password|passwd|passphrase|token|secret|credencial|credential)\s*[:=]\s*\S+/i;
const detailLimits: Record<RecordKind, Record<string, number>> = {
  general: {},
  vlan: { vlanNumber: 40, neighborhood: 200 },
  camera: {
    camera: 240, alternateIdentifier: 240, neighborhood: 200, address: 500, reference: 500,
    geolocation: 500, olt: 200, description: 10_000, signal: 120, serialNumber: 160,
    ipAddress: 45, tunnelIp: 45, eoipId: 120, onuIdentifier: 160, vlanNumber: 4, macAddress: 17,
  },
  point: {
    location: 240, address: 500, speed: 120, date: 10, partner: 240, ip: 45,
    provider: 240, dhcpInternal: 160, onu: 160, onuIdentifier: 160, olt: 200,
    macAddress: 17, connectionPort: 120, opticalSignal: 32, activationDate: 10,
    installationTechnician: 240, municipality: 160, client: 160, operationalRegion: 160,
  },
};
const requiredDetails: Record<RecordKind, string[]> = {
  general: [],
  vlan: ['vlanNumber', 'neighborhood'],
  camera: ['camera', 'neighborhood', 'address'],
  point: ['location', 'partner', 'address'],
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DataValidationError(`${label} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) throw new DataValidationError(`Campo não reconhecido em ${label}: ${unknownKey}.`);
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new DataValidationError(`${label} deve ser texto.`);
  const normalized = value.trim();
  if (required && !normalized) throw new DataValidationError(`${label} é obrigatório.`);
  if (normalized.length > max) throw new DataValidationError(`${label} excede o limite de ${max} caracteres.`);
  if (credentialAssignment.test(normalized)) throw new DataValidationError(`${label} não pode conter credenciais.`);
  return normalized;
}

function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new DataValidationError('ID inválido.');
  }
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DataValidationError('Revision inválida. Recarregue os dados antes de editar.');
  }
  return value;
}

function recordKind(value: unknown, label: string): RecordKind {
  if (typeof value !== 'string' || !recordKinds.includes(value as RecordKind)) {
    throw new DataValidationError(`${label} inválido.`);
  }
  return value as RecordKind;
}

function parseCategory(body: Record<string, unknown>, operation: Operation): ParsedDataPayload {
  onlyKeys(body, categoryKeys, 'categoria');
  if (operation === 'PUT' && body.id === undefined) throw new DataValidationError('ID da categoria é obrigatório para edição.');
  if (operation === 'PUT' && body.revision === undefined) throw new DataValidationError('Revision da categoria é obrigatória para edição.');
  if (operation === 'POST' && body.id !== undefined) throw new DataValidationError('ID não é permitido na criação da categoria.');
  if (operation === 'POST' && body.revision !== undefined) throw new DataValidationError('Revision não é permitida na criação da categoria.');
  const data: CategoryCreateInput = {
    name: text(body.name, 'Nome da categoria', 160, true),
    description: text(body.description, 'Descrição da categoria', 10_000, true),
    color: text(body.color, 'Cor', 7, true),
    scope: body.scope === undefined ? 'general' : recordKind(body.scope, 'Escopo da categoria'),
  };
  if (!/^#[\da-f]{6}$/i.test(data.color)) throw new DataValidationError('Cor inválida. Use o formato hexadecimal #RRGGBB.');
  if (operation === 'PUT') return { kind: 'category', data: { ...data, id: id(body.id), revision: revision(body.revision) } };
  return { kind: 'category', data };
}

function parseDetails(value: unknown, kind: RecordKind): RecordDetails {
  const details = object(value, 'details');
  const limits = detailLimits[kind];
  onlyKeys(details, new Set(Object.keys(limits)), 'details');
  const result: RecordDetails = {};
  for (const [key, limit] of Object.entries(limits)) {
    const field = text(details[key], `details.${key}`, limit, requiredDetails[kind].includes(key));
    if ((key === 'date' || key === 'activationDate') && field && !validDate(field)) {
      throw new DataValidationError(`details.${key} deve ser uma data válida no formato AAAA-MM-DD.`);
    }
    if ((key === 'ipAddress' || key === 'tunnelIp') && field && !validIpv4(field)) {
      throw new DataValidationError(`details.${key} deve ser um endereço IPv4 válido.`);
    }
    if (key === 'vlanNumber' && field && (!/^\d+$/.test(field) || Number(field) < 1 || Number(field) > 4094)) {
      throw new DataValidationError(`details.${key} deve ser um número entre 1 e 4094.`);
    }
    if (key === 'macAddress' && field) result[key] = normalizeMacAddress(field);
    else if (key === 'opticalSignal' && field && !/^[+-]?\d{1,3}(?:[.,]\d{1,2})?\s*(?:dBm)?$/i.test(field)) {
      throw new DataValidationError('details.opticalSignal deve ser um valor numérico opcionalmente seguido de dBm.');
    } else result[key] = field;
  }
  if (kind === 'point') for (const key of pointDimensionFields) {
    const label = result[key] ?? '';
    let invalidControl = false;
    for (const letter of label) { const code = letter.codePointAt(0)!; if (code < 32 || code === 127) invalidControl = true; }
    if (label && (invalidControl || containsSensitiveText(label) || /[@:\\]|https?:|(?:\d{1,3}\.){3}\d{1,3}/i.test(label) || (label.match(/\d/g)?.length ?? 0) >= 9)) {
      throw new DataValidationError(`details.${key} deve conter apenas um nome de organização ou local, sem contato, endereço de rede ou credencial.`);
    }
    if (label && !/^[\p{L}\p{M}\p{N} .,'&()/-]+$/u.test(label)) {
      throw new DataValidationError(`details.${key} contém caracteres não permitidos.`);
    }
    result[key] = label.replace(/\s+/g, ' ');
  }
  return result;
}

function validIpv4(value: string): boolean {
  const octets = value.split('.');
  return octets.length === 4 && octets.every((octet) =>
    /^\d{1,3}$/.test(octet) && Number(octet) <= 255 && String(Number(octet)) === octet,
  );
}

function normalizeMacAddress(value: string): string {
  if (!/^(?:[\da-f]{12}|(?:[\da-f]{2}[:-]){5}[\da-f]{2}|(?:[\da-f]{4}\.){2}[\da-f]{4})$/i.test(value)) {
    throw new DataValidationError('details.macAddress deve conter 6 pares hexadecimais.');
  }
  return value.replace(/[.:-]/g, '').toUpperCase().match(/.{2}/g)!.join(':');
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseRecord(body: Record<string, unknown>, operation: Operation): ParsedDataPayload {
  onlyKeys(body, recordKeys, 'registro');
  if (operation === 'PUT' && body.id === undefined) throw new DataValidationError('ID do registro é obrigatório para edição.');
  if (operation === 'PUT' && body.revision === undefined) throw new DataValidationError('Revision do registro é obrigatória para edição.');
  if (operation === 'POST' && body.id !== undefined) throw new DataValidationError('ID não é permitido na criação do registro.');
  if (operation === 'POST' && body.revision !== undefined) throw new DataValidationError('Revision não é permitida na criação do registro.');
  const kind = recordKind(body.recordType, 'Tipo do registro');
  if (body.recordKind !== undefined && recordKind(body.recordKind, 'recordKind') !== kind) {
    throw new DataValidationError('recordKind deve corresponder a recordType.');
  }
  const details = parseDetails(body.details, kind);
  const title = text(body.title, 'Título', 240, true);
  const expectedTitle = kind === 'vlan' ? `VLAN ${details.vlanNumber} — ${details.neighborhood}`
    : kind === 'camera' ? details.camera
    : kind === 'point' ? details.location
    : title;
  if (title !== expectedTitle) throw new DataValidationError('O título deve corresponder aos dados do registro.');
  const responsible = text(body.responsible, 'Responsável', 240, kind === 'general');
  const description = kind === 'camera' ? details.description : '';
  const data: RecordCreateInput = {
    title,
    categoryId: id(body.categoryId),
    responsible,
    validation: text(body.validation, 'Validação/designação', 1_000) || '—',
    contact: text(body.contact, 'Contato', 500),
    notes: text(body.notes, 'Observações', 10_000) || description || '',
    recordType: kind,
    details,
  };
  if (operation === 'PUT') return { kind: 'record', data: { ...data, id: id(body.id), revision: revision(body.revision) } };
  return { kind: 'record', data };
}

export function validatePayload(value: unknown, operation: Operation): ParsedDataPayload {
  const body = object(value, 'Payload');
  if (body.kind === 'category') return parseCategory(body, operation);
  if (body.kind === 'record') return parseRecord(body, operation);
  throw new DataValidationError('Tipo de operação inválido.');
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_REQUEST_BYTES) {
    throw new DataValidationError('Corpo da requisição muito grande.', 413);
  }
  if (!request.body) throw new DataValidationError('Corpo JSON obrigatório.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new DataValidationError('Corpo da requisição muito grande.', 413);
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DataValidationError('Corpo JSON inválido.');
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new DataValidationError('JSON inválido.');
  }
}
