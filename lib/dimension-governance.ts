import { containsSensitiveText } from './sensitive-text.ts';

export const dimensionKinds = ['municipality', 'client', 'operational_region'] as const;
export type DimensionKind = typeof dimensionKinds[number];

export class DimensionValidationError extends Error { readonly status:number; constructor(message: string, status = 400) { super(message); this.status=status; } }

function clean(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== 'string') { if (!required && value === undefined) return ''; throw new DimensionValidationError(`${label} deve ser texto.`); }
  const result = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (required && !result) throw new DimensionValidationError(`${label} é obrigatório.`);
  if (result.length > max) throw new DimensionValidationError(`${label} excede ${max} caracteres.`);
  if (result && (containsSensitiveText(result) || /[@:\\]|https?:|(?:\d{1,3}\.){3}\d{1,3}/i.test(result))) throw new DimensionValidationError(`${label} não pode conter contato, rede ou segredo.`);
  if (result && !/^[\p{L}\p{M}\p{N} .,'&()/-]+$/u.test(result)) throw new DimensionValidationError(`${label} contém caracteres não permitidos.`);
  return result;
}
export function dimensionKind(value: unknown): DimensionKind { if (typeof value !== 'string' || !dimensionKinds.includes(value as DimensionKind)) throw new DimensionValidationError('Dimensão inválida.'); return value as DimensionKind; }
export function normalizedDimensionKey(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' '); }
export interface DimensionRequestInput { kind: DimensionKind; proposedName: string; stateCode: string | null; justification: string; }
export function parseDimensionRequest(raw: unknown): DimensionRequestInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DimensionValidationError('Payload deve ser um objeto.');
  const body=raw as Record<string,unknown>, allowed=new Set(['kind','proposedName','stateCode','justification']);
  const unexpected=Object.keys(body).find(key=>!allowed.has(key)); if(unexpected) throw new DimensionValidationError(`Campo não reconhecido: ${unexpected}.`);
  const kind=dimensionKind(body.kind), proposedName=clean(body.proposedName,'Nome proposto',160), justification=clean(body.justification,'Justificativa',1000);
  const stateRaw=body.stateCode;
  if (kind==='municipality') { if(typeof stateRaw!=='string'||!/^[A-Z]{2}$/.test(stateRaw.trim())) throw new DimensionValidationError('Município exige UF oficial em maiúsculas.'); return {kind,proposedName,stateCode:stateRaw.trim(),justification}; }
  if(stateRaw!==undefined && stateRaw!==null) throw new DimensionValidationError('UF é permitida somente para município.');
  return {kind,proposedName,stateCode:null,justification};
}
export interface DecisionInput { expectedRevision:number; justification:string; }
export function parseDecision(raw: unknown): DecisionInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new DimensionValidationError('Payload deve ser um objeto.');
  const body=raw as Record<string,unknown>,allowed=new Set(['expectedRevision','justification']); const unexpected=Object.keys(body).find(k=>!allowed.has(k));if(unexpected)throw new DimensionValidationError(`Campo não reconhecido: ${unexpected}.`);
  if(typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)throw new DimensionValidationError('Revisão esperada inválida.');
  return {expectedRevision:body.expectedRevision,justification:clean(body.justification,'Justificativa da decisão',1000)};
}
