import type { ParsedDataPayload } from '../app/api/data/validation.ts';
import { DataOperationError, dataFingerprint, operationKey, type DataMethod, type DataReceipt } from '../services/data/operations.ts';
import { dataWrite, explainDataWrite } from './data-write.ts';

export class DataOperations {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  private receipt(source: string, key: string): DataReceipt {
    try {
      const r=JSON.parse(source) as DataReceipt;
      if(r.key!==key||!['category','record'].includes(r.kind)||!['POST','PUT'].includes(r.method)||!Number.isSafeInteger(r.entityId)||r.entityId<=0||!Number.isSafeInteger(r.revision)||r.revision<=0||r.snapshot?.id!==r.entityId||r.snapshot?.revision!==r.revision||typeof r.recordedAt!=='string'||Number.isNaN(Date.parse(r.recordedAt)))throw Error('Invalid receipt');
      return r;
    } catch { throw new DataOperationError('RECEIPT_UNAVAILABLE','Recibo inconsistente. Preserve a intenção para revisão; não crie uma substituição automática.',503); }
  }
  private async authorize(actorId: number) {
    const actor = await this.db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('operator','admin')").bind(actorId).first();
    if (!actor) throw new DataOperationError('FORBIDDEN', 'Operador não autorizado.', 403);
  }
  private async schema() {
    const table = await this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='data_operations'").first();
    if (!table) throw new DataOperationError('DATA_SCHEMA_REQUIRED', 'Idempotência cadastral indisponível. A migration 0012 precisa de ativação autorizada.', 503);
  }
  async recover(actorId: number, rawKey: string): Promise<DataReceipt | null> {
    const key = operationKey(rawKey);
    await this.authorize(actorId); await this.schema();
    const row = await this.db.prepare('SELECT actor_id,response_json FROM data_operations WHERE operation_key=?').bind(key).first<{actor_id:number;response_json:string}>();
    if (!row || row.actor_id !== actorId) return null;
    if (row.response_json === 'null') return null;
    return this.receipt(row.response_json,key);
  }
  async execute(actorId: number, rawKey: string, method: DataMethod, payload: ParsedDataPayload): Promise<DataReceipt> {
    const key = operationKey(rawKey), fingerprint = await dataFingerprint(method,payload);
    await this.authorize(actorId); await this.schema();
    const duplicate = async () => {
      const row = await this.db.prepare('SELECT actor_id,request_hash,response_json FROM data_operations WHERE operation_key=?').bind(key).first<{actor_id:number;request_hash:string;response_json:string}>();
      if (!row) return null;
      if (row.actor_id !== actorId || row.request_hash !== fingerprint) throw new DataOperationError('OPERATION_KEY_CONFLICT', 'Esta chave já pertence a outra intenção. Não reenvie com dados diferentes.', 409);
      if (row.response_json === 'null') return null;
      return this.receipt(row.response_json,key);
    };
    const prior = await duplicate(); if (prior) return prior;
    const now = new Date().toISOString();
    // Persist only the validated intent binding first. A reservation is not a
    // confirmation; failures never release this key for a different payload.
    await this.db.prepare("INSERT INTO data_operations(operation_key,actor_id,method,kind,request_hash,response_json,recorded_at) VALUES(?,?,?,?,?,'null',?) ON CONFLICT(operation_key) DO NOTHING").bind(key,actorId,method,payload.kind,fingerprint,now).run();
    const alreadyConfirmed = await duplicate(); if (alreadyConfirmed) return alreadyConfirmed;
    const table = payload.kind === 'category' ? 'categories' : 'information';
    const snapshot = payload.kind === 'category'
      ? "json_object('id',id,'name',name,'description',description,'color',color,'scope',scope,'revision',revision)"
      : "json_object('id',id,'title',title,'categoryId',category_id,'responsible',responsible,'validation',validation,'contact',contact,'notes',notes,'kind',kind,'details',json(details_json),'revision',revision,'updated',updated_at)";
    const target = method === 'POST' ? 'last_insert_rowid()' : '?';
    const values = method === 'POST' ? [] : [(payload.data as {id:number}).id];
    try {
      await this.db.batch([
        dataWrite(this.db,method,payload,now,actorId,key),
        // changes() is the preceding top-level write, independent of trigger accounting.
        // A zero pending write makes NOT NULL fail, rolling back the mutation
        // and confirmation. A concurrent confirmed receipt is never overwritten.
        this.db.prepare(`UPDATE data_operations SET response_json=CASE WHEN changes()=1 THEN (SELECT json_object('key',?,'kind',?,'method',?,'entityId',id,'revision',revision,'recordedAt',?,'snapshot',${snapshot}) FROM ${table} WHERE id=${target}) ELSE NULL END WHERE operation_key=? AND response_json='null'`).bind(key,payload.kind,method,now,...values,key),
      ]);
    } catch (error) {
      const recovered = await duplicate(); if (recovered) return recovered;
      await this.authorize(actorId);
      if (String(error).includes('NOT NULL constraint failed: data_operations.response_json')) await explainDataWrite(this.db,method,payload);
      throw error;
    }
    const receipt = await duplicate();
    if (!receipt) throw new Error('Receipt unavailable');
    return receipt;
  }
}
