import { validatePayload } from '../app/api/data/validation.ts';
import { canonicalJson, operationKey, type DataMethod, type DataReceipt } from '../services/data/operations.ts';

export interface DataIntent {
  key: string; actorId: number; method: DataMethod; payload: Record<string, unknown>;
  fields: Array<[string,string]>; label: string; createdAt: string;
}
export interface IntentStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void; readonly length:number; key(index:number):string|null }
const prefix = (actorId:number) => `lastro:data-intent:v1:${actorId}:`;
export function confirmedDataReceipt(body:unknown,intent:DataIntent):DataReceipt {
  const r=(body as {operation?:DataReceipt}|null)?.operation;
  if(!r||r.key!==intent.key||r.method!==intent.method||r.kind!==intent.payload.kind||!Number.isSafeInteger(r.entityId)||r.entityId<=0||!Number.isSafeInteger(r.revision)||r.revision<=0||!r.snapshot||r.snapshot.id!==r.entityId||r.snapshot.revision!==r.revision||typeof r.recordedAt!=='string'||Number.isNaN(Date.parse(r.recordedAt)))throw Error('Resposta sem recibo válido.');
  if(r.kind==='category'?(typeof r.snapshot.name!=='string'||typeof r.snapshot.scope!=='string'):(typeof r.snapshot.title!=='string'||typeof r.snapshot.kind!=='string'||!r.snapshot.details))throw Error('Resposta sem cadastro confirmado.');
  return r;
}
export function normalizedDataPayload(method:DataMethod,payload:unknown):Record<string,unknown> {
  const parsed = validatePayload(payload,method);
  return {kind:parsed.kind,...parsed.data};
}
export function saveDataIntent(storage:IntentStorage, intent:DataIntent):void {
  operationKey(intent.key);
  if (!Number.isSafeInteger(intent.actorId) || intent.actorId <= 0) throw Error('Operador inválido.');
  const payload=normalizedDataPayload(intent.method,intent.payload);
  const key=prefix(intent.actorId)+intent.key;
  const previous=storage.getItem(key);
  if(previous){
    const saved=JSON.parse(previous) as DataIntent;
    if(saved.method!==intent.method||canonicalJson(saved.payload)!==canonicalJson(payload)) throw Error('Uma intenção pendente não pode receber outros dados. Retome a operação original.');
    return;
  }
  const serialized=JSON.stringify({...intent,payload});
  if(new TextEncoder().encode(serialized).length>192*1024)throw Error('Rascunho excede o limite local. Nenhuma requisição foi enviada.');
  storage.setItem(key,serialized);
  if(storage.getItem(key)!==serialized)throw Error('Não foi possível preservar a intenção. Nenhuma requisição foi enviada.');
}
export function removeDataIntent(storage:IntentStorage, actorId:number,key:string) { storage.removeItem(prefix(actorId)+operationKey(key)); }
export function readDataIntents(storage:IntentStorage, actorId:number):DataIntent[] {
  const entries:DataIntent[]=[];
  for(let i=0;i<storage.length;i++){
    const name=storage.key(i);if(!name?.startsWith(prefix(actorId)))continue;
    try{
      const entry=JSON.parse(storage.getItem(name)!) as DataIntent;
      if(typeof entry.label!=='string'||entry.label.length>240||typeof entry.createdAt!=='string'||Number.isNaN(Date.parse(entry.createdAt)))continue;
      if(entry.actorId!==actorId||!['POST','PUT'].includes(entry.method)||!Array.isArray(entry.fields)||entry.fields.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(v=>typeof v!=='string')))continue;
      operationKey(entry.key);normalizedDataPayload(entry.method,entry.payload);
      if(name!==prefix(actorId)+entry.key)continue;
      entries.push(entry);
    }catch{/* Corrupt entries never trigger writes or create a replacement intention. */}
  }
  return entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
